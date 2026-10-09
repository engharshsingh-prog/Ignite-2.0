import db, { toParticipant } from './_db.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { roll_number, whatsapp_number, email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!roll_number || !whatsapp_number || !normalizedEmail) {
      return res.status(400).json({ error: 'Email, roll number, and WhatsApp number are required' });
    }

    const row = await db
      .prepare('SELECT * FROM participants WHERE roll_number = ? AND whatsapp_number = ? AND lower(email) = lower(?) LIMIT 1')
      .get(roll_number, whatsapp_number, normalizedEmail);

    if (!row) return res.status(404).json({ error: 'No participant found with those credentials' });
    return res.status(200).json(toParticipant(row));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
