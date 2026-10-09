import crypto from 'crypto';
import db from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

async function ensureShareAccessRow() {
  let row = await db.prepare('SELECT * FROM participant_share_access WHERE id = 1').get();
  if (!row) {
    const token = crypto.randomBytes(24).toString('hex');
    await db.prepare('INSERT INTO participant_share_access (id, token, enabled, updated_at) VALUES (1, ?, 0, ?)').run(
      token,
      new Date().toISOString()
    );
    row = await db.prepare('SELECT * FROM participant_share_access WHERE id = 1').get();
  }
  return row;
}

function toResponsePayload(row) {
  const token = String(row?.token || '').trim();
  const sharePath = token ? `/records/${token}` : '';
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
      const row = await ensureShareAccessRow();
      return res.status(200).json(toResponsePayload(row));
    }

    if (req.method === 'POST') {
      const { enabled, regenerate } = req.body || {};
      const current = await ensureShareAccessRow();

      let nextEnabled = current.enabled ? 1 : 0;
      let nextToken = String(current.token || '');
      let action = null;

      if (typeof enabled === 'boolean') {
        nextEnabled = enabled ? 1 : 0;
        action = enabled ? 'registration_share_enabled' : 'registration_share_disabled';
      }

      if (regenerate === true) {
        nextToken = crypto.randomBytes(24).toString('hex');
        action = action ? `${action}_and_regenerated` : 'registration_share_regenerated';
      }

      if (!action) {
        return res.status(400).json({ error: 'Nothing to update. Provide enabled or regenerate.' });
      }

      const now = new Date().toISOString();
      await db.prepare('UPDATE participant_share_access SET token = ?, enabled = ?, updated_at = ? WHERE id = 1').run(
        nextToken,
        nextEnabled,
        now
      );

      await writeActivity({
        entity_type: 'participant_share_access',
        entity_id: 1,
        action,
        actor_email: admin.email,
        details: {
          enabled: Boolean(nextEnabled),
          regenerated: regenerate === true,
        },
      });

      const updated = await db.prepare('SELECT * FROM participant_share_access WHERE id = 1').get();
      return res.status(200).json(toResponsePayload(updated));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Participants share API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
