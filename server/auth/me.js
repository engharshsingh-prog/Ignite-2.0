import { getAdminFromRequest } from '../_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const row = await getAdminFromRequest(req);
    if (!row) return res.status(401).json({ error: 'Invalid or expired token' });
    return res.status(200).json({ user: { id: row.id, email: row.email } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
