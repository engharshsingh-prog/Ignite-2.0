import db from './_db.js';
import { requireSuperAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

async function getRow() {
  let row = await db.prepare('SELECT * FROM public_media_control WHERE id = 1').get();
  if (!row) {
    await db.prepare('INSERT INTO public_media_control (id, enabled, updated_at) VALUES (1, 1, ?)').run(new Date().toISOString());
    row = await db.prepare('SELECT * FROM public_media_control WHERE id = 1').get();
  }
  return row;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const row = await getRow();
      return res.status(200).json({ enabled: Boolean(row.enabled), updated_at: row.updated_at || null });
    }

    if (req.method === 'PUT') {
      const superAdmin = await requireSuperAdmin(req, res);
      if (!superAdmin) return;

      const enabled = req.body?.enabled;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be boolean' });
      }

      const now = new Date().toISOString();
      await db.prepare('UPDATE public_media_control SET enabled = ?, updated_at = ? WHERE id = 1').run(enabled ? 1 : 0, now);

      await writeActivity({
        entity_type: 'public_media_control',
        entity_id: 1,
        action: enabled ? 'public_media_upload_enabled' : 'public_media_upload_disabled',
        actor_email: superAdmin.email,
        details: { enabled },
      });

      return res.status(200).json({ enabled, updated_at: now });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Public media control API error:', err);
    return res.status(500).json({ error: err.message });
  }
}

