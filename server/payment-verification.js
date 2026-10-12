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

    const { id, payment_verified, payment_status, reason } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Participant ID required' });

    let nextStatus = 'pending_verification';
    let nextVerified = 0;
    let nextReason = null;
    let nextVerifiedAt = null;
    let nextVerifiedBy = null;

    if (payment_status === 'approved' || (payment_status === undefined && payment_verified === true)) {
      nextStatus = 'approved';
      nextVerified = 1;
      nextVerifiedAt = new Date().toISOString();
      nextVerifiedBy = admin.email;
    } else if (payment_status === 'rejected') {
      nextStatus = 'rejected';
      nextVerified = 0;
      nextReason = String(reason || 'Payment rejected by administrator').trim();
    } else if (payment_status === 'pending_verification' || (payment_status === undefined && payment_verified === false)) {
      nextStatus = 'pending_verification';
      nextVerified = 0;
    } else {
      return res.status(400).json({ error: 'Invalid payment verification parameters' });
    }

    const previous = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
    if (!previous) return res.status(404).json({ error: 'Participant not found' });

    await db
      .prepare(
        `
          UPDATE participants
          SET payment_verified = ?,
              payment_status = ?,
              payment_rejected_reason = ?,
              payment_verified_at = ?,
              payment_verified_by = ?
          WHERE id = ?
        `
      )
      .run(nextVerified, nextStatus, nextReason, nextVerifiedAt, nextVerifiedBy, id);

    const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(id));

    await writeActivity({
      entity_type: 'participant',
      entity_id: updated.id,
      action: nextStatus === 'approved' ? 'payment_approved' : nextStatus === 'rejected' ? 'payment_rejected' : 'payment_unverified',
      actor_email: admin.email,
      details: {
        full_name: updated.full_name,
        roll_number: updated.roll_number,
        payment_id: updated.payment_id,
        account_holder_name: updated.account_holder_name,
        payment_status: nextStatus,
        rejection_reason: nextReason,
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
