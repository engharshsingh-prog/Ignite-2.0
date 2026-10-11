import db from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

async function getRow() {
  let row = await db.prepare('SELECT * FROM registration_control WHERE id = 1').get();
  if (!row) {
    await db.prepare('INSERT INTO registration_control (id, enabled, updated_at) VALUES (1, 1, ?)').run(new Date().toISOString());
    row = await db.prepare('SELECT * FROM registration_control WHERE id = 1').get();
  }
  return row;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const row = await getRow();
      return res.status(200).json({ enabled: Boolean(row.enabled), updated_at: row.updated_at || null });
    }

    if (req.method === 'PUT') {
      const enabled = req.body?.enabled;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ error: 'enabled must be boolean' });
      }

      const now = new Date().toISOString();
      await db.prepare('UPDATE registration_control SET enabled = ?, updated_at = ? WHERE id = 1').run(enabled ? 1 : 0, now);

      await writeActivity({
        entity_type: 'registration_control',
        entity_id: 1,
        action: enabled ? 'registrations_enabled' : 'registrations_disabled',
        actor_email: admin.email,
        details: { enabled },
      });

      return res.status(200).json({ enabled, updated_at: now });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Registration control API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
