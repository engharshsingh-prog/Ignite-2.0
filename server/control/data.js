import db from '../_db.js';
import { requireSuperAdmin, getSuperAdminEmails } from '../_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    const { section = 'summary', search = '' } = req.query || {};
    const searchTerm = `%${String(search).trim()}%`;
    const superAdminSet = getSuperAdminEmails();

    if (section === 'summary') {
      const participantCount = (await db.prepare('SELECT COUNT(*) as c FROM participants').get())?.c || 0;
      const checkedInCount = (await db.prepare('SELECT COUNT(*) as c FROM participants WHERE check_in_status = 1').get())?.c || 0;
      const verifiedPaymentCount = (await db.prepare('SELECT COUNT(*) as c FROM participants WHERE payment_verified = 1').get())?.c || 0;
      const mediaCount = (await db.prepare('SELECT COUNT(*) as c FROM media').get())?.c || 0;
      const pendingMediaCount = (await db.prepare("SELECT COUNT(*) as c FROM media WHERE status = 'pending'").get())?.c || 0;
      const adminCount = (await db.prepare('SELECT COUNT(*) as c FROM auth_users').get())?.c || 0;
      const pendingApprovalCount = (await db.prepare("SELECT COUNT(*) as c FROM admin_access_requests WHERE status = 'pending'").get())?.c || 0;
      const activeSessionCount = (await db.prepare("SELECT COUNT(*) as c FROM auth_sessions WHERE status = 'active' AND expires_at > datetime('now')").get())?.c || 0;

      return res.status(200).json({
        participants: participantCount,
        checkedIn: checkedInCount,
        paymentsVerified: verifiedPaymentCount,
        media: mediaCount,
        pendingMedia: pendingMediaCount,
        admins: adminCount,
        pendingApprovals: pendingApprovalCount,
        activeSessions: activeSessionCount,
      });
    }

    if (section === 'participants') {
      const rows = search
        ? await db.prepare('SELECT * FROM participants WHERE full_name LIKE ? OR email LIKE ? OR roll_number LIKE ? ORDER BY id DESC').all(searchTerm, searchTerm, searchTerm)
        : await db.prepare('SELECT * FROM participants ORDER BY id DESC').all();
      return res.status(200).json({ data: rows || [] });
    }

    if (section === 'media') {
      const rows = await db.prepare('SELECT * FROM media ORDER BY id DESC').all();
      return res.status(200).json({ data: rows || [] });
    }

    if (section === 'activity_logs') {
      const rows = await db.prepare('SELECT * FROM activity_logs ORDER BY id DESC LIMIT 200').all();
      return res.status(200).json({ data: rows || [] });
    }

    if (section === 'winners') {
      const rows = await db.prepare('SELECT * FROM winners ORDER BY id DESC').all();
      return res.status(200).json({ data: rows || [] });
    }

    if (section === 'management_team') {
      const rows = await db.prepare('SELECT * FROM management_team ORDER BY id DESC').all();
      return res.status(200).json({ data: rows || [] });
    }

    if (section === 'event_settings') {
      const row = await db.prepare('SELECT * FROM event_settings WHERE id = 1').get();
      return res.status(200).json({ data: row || {} });
    }

    if (section === 'admins') {
      const rows = await db
        .prepare('SELECT id, email, role, status, is_approved, added_by, created_at, last_login_at FROM auth_users ORDER BY id ASC')
        .all();
      const enriched = (rows || []).map((u) => ({
        ...u,
        role: superAdminSet.has(String(u.email).trim().toLowerCase()) ? 'super_admin' : (u.role || 'admin'),
        is_configured_super_admin: superAdminSet.has(String(u.email).trim().toLowerCase()),
      }));
      return res.status(200).json({ data: enriched });
    }

    if (section === 'sessions') {
      const rows = await db
        .prepare(
          `
            SELECT s.id, s.user_id, u.email, s.status, s.ip, s.user_agent, s.created_at, s.last_seen_at, s.expires_at
            FROM auth_sessions s
            JOIN auth_users u ON u.id = s.user_id
            ORDER BY s.created_at DESC
            LIMIT 100
          `
        )
        .all();
      return res.status(200).json({ data: rows || [] });
    }

    return res.status(400).json({ error: 'Invalid section' });
  } catch (err) {
    console.error('Control data error:', err);
    return res.status(500).json({ error: err.message });
  }
}

