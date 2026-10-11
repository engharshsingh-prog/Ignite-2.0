import db from '../_db.js';
import { requireSuperAdmin } from '../_auth.js';
import { writeActivity } from '../_activity.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!['GET', 'DELETE'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });

  const superAdmin = await requireSuperAdmin(req, res);
  if (!superAdmin) return;

  try {
    if (req.method === 'DELETE') {
      const url = new URL(req.url || '/', 'http://localhost');
      const id = req.body?.id || req.query?.id || url.searchParams.get('id');
      const all = req.body?.all || req.query?.all || url.searchParams.get('all');

      if (all === 'true' || all === true) {
        await db.prepare("DELETE FROM admin_access_requests WHERE status != 'pending'").run();

        writeActivity({
          entity_type: 'admin_access_requests',
          entity_id: 0,
          action: 'clear_authorization_history',
          actor_email: superAdmin.email,
          details: { action: 'clear_all' },
        }).catch(() => {});

        return res.status(200).json({ ok: true, message: 'All authorization history cleared.' });
      }

      if (!id) {
        return res.status(400).json({ error: 'id is required' });
      }

      const target = await db.prepare('SELECT id, email, status FROM admin_access_requests WHERE id = ? LIMIT 1').get(id);
      if (!target) {
        return res.status(404).json({ error: 'Record not found' });
      }

      await db.prepare('DELETE FROM admin_access_requests WHERE id = ?').run(id);

      writeActivity({
        entity_type: 'admin_access_requests',
        entity_id: 0,
        action: 'delete_authorization_record',
        actor_email: superAdmin.email,
        details: { request_id: id, target_email: target.email, status: target.status },
      }).catch(() => {});

      return res.status(200).json({ ok: true, message: 'Authorization history record removed.' });
    }
    const nowIso = new Date().toISOString();

    // Expire any pending requests that have passed expires_at
    await db
      .prepare(
        `
          UPDATE admin_access_requests 
          SET status = 'expired', resolved_at = datetime('now')
          WHERE status = 'pending' AND expires_at < ?
        `
      )
      .run(nowIso);

    // Also revoke the corresponding pending sessions for expired requests
    await db
      .prepare(
        `
          UPDATE auth_sessions 
          SET status = 'revoked'
          WHERE status = 'pending' AND id IN (
            SELECT session_id FROM admin_access_requests WHERE status = 'expired'
          )
        `
      )
      .run();

    // Fetch pending requests
    const pending = await db
      .prepare(
        `
          SELECT id, user_id, email, ip, user_agent, status, requested_at, expires_at
          FROM admin_access_requests
          WHERE status = 'pending'
          ORDER BY requested_at DESC
        `
      )
      .all();

    // Fetch recent 20 resolved requests
    const recent = await db
      .prepare(
        `
          SELECT id, user_id, email, ip, user_agent, status, requested_at, expires_at, resolved_at, resolved_by
          FROM admin_access_requests
          WHERE status != 'pending'
          ORDER BY requested_at DESC
          LIMIT 20
        `
      )
      .all();

    return res.status(200).json({
      pending: pending || [],
      recent: recent || [],
      count: (pending || []).length,
    });
  } catch (err) {
    console.error('Approvals fetch error:', err);
    return res.status(500).json({ error: err.message });
  }
}

