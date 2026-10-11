import db from './_db.js';
import { toActivityLog } from './_activity.js';
import { requireAdmin } from './_auth.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const requestedLimit = Number(req.query.limit || 40);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 200) : 40;

    const rows = (await db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit)).map(toActivityLog);

    return res.status(200).json(rows);
  } catch (err) {
    console.error('Activity logs API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
