import db from './_db.js';
import { storeMediaUpload } from './_media-storage.js';

function normalizeImageUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';

  const drivePatterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/,
    /\/uc\?(?:[^#\s]*&)?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of drivePatterns) {
    const match = value.match(pattern);
    if (match?.[1]) {
      return `https://lh3.googleusercontent.com/d/${match[1]}`;
    }
  }

  if (value.includes('dropbox.com')) {
    return value.replace(/[?&]dl=0/, '?raw=1');
  }

  return value;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const rows = await db.prepare('SELECT * FROM winners ORDER BY created_at ASC').all();
      const normalized = (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        image_url: normalizeImageUrl(row.image_url),
      }));
      return res.status(200).json(normalized);
    }

    if (req.method === 'POST') {
      const { participant_id, name, roll_no, branch, award_title, image_url, description } = req.body;
      if (!name || !award_title) return res.status(400).json({ error: 'Name and award title are required' });

      let finalImageUrl = normalizeImageUrl(image_url);
      if (finalImageUrl.startsWith('data:image/')) {
        try {
          const uploadResult = await storeMediaUpload({
            category: 'winners',
            originalDataUrl: finalImageUrl,
          });
          if (uploadResult?.url) {
            finalImageUrl = uploadResult.url;
          }
        } catch (uploadErr) {
          console.error('Failed to store winner image upload:', uploadErr);
        }
      }

      const result = await db
        .prepare(
          'INSERT INTO winners (participant_id, name, roll_no, branch, award_title, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)'
        )
        .run(participant_id || null, name, roll_no || '', branch || '', award_title, finalImageUrl || '', description || '');
      const row = await db.prepare('SELECT * FROM winners WHERE id = ?').get(result.lastInsertRowid);
      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const { id, participant_id, name, roll_no, branch, award_title, image_url, description } = req.body;
      if (!id || !name || !award_title) return res.status(400).json({ error: 'ID, name and award title are required' });

      let finalImageUrl = normalizeImageUrl(image_url);
      if (finalImageUrl.startsWith('data:image/')) {
        try {
          const uploadResult = await storeMediaUpload({
            category: 'winners',
            originalDataUrl: finalImageUrl,
          });
          if (uploadResult?.url) {
            finalImageUrl = uploadResult.url;
          }
        } catch (uploadErr) {
          console.error('Failed to store winner image upload:', uploadErr);
        }
      }

      await db
        .prepare(
          'UPDATE winners SET participant_id = ?, name = ?, roll_no = ?, branch = ?, award_title = ?, image_url = ?, description = ? WHERE id = ?'
        )
        .run(participant_id || null, name, roll_no || '', branch || '', award_title, finalImageUrl || '', description || '', id);

      const row = await db.prepare('SELECT * FROM winners WHERE id = ?').get(id);
      return res.status(200).json(row);
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
