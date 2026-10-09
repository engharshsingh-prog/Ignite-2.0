import db, { toParticipant } from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { id, check_in_status } = req.body;
    if (!id) return res.status(400).json({ error: 'Participant ID required' });

    const previous = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ error: 'Participant not found' });

    const checkInTime = check_in_status ? new Date().toISOString() : null;
    const result = await db
      .prepare('UPDATE participants SET check_in_status = ?, check_in_time = ? WHERE id = ?')
      .run(check_in_status ? 1 : 0, checkInTime, id);

    if (result.changes === 0) return res.status(404).json({ error: 'Participant not found' });

    const row = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    const updated = toParticipant(row);

    await writeActivity({
      entity_type: 'participant',
      entity_id: updated.id,
      action: check_in_status ? 'checkin_marked' : 'checkin_reverted',
      actor_email: admin.email,
      details: {
        full_name: updated.full_name,
        roll_number: updated.roll_number,
        previous_check_in_status: Boolean(previous.check_in_status),
        new_check_in_status: updated.check_in_status,
      },
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error('Check-in error:', err);
    return res.status(500).json({ error: err.message });
  }
}
