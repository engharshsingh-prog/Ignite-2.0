import crypto from 'node:crypto';
import db, { encodeSkills, toParticipant, localClient } from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';
import { ensureRegistrationLocksTable } from './registration-locks.js';
import {
  sendRegistrationConfirmationEmail,
  sendParticipantApprovalRequestToAdmin,
} from './_mailer.js';
import {
  getBaseUrl,
  getAuthorizedAdminEmails,
} from './registration-flow.js';

const ALLOWED_YEARS = ['1st Year', '2nd Year'];

function isGmailEmail(email) {
  return /^[^\s@]+@gmail\.com$/.test(String(email || '').trim().toLowerCase());
}

function parseUtcTimestamp(ts) {
  if (!ts) return 0;
  const s = String(ts).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  const fallback = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
}

function validateStep1Input(payload) {
  const { email, full_name, roll_number, branch, year, skills, whatsapp_number } = payload;
  if (!email || !full_name || !roll_number || !branch || !year || skills === undefined || !whatsapp_number) {
    return 'All fields are required';
  }
  if (!isGmailEmail(email)) return 'Only gmail.com addresses are allowed';
  const cleanRoll = String(roll_number || '').trim();
  if (!cleanRoll || cleanRoll.length > 15 || !/^[a-zA-Z0-9\/-]+$/.test(cleanRoll)) {
    return 'Roll number/Enrolment number must be 15 characters or less';
  }
  if (!/^\d{10}$/.test(String(whatsapp_number))) return 'WhatsApp number must be exactly 10 digits';
  if (!Array.isArray(skills)) return 'Invalid skills value';
  if (!ALLOWED_YEARS.includes(year)) return 'Only 1st Year and 2nd Year registrations are allowed';
  return null;
}

function validateAdminEditInput(payload) {
  const step1Err = validateStep1Input(payload);
  if (step1Err) return step1Err;
  return null;
}

async function checkDuplicate(field, value, currentId = null) {
  if (!value) return false;
  if (currentId) {
    return db.prepare(`SELECT id FROM participants WHERE ${field} = ? AND id != ?`).get(value, currentId);
  }
  return db.prepare(`SELECT id FROM participants WHERE ${field} = ?`).get(value);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { search, branch, approval_status } = req.query;
      const params = [];
      let where = '1=1';

      if (search) {
        where += ' AND (full_name LIKE ? OR roll_number LIKE ? OR email LIKE ? OR payment_id LIKE ? OR whatsapp_number LIKE ? OR registration_id LIKE ? OR account_holder_name LIKE ?)';
        const needle = `%${search}%`;
        params.push(needle, needle, needle, needle, needle, needle, needle);
      }
      if (branch && branch !== 'all') {
        where += ' AND branch = ?';
        params.push(branch);
      }
      if (approval_status && approval_status !== 'all') {
        where += ' AND approval_status = ?';
        params.push(approval_status);
      }

      const rows = (await db.prepare(`SELECT * FROM participants WHERE ${where} ORDER BY registered_at DESC`).all(...params)).map(toParticipant);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const registrationControl = await db.prepare('SELECT enabled FROM registration_control WHERE id = 1').get();
      if (registrationControl && !registrationControl.enabled) {
        return res.status(403).json({ error: 'Registrations are currently closed by admin.' });
      }

      const validationError = validateStep1Input(req.body || {});
      if (validationError) return res.status(400).json({ error: validationError });

      const { email, full_name, roll_number, branch, year, skills, whatsapp_number, otp_token } = req.body;

      const normalizedEmail = String(email).trim().toLowerCase();
      const cleanRoll = String(roll_number).trim();
      const registrationYear = year === '2nd Year' ? '2nd Year' : '1st Year';

      // Check Super Admin Year-Wise Registration Gateway status
      try {
        const settingsRow = await db.prepare('SELECT registration_1st_year_enabled, registration_2nd_year_enabled FROM event_settings WHERE id = 1').get();
        if (settingsRow) {
          if (registrationYear === '2nd Year' && Number(settingsRow.registration_2nd_year_enabled) === 0) {
            return res.status(403).json({ error: '2nd Year registrations are currently closed by Super Admin.' });
          }
          if (registrationYear === '1st Year' && Number(settingsRow.registration_1st_year_enabled) === 0) {
            return res.status(403).json({ error: '1st Year registrations are currently closed by Super Admin.' });
          }
        }
      } catch (_) {}

      if (!otp_token) {
        return res.status(403).json({ error: 'Email OTP verification is required before registration' });
      }

      let verifiedOtp = await db
        .prepare(
          `
            SELECT id, expires_at
            FROM email_otp_sessions
            WHERE email = ? AND verification_token = ? AND verified = 1 AND consumed = 0
            ORDER BY id DESC
            LIMIT 1
          `
        )
        .get(normalizedEmail, String(otp_token).trim());

      if (!verifiedOtp) {
        try {
          const localRes = await localClient.execute({
            sql: 'SELECT id, expires_at FROM email_otp_sessions WHERE email = ? AND verification_token = ? AND verified = 1 AND consumed = 0 ORDER BY id DESC LIMIT 1',
            args: [normalizedEmail, String(otp_token).trim()],
          });
          if (localRes.rows && localRes.rows.length > 0) {
            verifiedOtp = localRes.rows[0];
          }
        } catch (_) {}
      }

      if (!verifiedOtp) {
        return res.status(403).json({ error: 'Invalid or expired OTP verification. Please verify your email again.' });
      }

      if (parseUtcTimestamp(verifiedOtp.expires_at) < Date.now()) {
        return res.status(403).json({ error: 'Your email verification session has expired. Please verify your email again.' });
      }

      await ensureRegistrationLocksTable();

      // 1. Check Year-Wise Registration Lock for this student and year
      const lockRecord = await db.prepare(
        'SELECT * FROM registration_locks WHERE lower(trim(email)) = ? AND year = ? LIMIT 1'
      ).get(normalizedEmail, registrationYear);

      const existingForThisYear = await db.prepare(
        'SELECT * FROM participants WHERE lower(trim(email)) = ? AND year = ? LIMIT 1'
      ).get(normalizedEmail, registrationYear);

      if (!existingForThisYear) {
        // If no participant record exists in participants, clean up any orphan lock from previous deletions
        if (lockRecord) {
          await db.prepare('DELETE FROM registration_locks WHERE lower(trim(email)) = ? AND year = ?').run(normalizedEmail, registrationYear).catch(() => {});
        }
      } else {
        const isLocked = lockRecord ? (Number(lockRecord.is_locked) === 1) : (existingForThisYear.is_locked !== 0);

        if (isLocked) {
          if (existingForThisYear.approval_status === 'approved' && existingForThisYear.payment_id) {
            return res.status(409).json({
              error: `Your registration for ${registrationYear} is already completed and payment submitted. You can check your pass in My Profile.`,
              locked: true,
              year: registrationYear,
            });
          }
          if (existingForThisYear.approval_status === 'approved' && !existingForThisYear.payment_id) {
            const participant = toParticipant(existingForThisYear);
            return res.status(200).json({ 
              success: true,
              message: `Your registration for ${registrationYear} is approved. Redirecting to payment.`,
              participant,
              redirectToStep2: true,
              step2_token: existingForThisYear.step2_token,
              step2_token_expires_at: existingForThisYear.step2_token_expires_at,
              locked: true,
              year: registrationYear,
            });
          }
          if (existingForThisYear.approval_status === 'pending_approval') {
            return res.status(409).json({
              error: `Your ${registrationYear} registration is submitted and awaiting admin approval. It is currently locked.`,
              locked: true,
              year: registrationYear,
            });
          }
          if (existingForThisYear.approval_status === 'rejected') {
            return res.status(409).json({
              error: `Your ${registrationYear} registration was rejected and is currently locked. Please contact the Super Admin to request an unlock.`,
              locked: true,
              year: registrationYear,
            });
          }
          return res.status(409).json({
            error: `Registration for ${registrationYear} is locked for this account. Contact Super Admin to request an unlock.`,
            locked: true,
            year: registrationYear,
          });
        }
      }

      // Check roll number for the same academic year
      const existingByRoll = await db.prepare(
        'SELECT id, approval_status FROM participants WHERE lower(trim(roll_number)) = ? AND year = ? LIMIT 1'
      ).get(cleanRoll.toLowerCase(), registrationYear);
      if (existingByRoll && existingByRoll.id && existingByRoll.id !== existingForThisYear?.id) {
        if (existingByRoll.approval_status !== 'rejected') {
          return res.status(409).json({
            error: `This roll number/enrolment number is already registered for ${registrationYear}.`,
            locked: true,
            year: registrationYear,
          });
        }
      }

      const token = crypto.randomBytes(32).toString('hex');
      const tokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      let participantId;

      let feeForYear = registrationYear === '2nd Year' ? 699 : 599;
      try {
        const settingsRow = await db.prepare('SELECT fee_1st_year, fee_2nd_year FROM event_settings WHERE id = 1').get();
        if (settingsRow) {
          if (registrationYear === '2nd Year' && settingsRow.fee_2nd_year != null) {
            feeForYear = Number(settingsRow.fee_2nd_year);
          } else if (registrationYear === '1st Year' && settingsRow.fee_1st_year != null) {
            feeForYear = Number(settingsRow.fee_1st_year);
          }
        }
      } catch (_) {}

      if (existingForThisYear?.id) {
        // Re-submit unlocked or previously rejected participant for this year
        await db
          .prepare(
            `
              UPDATE participants
              SET full_name = ?, roll_number = ?, branch = ?, year = ?, skills = ?, whatsapp_number = ?,
                  approval_status = 'pending_approval',
                  step2_token = ?,
                  step2_token_expires_at = ?,
                  payment_amount = ?,
                  is_locked = 1,
                  locked_at = datetime('now'),
                  locked_by = 'system',
                  lock_reason = NULL,
                  unlocked_at = NULL,
                  unlocked_by = NULL,
                  unlock_reason = NULL,
                  rejected_at = NULL,
                  rejected_by = NULL,
                  rejection_reason = NULL,
                  registered_at = datetime('now')
              WHERE id = ?
            `
          )
          .run(full_name, cleanRoll, branch, registrationYear, encodeSkills(skills), whatsapp_number, token, tokenExpiresAt, feeForYear, existingForThisYear.id);
        participantId = existingForThisYear.id;
      } else {
        const result = await db
          .prepare(
            `
              INSERT INTO participants (
                email, full_name, roll_number, branch, year, skills, whatsapp_number,
                approval_status, step2_token, step2_token_expires_at, payment_amount,
                is_locked, locked_at, locked_by, registered_at
              )
              VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_approval', ?, ?, ?, 1, datetime('now'), 'system', datetime('now'))
            `
          )
          .run(normalizedEmail, full_name, cleanRoll, branch, registrationYear, encodeSkills(skills), whatsapp_number, token, tokenExpiresAt, feeForYear);
        participantId = result.lastInsertRowid;
      }

      // Record / update lock in registration_locks
      try {
        await db.prepare(`
          INSERT INTO registration_locks (
            email, roll_number, year, participant_id, is_locked, locked_at, locked_by, updated_at
          )
          VALUES (?, ?, ?, ?, 1, datetime('now'), 'system', datetime('now'))
          ON CONFLICT (email, year) DO UPDATE SET
            roll_number = excluded.roll_number,
            participant_id = excluded.participant_id,
            is_locked = 1,
            locked_at = datetime('now'),
            locked_by = 'system',
            unlocked_at = NULL,
            unlocked_by = NULL,
            unlock_reason = NULL,
            updated_at = datetime('now')
        `).run(normalizedEmail, cleanRoll, registrationYear, participantId);
      } catch (lockInsertErr) {
        console.warn('[participants] Failed to upsert registration_locks:', lockInsertErr?.message || lockInsertErr);
      }

      // Generate formatted unique registration ID
      const regId = `IGN26-${String(participantId).padStart(4, '0')}`;
      await db.prepare('UPDATE participants SET registration_id = ? WHERE id = ?').run(regId, participantId);

      const participant = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId));

      // Mark OTP as consumed
      await db.prepare('UPDATE email_otp_sessions SET consumed = 1 WHERE id = ?').run(verifiedOtp.id);

      // Log activity
      await writeActivity({
        entity_type: 'participant',
        entity_id: participant.id,
        action: 'registration_step1_submitted',
        actor_email: participant.email,
        details: {
          registration_id: participant.registration_id,
          full_name: participant.full_name,
          roll_number: participant.roll_number,
          branch: participant.branch,
          year: participant.year,
        },
      });

      // Send approval notification email to authorized admins
      try {
        const adminEmails = await getAuthorizedAdminEmails();
        const reviewUrl = `${getBaseUrl(req)}/admin/dashboard`;
        await sendParticipantApprovalRequestToAdmin({ participant, adminEmails, reviewUrl });
      } catch (mailErr) {
        console.error('Admin approval notification mail error:', mailErr);
      }

      return res.status(201).json({
        success: true,
        message: 'Step 1 registration submitted successfully. Please wait while our admin team verifies your details. You will receive an email once your registration is approved.',
        participant,
      });
    }

    if (req.method === 'PUT') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number, account_holder_name } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Participant ID required' });

      const existing = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Participant not found' });

      const validationError = validateAdminEditInput({ email, full_name, roll_number, branch, year, skills, whatsapp_number });
      if (validationError) return res.status(400).json({ error: validationError });

      if (await checkDuplicate('email', String(email).trim().toLowerCase(), id)) {
        return res.status(409).json({ error: 'This email address is already registered' });
      }
      if (payment_id && (await checkDuplicate('payment_id', payment_id, id))) {
        return res.status(409).json({ error: 'This registration payment ID is already used' });
      }

      await db
        .prepare(
          `
            UPDATE participants
            SET email = ?, full_name = ?, roll_number = ?, branch = ?, year = ?, skills = ?, payment_id = ?, whatsapp_number = ?,
                account_holder_name = CASE WHEN ? IS NOT NULL THEN ? ELSE account_holder_name END
            WHERE id = ?
          `
        )
        .run(
          String(email).trim().toLowerCase(),
          full_name,
          String(roll_number).trim(),
          branch,
          year,
          encodeSkills(skills),
          payment_id,
          whatsapp_number,
          account_holder_name !== undefined ? account_holder_name : null,
          account_holder_name !== undefined ? account_holder_name : null,
          id
        );

      const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(id));
      const previous = toParticipant(existing);

      await writeActivity({
        entity_type: 'participant',
        entity_id: updated.id,
        action: 'registration_updated',
        actor_email: admin.email,
        details: {
          before: previous,
          after: updated,
        },
      });

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Participant ID required' });

      const existing = await db.prepare('SELECT * FROM participants WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Participant not found' });

      await db.prepare('DELETE FROM participants WHERE id = ?').run(id);

      // Clean up corresponding registration lock so user can register anew if needed
      await db.prepare('DELETE FROM registration_locks WHERE participant_id = ? OR (lower(trim(email)) = ? AND year = ?)').run(
        id,
        String(existing.email).trim().toLowerCase(),
        existing.year
      ).catch(() => {});

      await writeActivity({
        entity_type: 'participant',
        entity_id: Number(id),
        action: 'registration_deleted',
        actor_email: admin.email,
        details: {
          deleted_record: toParticipant(existing),
        },
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Participants API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
