import crypto from 'crypto';
import db from '../_db.js';
import { isAllowedAdminEmail } from '../_auth.js';

function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = storedHash.split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
  return key.toString('hex') === keyHex;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    const normalizedEmail = String(email).trim().toLowerCase();

    if (!isAllowedAdminEmail(normalizedEmail)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = await db.prepare('SELECT id, email, password_hash FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1').get(normalizedEmail);

    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await db.prepare('INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expiresAt);

    return res.status(200).json({ user: { id: user.id, email: user.email }, token });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
}
