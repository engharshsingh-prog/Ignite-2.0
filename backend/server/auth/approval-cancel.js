import db from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { request_id, token } = req.body || {};
    if (!request_id && !token) {
      return res.status(400).json({ error: 'request_id or token required' });
    }

    const request = await db
      .prepare(
        'SELECT id, session_id, status FROM admin_access_requests WHERE id = ? OR session_id = ? LIMIT 1'
      )
      .get(request_id || '__none__', token || '__none__');

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    if (request.status === 'pending') {
      await db
        .prepare("UPDATE admin_access_requests SET status = 'canceled', resolved_at = datetime('now') WHERE id = ?")
        .run(request.id);
      await db
        .prepare("UPDATE auth_sessions SET status = 'revoked' WHERE id = ?")
        .run(request.session_id);
    }

    return res.status(200).json({ ok: true, status: 'canceled' });
  } catch (err) {
    console.error('Approval cancel error:', err);
    return res.status(500).json({ error: err.message });
  }
}

