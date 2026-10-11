import crypto from 'node:crypto';
import db, { toParticipant } from './_db.js';
import { requireAdmin, getSuperAdminEmails } from './_auth.js';
import { writeActivity } from './_activity.js';
import {
  sendParticipantApprovalRequestToAdmin,
  sendParticipantRegistrationApprovedEmail,
  sendParticipantRegistrationRejectedEmail,
  sendRegistrationConfirmationEmail,
} from './_mailer.js';

export function getBaseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const origin = req?.headers?.origin || req?.headers?.referer;
  if (origin) {
    try {
      const u = new URL(origin);
      return `${u.protocol}//${u.host}`;
    } catch {}
  }
  const host = req?.headers?.host;
  if (host) {
    const proto = req?.headers?.['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return 'http://localhost:5173';
}

export async function getAuthorizedAdminEmails() {
  const superEmails = getSuperAdminEmails();
  const allEmails = new Set(superEmails);
  try {
    const users = await db.prepare("SELECT email FROM auth_users WHERE status = 'active'").all();
    for (const u of users) {
      if (u?.email) allEmails.add(String(u.email).trim().toLowerCase());
    }
  } catch (err) {
    console.error('Error fetching admin emails:', err);
  }
  return Array.from(allEmails);
}

// 1. GET /api/registration-approvals - List pending/all registration approval requests (Admin only)
export async function handleGetRegistrationApprovals(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const status = String(req.query?.status || 'all').toLowerCase();
  let where = '1=1';
  const params = [];

  if (status && status !== 'all') {
    where += ' AND approval_status = ?';
    params.push(status);
  }

  const rows = (await db.prepare(`SELECT * FROM participants WHERE ${where} ORDER BY registered_at DESC`).all(...params)).map(toParticipant);
  return res.status(200).json(rows);
}

// 2. POST /api/registration-approvals/resolve - Approve or Reject registration (Admin only)
export async function handleResolveRegistrationApproval(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { participant_id, action, reason } = req.body || {};
  if (!participant_id) return res.status(400).json({ error: 'Participant ID is required' });
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Action must be approve or reject' });
  }

  const existing = await db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id);
  if (!existing) return res.status(404).json({ error: 'Participant not found' });

  const baseUrl = getBaseUrl(req);
  const now = new Date().toISOString();

  if (action === 'approve') {
    let token = existing.step2_token;
    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
    }
    const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db
      .prepare(
        `
          UPDATE participants
          SET approval_status = 'approved',
              approved_by = ?,
              approved_at = ?,
              rejected_by = NULL,
              rejected_at = NULL,
              rejection_reason = NULL,
              step2_token = ?,
              step2_token_expires_at = ?
          WHERE id = ?
        `
      )
      .run(admin.email, now, token, tokenExpiresAt, participant_id);

    const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id));

    // Send approval email with continuation link
    const step2Url = `${baseUrl}/register?step=2&token=${token}&regId=${updated.registration_id}`;
    let emailSent = false;
    let emailError = null;

    try {
      await sendParticipantRegistrationApprovedEmail({ participant: updated, step2Url });
      emailSent = true;
      await db.prepare('UPDATE participants SET approval_email_sent = 1, approval_email_error = NULL WHERE id = ?').run(participant_id);
    } catch (mailErr) {
      emailError = mailErr?.message || 'Failed to send approval email';
      await db.prepare('UPDATE participants SET approval_email_sent = 0, approval_email_error = ? WHERE id = ?').run(emailError, participant_id);
      console.error('Approval email error:', mailErr);
    }

    await writeActivity({
      entity_type: 'participant',
      entity_id: updated.id,
      action: 'registration_approved',
      actor_email: admin.email,
      details: {
        registration_id: updated.registration_id,
        participant_name: updated.full_name,
        participant_email: updated.email,
        email_sent: emailSent,
        email_error: emailError,
      },
    });

    return res.status(200).json({
      ok: true,
      message: emailSent
        ? 'Registration approved and approval email sent to participant.'
        : 'Registration approved, but approval email could not be sent (you can retry sending).',
      participant: updated,
      email_sent: emailSent,
      email_error: emailError,
    });
  }

  if (action === 'reject') {
    const cleanReason = String(reason || '').trim() || 'Registration details could not be verified.';

    await db
      .prepare(
        `
          UPDATE participants
          SET approval_status = 'rejected',
              rejected_by = ?,
              rejected_at = ?,
              rejection_reason = ?,
              approved_by = NULL,
              approved_at = NULL
          WHERE id = ?
        `
      )
      .run(admin.email, now, cleanReason, participant_id);

    const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id));

    try {
      await sendParticipantRegistrationRejectedEmail({ participant: updated, reason: cleanReason });
    } catch (mailErr) {
      console.error('Rejection email error:', mailErr);
    }

    await writeActivity({
      entity_type: 'participant',
      entity_id: updated.id,
      action: 'registration_rejected',
      actor_email: admin.email,
      details: {
        registration_id: updated.registration_id,
        participant_name: updated.full_name,
        reason: cleanReason,
      },
    });

    return res.status(200).json({
      ok: true,
      message: 'Registration rejected.',
      participant: updated,
    });
  }
}

// 3. POST /api/registration-approvals/resend-email - Resend approval email to participant (Admin only)
export async function handleResendApprovalEmail(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { participant_id } = req.body || {};
  if (!participant_id) return res.status(400).json({ error: 'Participant ID is required' });

  const participant = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(participant_id));
  if (!participant) return res.status(404).json({ error: 'Participant not found' });

  if (participant.approval_status !== 'approved') {
    return res.status(400).json({ error: 'Cannot send approval email: participant is not approved yet.' });
  }

  const baseUrl = getBaseUrl(req);
  let token = participant.step2_token;
  if (!token) {
    token = crypto.randomBytes(32).toString('hex');
    await db.prepare('UPDATE participants SET step2_token = ? WHERE id = ?').run(token, participant.id);
  }

  const step2Url = `${baseUrl}/register?step=2&token=${token}&regId=${participant.registration_id}`;

  try {
    await sendParticipantRegistrationApprovedEmail({ participant, step2Url });
    await db.prepare('UPDATE participants SET approval_email_sent = 1, approval_email_error = NULL WHERE id = ?').run(participant.id);

    await writeActivity({
      entity_type: 'participant',
      entity_id: participant.id,
      action: 'approval_email_resent',
      actor_email: admin.email,
      details: {
        registration_id: participant.registration_id,
        participant_email: participant.email,
      },
    });

    return res.status(200).json({ ok: true, message: 'Approval email sent successfully.' });
  } catch (err) {
    const errorMsg = err?.message || 'Failed to send approval email';
    await db.prepare('UPDATE participants SET approval_email_sent = 0, approval_email_error = ? WHERE id = ?').run(errorMsg, participant.id);
    return res.status(500).json({ error: errorMsg });
  }
}

// 4. GET /api/registration-step2/verify - Validate Step 2 continuation token (Public, strictly verified)
export async function handleVerifyStep2Access(req, res) {
  const token = String(req.query?.token || '').trim();
  if (!token) {
    return res.status(400).json({ error: 'Continuation token is required to access Step 2.' });
  }

  const row = await db.prepare('SELECT * FROM participants WHERE step2_token = ? LIMIT 1').get(token);
  if (!row) {
    return res.status(404).json({ error: 'Invalid or expired continuation link.' });
  }

  const participant = toParticipant(row);

  // Strict approval check from database:
  if (participant.approval_status === 'pending_approval') {
    return res.status(403).json({
      error: 'Your registration is still pending admin approval. You cannot access Step 2 or payment yet.',
      status: 'pending_approval',
      registration_id: participant.registration_id,
      full_name: participant.full_name,
    });
  }

  if (participant.approval_status === 'rejected') {
    return res.status(403).json({
      error: 'Your registration was rejected by the admin team.',
      status: 'rejected',
      rejection_reason: participant.rejection_reason,
      registration_id: participant.registration_id,
      full_name: participant.full_name,
    });
  }

  if (participant.approval_status !== 'approved') {
    return res.status(403).json({
      error: 'Registration is not approved.',
      status: participant.approval_status,
    });
  }

  // If already paid:
  if (participant.payment_id) {
    return res.status(200).json({
      allowed: false,
      already_paid: true,
      message: 'Payment details have already been submitted for this registration.',
      participant: {
        id: participant.id,
        registration_id: participant.registration_id,
        full_name: participant.full_name,
        email: participant.email,
        roll_number: participant.roll_number,
        branch: participant.branch,
        year: participant.year,
        whatsapp_number: participant.whatsapp_number,
        payment_id: participant.payment_id,
        payment_verified: participant.payment_verified,
      },
    });
  }

  // Approved and payment not yet submitted -> Allowed!
  return res.status(200).json({
    allowed: true,
    participant: {
      id: participant.id,
      registration_id: participant.registration_id,
      full_name: participant.full_name,
      email: participant.email,
      roll_number: participant.roll_number,
      branch: participant.branch,
      year: participant.year,
      whatsapp_number: participant.whatsapp_number,
      skills: participant.skills,
    },
  });
}

// 5. POST /api/registration-step2/submit-payment - Submit payment ID (Public, strictly validates approval status from DB)
export async function handleSubmitStep2Payment(req, res) {
  const { token, payment_id } = req.body || {};

  if (!token) {
    return res.status(400).json({ error: 'Continuation token is required to submit payment.' });
  }

  const cleanPaymentId = String(payment_id || '').trim();
  if (!cleanPaymentId || cleanPaymentId.length < 6) {
    return res.status(400).json({ error: 'Valid payment transaction / UPI reference ID is required (min 6 characters).' });
  }

  // Look up participant strictly by step2_token from database
  const row = await db.prepare('SELECT * FROM participants WHERE step2_token = ? LIMIT 1').get(token);
  if (!row) {
    return res.status(404).json({ error: 'Invalid or expired continuation token.' });
  }

  // Enforce server-side approval check:
  if (row.approval_status !== 'approved') {
    return res.status(403).json({
      error: 'Cannot submit payment: Registration has not been approved by admin.',
      status: row.approval_status,
    });
  }

  // Check if payment_id already set for this participant
  if (row.payment_id) {
    return res.status(409).json({ error: 'Payment details have already been submitted for this registration.' });
  }

  // Check duplicate payment_id across participants
  const duplicatePayment = await db.prepare('SELECT id FROM participants WHERE payment_id = ? AND id != ? LIMIT 1').get(cleanPaymentId, row.id);
  if (duplicatePayment) {
    return res.status(409).json({ error: 'This payment transaction ID has already been used by another participant.' });
  }

  // Update participant with payment_id
  await db
    .prepare(
      `
        UPDATE participants
        SET payment_id = ?,
            payment_verified = 0
        WHERE id = ?
      `
    )
    .run(cleanPaymentId, row.id);

  const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(row.id));

  // Write activity log
  await writeActivity({
    entity_type: 'participant',
    entity_id: updated.id,
    action: 'payment_submitted',
    actor_email: updated.email,
    details: {
      registration_id: updated.registration_id,
      payment_id: cleanPaymentId,
      full_name: updated.full_name,
    },
  });

  // Send confirmation email
  try {
    await sendRegistrationConfirmationEmail(updated);
  } catch (mailErr) {
    console.error('Confirmation email error after payment submission:', mailErr);
  }

  return res.status(200).json({
    success: true,
    message: 'Payment details submitted successfully! Awaiting payment verification by admin.',
    participant: updated,
  });
}

// 6. GET /api/registration-status - Public registration status lookup by Roll Number + Email or Registration ID
export async function handleGetRegistrationStatus(req, res) {
  const rollNumber = String(req.query?.roll_number || '').trim();
  const email = String(req.query?.email || '').trim().toLowerCase();
  const regId = String(req.query?.registration_id || '').trim();

  let row = null;
  if (regId) {
    row = await db.prepare('SELECT * FROM participants WHERE registration_id = ? LIMIT 1').get(regId);
  } else if (rollNumber && email) {
    row = await db.prepare('SELECT * FROM participants WHERE roll_number = ? AND lower(email) = lower(?) LIMIT 1').get(rollNumber, email);
  }

  if (!row) {
    return res.status(404).json({ error: 'Registration not found with provided details.' });
  }

  const participant = toParticipant(row);

  return res.status(200).json({
    found: true,
    id: participant.id,
    registration_id: participant.registration_id,
    full_name: participant.full_name,
    email: participant.email,
    roll_number: participant.roll_number,
    branch: participant.branch,
    year: participant.year,
    whatsapp_number: participant.whatsapp_number,
    approval_status: participant.approval_status,
    rejection_reason: participant.rejection_reason,
    has_paid: Boolean(participant.payment_id),
    payment_verified: participant.payment_verified,
    registered_at: participant.registered_at,
    token: participant.approval_status === 'approved' && !participant.payment_id ? participant.step2_token : null,
  });
}


