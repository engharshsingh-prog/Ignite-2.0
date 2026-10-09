import db from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const rows = await db.prepare('SELECT * FROM winners ORDER BY created_at ASC').all();
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const { participant_id, name, roll_no, branch, award_title, image_url, description } = req.body;
      if (!name || !award_title) return res.status(400).json({ error: 'Name and award title are required' });
      const result = await db
        .prepare(
          'INSERT INTO winners (participant_id, name, roll_no, branch, award_title, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(participant_id || null, name, roll_no || '', branch || '', award_title, image_url || '', description || '');
      const row = await db.prepare('SELECT * FROM winners WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json(row);
    }

    if (req.method === 'DELETE') {
      const { id } = req.body;
      if (!id) return res.status(400).json({ error: 'Winner ID required' });
      await db.prepare('DELETE FROM winners WHERE id = ?').run(id);
      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Winners API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
