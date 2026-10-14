import crypto from 'crypto';
import db from './_db.js';
import { requireAdmin } from './_auth.js';

async function loadAccess() {
  let row = await db.prepare('SELECT * FROM validation_handler_access WHERE id = 1').get();
  if (!row) {
    const now = new Date().toISOString();
    const token = crypto.randomBytes(24).toString('hex');
    const passwordHash = crypto.createHash('sha256').update('ignite-handler-26').digest('hex');
    await db
      .prepare('INSERT INTO validation_handler_access (id, token, enabled, password_hash, updated_at) VALUES (1, ?, 0, ?, ?)')
      .run(token, passwordHash, now);
    row = await db.prepare('SELECT * FROM validation_handler_access WHERE id = 1').get();
  }
  return row;
}

function toPayload(row) {
  const token = String(row?.token || '');
  const sharePath = token ? `/validate/${token}` : '';
  const siteBase = String(process.env.PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '');
  return {
    enabled: Boolean(row?.enabled),
    token,
    share_path: sharePath,
    share_url: siteBase && sharePath ? `${siteBase}${sharePath}` : '',
    updated_at: row?.updated_at || null,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      return res.status(200).json(toPayload(await loadAccess()));
    }

    if (req.method === 'POST') {
      const { enabled, regenerate, password } = req.body || {};
      const current = await loadAccess();
      let nextToken = String(current.token || '');
      let nextEnabled = Boolean(current.enabled);
      let nextPasswordHash = String(current.password_hash || '');

      if (typeof enabled === 'boolean') nextEnabled = enabled;
      if (regenerate) nextToken = crypto.randomBytes(24).toString('hex');
      if (typeof password === 'string' && password.trim().length >= 4) {
        nextPasswordHash = crypto.createHash('sha256').update(password.trim()).digest('hex');
      }

      const now = new Date().toISOString();
      await db
        .prepare('UPDATE validation_handler_access SET token = ?, enabled = ?, password_hash = ?, updated_at = ? WHERE id = 1')
        .run(nextToken, nextEnabled ? 1 : 0, nextPasswordHash, now);

      return res.status(200).json(toPayload(await loadAccess()));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Validation handler access API error:', err);
    return res.status(500).json({ error: err.message || 'Failed to manage access' });
  }
}
