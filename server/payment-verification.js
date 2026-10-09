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

    const { id, payment_verified } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Participant ID required' });
    if (typeof payment_verified !== 'boolean') {
      return res.status(400).json({ error: 'payment_verified must be true or false' });
    }

    const previous = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ error: 'Participant not found' });

    await db.prepare('UPDATE participants SET payment_verified = ? WHERE id = ?').run(payment_verified ? 1 : 0, id);

    const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(id));

    await writeActivity({
      entity_type: 'participant',
      entity_id: updated.id,
      action: payment_verified ? 'payment_verified' : 'payment_unverified',
      actor_email: admin.email,
      details: {
        full_name: updated.full_name,
        roll_number: updated.roll_number,
        previous_payment_verified: Boolean(previous.payment_verified),
        new_payment_verified: updated.payment_verified,
      },
    });

    return res.status(200).json(updated);
  } catch (err) {
    console.error('Payment verification API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
