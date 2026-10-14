import db from '../_db.js';
import { requireSuperAdmin } from '../_auth.js';
import { writeActivity } from '../_activity.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    if (req.method === 'GET') {
      const rows = await db
        .prepare(
          `
            SELECT 
              s.id as session_id,
              s.user_id,
              u.email,
              u.role,
              s.status,
              s.ip,
              s.user_agent,
              s.created_at,
              s.last_seen_at,
              s.expires_at
            FROM auth_sessions s
            JOIN auth_users u ON u.id = s.user_id
            ORDER BY s.created_at DESC
            LIMIT 100
          `
        )
        .all();

      // Return metadata only, masking raw token ID for safety
      const sanitized = (rows || []).map((s) => ({
        id: s.session_id,
        masked_id: s.session_id.slice(0, 6) + '...' + s.session_id.slice(-6),
        user_id: s.user_id,
        email: s.email,
        role: s.role,
        status: s.status,
        ip: s.ip || 'Unknown',
        user_agent: s.user_agent || 'Unknown',
        created_at: s.created_at,
        last_seen_at: s.last_seen_at,
        expires_at: s.expires_at,
        is_current: s.session_id === superAdmin.session_id,
      }));

      return res.status(200).json({ sessions: sanitized });
    }

    if (req.method === 'DELETE') {
      const { session_id } = req.body || req.query || {};
      if (!session_id) {
        return res.status(400).json({ error: 'session_id is required' });
      }

      const session = await db
        .prepare('SELECT s.id, u.email FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.id = ? LIMIT 1')
        .get(session_id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      await db.prepare("UPDATE auth_sessions SET status = 'revoked' WHERE id = ?").run(session_id);

      await writeActivity({
        entity_type: 'admin_sessions',
        entity_id: null,
        action: 'revoke_session',
        actor_email: superAdmin.email,
        details: { target_email: session.email, session_id: session_id.slice(0, 8) + '...' },
      });

      return res.status(200).json({ ok: true, message: 'Session revoked successfully.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Session management error:', err);
    return res.status(500).json({ error: err.message });
  }
}

