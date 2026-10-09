import db, { toParticipant } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const token = String(req.query?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'Token is required' });

    const access = await db.prepare('SELECT * FROM participant_share_access WHERE id = 1').get();
    if (!access || !access.enabled) {
      return res.status(403).json({ error: 'Shared access is currently disabled' });
    }
    if (String(access.token || '') !== token) {
      return res.status(403).json({ error: 'Invalid share token' });
    }

    const rows = (await db.prepare('SELECT * FROM participants ORDER BY registered_at DESC').all()).map(toParticipant);
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Public participants API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
