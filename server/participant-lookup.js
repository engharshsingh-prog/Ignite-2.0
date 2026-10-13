import db, { toParticipant } from './_db.js';

async function getVerifiedFirebaseEmail(req) {
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  const apiKey = process.env.FIREBASE_WEB_API_KEY || process.env.VITE_FIREBASE_API_KEY;
  if (!token || !apiKey) return null;

  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const firebaseUser = payload?.users?.[0];
  if (!firebaseUser?.email || firebaseUser.emailVerified !== true) return null;
  return String(firebaseUser.email).trim().toLowerCase();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { roll_number, whatsapp_number, email } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Email is required' });
    }

    let row;
    if (roll_number && whatsapp_number) {
      row = await db
        .prepare('SELECT * FROM participants WHERE roll_number = ? AND whatsapp_number = ? AND lower(email) = lower(?) LIMIT 1')
        .get(roll_number, whatsapp_number, normalizedEmail);
    } else {
      const authenticatedEmail = await getVerifiedFirebaseEmail(req);
      if (!authenticatedEmail || authenticatedEmail !== normalizedEmail) {
        return res.status(401).json({ error: 'Sign in with the registered, verified Google account or provide all lookup details.' });
      }
      row = await db
        .prepare('SELECT * FROM participants WHERE lower(email) = lower(?) ORDER BY id DESC LIMIT 1')
        .get(normalizedEmail);
    }

    if (!row) return res.status(404).json({ error: 'No participant found with those credentials' });
    return res.status(200).json(toParticipant(row));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
