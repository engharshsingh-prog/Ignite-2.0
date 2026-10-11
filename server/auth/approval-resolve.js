import db from '../_db.js';
import { requireSuperAdmin } from '../_auth.js';
import { writeActivity } from '../_activity.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    const { request_id, action } = req.body || {};
    if (!request_id || !['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'request_id and valid action (approve/reject) required' });
    }

    const request = await db
      .prepare(
        'SELECT id, user_id, email, session_id, status, expires_at FROM admin_access_requests WHERE id = ? LIMIT 1'
      )
      .get(request_id);

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({ error: `Request is already ${request.status}` });
    }

    // Check expiration
    if (new Date(request.expires_at).getTime() < Date.now()) {
      await db
        .prepare("UPDATE admin_access_requests SET status = 'expired', resolved_at = datetime('now') WHERE id = ?")
        .run(request.id);
      await db
        .prepare("UPDATE auth_sessions SET status = 'revoked' WHERE id = ?")
        .run(request.session_id);
      return res.status(400).json({ error: 'Request has expired and cannot be approved.' });
    }

    // A super admin cannot approve a request made by themselves
    if (String(request.email).trim().toLowerCase() === String(superAdmin.email).trim().toLowerCase()) {
      return res.status(403).json({ error: 'Super admins cannot approve their own login requests.' });
    }

    if (action === 'approve') {
      await db
        .prepare(
          `
            UPDATE admin_access_requests 
            SET status = 'approved', resolved_at = datetime('now'), resolved_by = ?
            WHERE id = ?
          `
        )
        .run(superAdmin.email, request.id);

      await db
        .prepare("UPDATE auth_sessions SET status = 'active' WHERE id = ?")
        .run(request.session_id);

      await db
        .prepare("UPDATE auth_users SET is_approved = 1, last_login_at = datetime('now') WHERE id = ?")
        .run(request.user_id);

      await writeActivity({
        entity_type: 'admin_login_approval',
        entity_id: request.user_id,
        action: 'approve_login',
        actor_email: superAdmin.email,
        details: { request_id: request.id, target_email: request.email },
      });

      return res.status(200).json({ ok: true, status: 'approved', request_id: request.id });
    }

    if (action === 'reject') {
      await db
        .prepare(
          `
            UPDATE admin_access_requests 
            SET status = 'rejected', resolved_at = datetime('now'), resolved_by = ?
            WHERE id = ?
          `
        )
        .run(superAdmin.email, request.id);

      await db
        .prepare("UPDATE auth_sessions SET status = 'revoked' WHERE id = ?")
        .run(request.session_id);

      await writeActivity({
        entity_type: 'admin_login_approval',
        entity_id: request.user_id,
        action: 'reject_login',
        actor_email: superAdmin.email,
        details: { request_id: request.id, target_email: request.email },
      });

      return res.status(200).json({ ok: true, status: 'rejected', request_id: request.id });
    }
  } catch (err) {
    console.error('Approval resolve error:', err);
    return res.status(500).json({ error: err.message });
  }
}

