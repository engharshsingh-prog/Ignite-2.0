import db from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const requestId = String(req.query?.request_id || req.query?.id || '').trim();
    const token = String(req.query?.token || '').trim();

    if (!requestId && !token) {
      return res.status(400).json({ error: 'request_id or token is required' });
    }

    const request = await db
      .prepare(
        `
          SELECT r.id, r.user_id, r.email, r.session_id, r.status, r.expires_at, s.status as session_status
          FROM admin_access_requests r
          LEFT JOIN auth_sessions s ON s.id = r.session_id
          WHERE r.id = ? OR r.session_id = ?
          LIMIT 1
        `
      )
      .get(requestId || '__none__', token || '__none__');

    if (!request) {
      return res.status(404).json({ error: 'Approval request not found' });
    }

    // Check expiration
    if (request.status === 'pending' && new Date(request.expires_at).getTime() < Date.now()) {
      await db
        .prepare("UPDATE admin_access_requests SET status = 'expired', resolved_at = datetime('now') WHERE id = ?")
        .run(request.id);
      await db
        .prepare("UPDATE auth_sessions SET status = 'revoked' WHERE id = ?")
        .run(request.session_id);
      return res.status(200).json({ status: 'expired', message: 'Approval request has expired.' });
    }

    if (request.status === 'approved' && request.session_status === 'active') {
      return res.status(200).json({
        status: 'approved',
        token: request.session_id,
        user: { id: request.user_id, email: request.email },
      });
    }

    return res.status(200).json({
      status: request.status,
      expires_at: request.expires_at,
    });
  } catch (err) {
    console.error('Approval status error:', err);
    return res.status(500).json({ error: err.message });
  }
}

