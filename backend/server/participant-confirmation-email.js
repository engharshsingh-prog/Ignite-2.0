import db, { toParticipant } from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';
import { sendRegistrationConfirmationEmail } from './_mailer.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Participant ID required' });

    const row = await db.prepare('SELECT * FROM participants WHERE id = ? LIMIT 1').get(id);
    if (!row) return res.status(404).json({ error: 'Participant not found' });

    const participant = toParticipant(row);
    await sendRegistrationConfirmationEmail(participant);

    await writeActivity({
      entity_type: 'participant',
      entity_id: participant.id,
      action: 'registration_confirmation_resent',
      actor_email: admin.email,
      details: {
        participant_email: participant.email,
        participant_name: participant.full_name,
      },
    });

    return res.status(200).json({
      ok: true,
      message: `Registration details sent to ${participant.email}`,
    });
  } catch (err) {
    console.error('Participant confirmation resend error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send registration details' });
  }
}
