import db, { hashPassword } from '../_db.js';
import { requireSuperAdmin, getSuperAdminEmails } from '../_auth.js';
import { writeActivity } from '../_activity.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  const superAdminSet = getSuperAdminEmails();

  try {
    // GET: List all admins
    if (req.method === 'GET') {
      const rows = await db
        .prepare('SELECT id, email, role, status, is_approved, added_by, created_at, last_login_at FROM auth_users ORDER BY id ASC')
        .all();

      const admins = (rows || []).map((u) => {
        const isSuper = superAdminSet.has(String(u.email).trim().toLowerCase());
        return {
          id: u.id,
          email: u.email,
          role: isSuper ? 'super_admin' : (u.role || 'admin'),
          status: isSuper ? 'active' : (u.status || 'active'),
          is_approved: isSuper ? true : Boolean(u.is_approved),
          added_by: u.added_by || 'system',
          created_at: u.created_at,
          last_login_at: u.last_login_at,
          is_super_admin: isSuper,
        };
      });

      return res.status(200).json({ admins });
    }

    // POST: Add new admin
    if (req.method === 'POST') {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required' });
      }

      const normalizedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }

      if (typeof password !== 'string' || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long' });
      }

      if (superAdminSet.has(normalizedEmail)) {
        return res.status(400).json({ error: 'This email is already configured as a Super Admin in server environment.' });
      }

      const existing = await db
        .prepare('SELECT id, email, status FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1')
        .get(normalizedEmail);

      if (existing) {
        if (existing.status === 'suspended') {
          return res.status(409).json({ error: 'An admin with this email already exists but is suspended. You can reactivate them.' });
        }
        return res.status(409).json({ error: 'An admin with this email already exists.' });
      }

      const hashedPassword = hashPassword(password);
      const result = await db
        .prepare(
          `
            INSERT INTO auth_users (email, password_hash, role, status, is_approved, added_by, created_at)
            VALUES (?, ?, 'admin', 'active', 1, ?, datetime('now'))
          `
        )
        .run(normalizedEmail, hashedPassword, superAdmin.email);

      await writeActivity({
        entity_type: 'admin_management',
        entity_id: result.lastInsertRowid,
        action: 'create_admin',
        actor_email: superAdmin.email,
        details: { email: normalizedEmail, added_by: superAdmin.email },
      });

      return res.status(201).json({
        ok: true,
        message: 'Admin account created successfully.',
        admin: {
          id: result.lastInsertRowid,
          email: normalizedEmail,
          role: 'admin',
          status: 'active',
          is_approved: true,
          added_by: superAdmin.email,
        },
      });
    }

    // PUT: Update admin (suspend / activate / reset password / toggle approval / change role)
    if (req.method === 'PUT') {
      const { id, email, status, new_password, is_approved, role } = req.body || {};
      const targetUser = id
        ? await db.prepare('SELECT id, email, role, status FROM auth_users WHERE id = ? LIMIT 1').get(id)
        : await db.prepare('SELECT id, email, role, status FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1').get(String(email).trim().toLowerCase());

      if (!targetUser) {
        return res.status(404).json({ error: 'Admin user not found' });
      }

      const targetEmail = String(targetUser.email).trim().toLowerCase();
      const currentActorEmail = String(superAdmin.email).trim().toLowerCase();

      // Super admins configured in env cannot be suspended or demoted
      if (superAdminSet.has(targetEmail) && (status === 'suspended' || is_approved === false || (role && role !== 'super_admin'))) {
        return res.status(403).json({ error: 'Super Admin status cannot be edited, suspended or demoted through the UI.' });
      }

      // Current super admin cannot suspend, demote or revoke themselves
      if (targetEmail === currentActorEmail && (status === 'suspended' || is_approved === false || (role && role !== 'super_admin'))) {
        return res.status(403).json({ error: 'A Super Admin cannot revoke or demote themselves.' });
      }

      if (role && ['admin', 'super_admin'].includes(role)) {
        await db.prepare('UPDATE auth_users SET role = ? WHERE id = ?').run(role, targetUser.id);
        await writeActivity({
          entity_type: 'admin_management',
          entity_id: targetUser.id,
          action: 'change_admin_role',
          actor_email: superAdmin.email,
          details: { target_email: targetEmail, new_role: role },
        });
      }

      if (status && ['active', 'suspended'].includes(status)) {
        await db.prepare('UPDATE auth_users SET status = ? WHERE id = ?').run(status, targetUser.id);

        if (status === 'suspended') {
          // Immediately revoke all sessions for this user
          await db.prepare("UPDATE auth_sessions SET status = 'revoked' WHERE user_id = ?").run(targetUser.id);
        }

        await writeActivity({
          entity_type: 'admin_management',
          entity_id: targetUser.id,
          action: status === 'suspended' ? 'suspend_admin' : 'activate_admin',
          actor_email: superAdmin.email,
          details: { target_email: targetEmail, status },
        });
      }

      if (typeof is_approved === 'boolean') {
        await db.prepare('UPDATE auth_users SET is_approved = ? WHERE id = ?').run(is_approved ? 1 : 0, targetUser.id);

        if (!is_approved) {
          // If approval is revoked, revoke active sessions
          await db.prepare("UPDATE auth_sessions SET status = 'revoked' WHERE user_id = ?").run(targetUser.id);
        }

        await writeActivity({
          entity_type: 'admin_management',
          entity_id: targetUser.id,
          action: is_approved ? 'approve_admin_access' : 'revoke_admin_approval',
          actor_email: superAdmin.email,
          details: { target_email: targetEmail, is_approved },
        });
      }

      if (new_password) {
        if (typeof new_password !== 'string' || new_password.length < 8) {
          return res.status(400).json({ error: 'Password must be at least 8 characters long' });
        }
        const hashedPassword = hashPassword(new_password);
        await db.prepare('UPDATE auth_users SET password_hash = ? WHERE id = ?').run(hashedPassword, targetUser.id);

        // Revoke active sessions to force re-login
        await db.prepare("UPDATE auth_sessions SET status = 'revoked' WHERE user_id = ?").run(targetUser.id);

        await writeActivity({
          entity_type: 'admin_management',
          entity_id: targetUser.id,
          action: 'reset_admin_password',
          actor_email: superAdmin.email,
          details: { target_email: targetEmail },
        });
      }

      return res.status(200).json({ ok: true, message: 'Admin updated successfully.' });
    }

    // DELETE: Remove admin
    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', 'http://localhost');
      const id = req.body?.id || req.query?.id || url.searchParams.get('id');
      const email = req.body?.email || req.query?.email || url.searchParams.get('email');

      if (!id && !email) {
        return res.status(400).json({ error: 'Admin id or email is required' });
      }

      const targetUser = id
        ? await db.prepare('SELECT id, email FROM auth_users WHERE id = ? LIMIT 1').get(id)
        : await db.prepare('SELECT id, email FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1').get(String(email).trim().toLowerCase());

      if (!targetUser) {
        return res.status(404).json({ error: 'Admin user not found' });
      }

      const targetEmail = String(targetUser.email).trim().toLowerCase();
      const currentActorEmail = String(superAdmin.email).trim().toLowerCase();
      if (superAdminSet.has(targetEmail) || targetEmail === currentActorEmail) {
        return res.status(403).json({ error: 'Super Admin accounts cannot be removed.' });
      }

      // Revoke all sessions, clean up access requests, and delete user
      await db.prepare("UPDATE auth_sessions SET status = 'revoked' WHERE user_id = ?").run(targetUser.id);
      await db.prepare('DELETE FROM admin_access_requests WHERE user_id = ? OR lower(trim(email)) = ?').run(targetUser.id, targetEmail);
      await db.prepare('DELETE FROM auth_users WHERE id = ?').run(targetUser.id);

      await writeActivity({
        entity_type: 'admin_management',
        entity_id: targetUser.id,
        action: 'remove_admin',
        actor_email: superAdmin.email,
        details: { target_email: targetEmail },
      });

      return res.status(200).json({ ok: true, message: 'Admin removed successfully.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin management error:', err);
    return res.status(500).json({ error: err.message });
  }
}

