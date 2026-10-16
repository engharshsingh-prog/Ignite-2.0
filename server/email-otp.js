import 'dotenv/config';
import crypto from 'crypto';
import db, { localClient } from './_db.js';
import { sendOtpEmail } from './_mailer.js';

const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 45;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isGmailEmail(email) {
  return /^[^\s@]+@gmail\.com$/.test(String(email || '').trim().toLowerCase());
}

function hashOtp(otp) {
  return crypto.createHash('sha256').update(String(otp)).digest('hex');
}

function randomOtp() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function parseUtcTimestamp(ts) {
  if (!ts) return 0;
  const s = String(ts).trim();
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.getTime();
  const fallback = new Date(s.replace(' ', 'T') + 'Z');
  return Number.isNaN(fallback.getTime()) ? 0 : fallback.getTime();
}

async function registrationsEnabled() {
  const row = await db.prepare('SELECT enabled FROM registration_control WHERE id = 1').get();
  return !row || Boolean(row.enabled);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { action, email, otp } = req.body || {};
    const normalizedEmail = normalizeEmail(email);

    if (!isValidEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!isGmailEmail(normalizedEmail)) {
      return res.status(400).json({ error: 'Only gmail.com addresses are allowed' });
    }

    if (action === 'send') {
      if (!(await registrationsEnabled())) {
        return res.status(403).json({ error: 'Registrations are currently closed by admin.' });
      }

      const existing = await db.prepare('SELECT id, approval_status, payment_id FROM participants WHERE lower(trim(email)) = ? LIMIT 1').get(normalizedEmail);
      if (existing && existing.id) {
        if (existing.approval_status === 'approved' && existing.payment_id) {
          return res.status(409).json({
            error: 'This email address is already registered and payment submitted. You can access your pass in My Profile.',
            alreadyRegistered: true,
            status: 'completed'
          });
        }
        if (existing.approval_status === 'approved' && !existing.payment_id) {
          return res.status(409).json({
            error: 'This email address is already registered and approved! Please complete your payment.',
            alreadyRegistered: true,
            status: 'approved'
          });
        }
        if (existing.approval_status === 'pending_approval') {
          return res.status(409).json({
            error: 'Your registration has already been submitted and is currently pending admin verification.',
            alreadyRegistered: true,
            status: 'pending_approval'
          });
        }
        if (existing.approval_status !== 'rejected') {
          return res.status(409).json({
            error: 'This email address is already registered',
            alreadyRegistered: true
          });
        }
        // If rejected, allow proceeding to send OTP for re-application
      }

      const recent = await db
        .prepare('SELECT created_at FROM email_otp_sessions WHERE email = ? ORDER BY id DESC LIMIT 1')
        .get(normalizedEmail);

      if (recent?.created_at) {
        const elapsed = Date.now() - parseUtcTimestamp(recent.created_at);
        if (elapsed < RESEND_COOLDOWN_SECONDS * 1000) {
          const left = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
          return res.status(429).json({
            error: `Please wait ${left}s before requesting another OTP`,
            cooldown_seconds: left,
          });
        }
      }

      // Invalidate any previous unconsumed OTP sessions for this email so previous OTPs cannot be reused
      await db
        .prepare('UPDATE email_otp_sessions SET consumed = 1 WHERE email = ? AND consumed = 0')
        .run(normalizedEmail);

      const code = randomOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();
      const createdAt = new Date().toISOString();

      await db
        .prepare(
          `
            INSERT INTO email_otp_sessions (email, otp_hash, expires_at, created_at)
            VALUES (?, ?, ?, ?)
          `
        )
        .run(normalizedEmail, hashOtp(code), expiresAt, createdAt);

      const sendResult = await sendOtpEmail(normalizedEmail, code);
      return res.status(200).json({
        ok: true,
        message: 'OTP sent successfully. Please check your Gmail inbox (and Spam or Updates folder).',
        cooldown_seconds: RESEND_COOLDOWN_SECONDS,
        dev_mode: Boolean(sendResult?.devMode),
      });
    }

    if (action === 'verify') {
      if (!(await registrationsEnabled())) {
        return res.status(403).json({ error: 'Registrations are currently closed by admin.' });
      }

      const providedOtp = String(otp || '').trim();
      if (!/^\d{6}$/.test(providedOtp)) {
        return res.status(400).json({ error: 'OTP must be 6 digits' });
      }

      let session = await db
        .prepare(
          `
            SELECT * FROM email_otp_sessions
            WHERE email = ? AND consumed = 0
            ORDER BY id DESC
            LIMIT 1
          `
        )
        .get(normalizedEmail);

      // Fallback: If not found in primary DB (e.g. was stored in local SQLite during startup race), check localClient
      if (!session) {
        try {
          const localRes = await localClient.execute({
            sql: 'SELECT * FROM email_otp_sessions WHERE email = ? AND consumed = 0 ORDER BY id DESC LIMIT 1',
            args: [normalizedEmail],
          });
          if (localRes.rows && localRes.rows.length > 0) {
            session = localRes.rows[0];
          }
        } catch (_) {}
      }

      if (!session) {
        return res.status(404).json({ error: 'No active OTP request found. Please request an OTP first.' });
      }

      const now = Date.now();
      console.log('[DEBUG VERIFY]', {
        id: session.id,
        email: session.email,
        expires_at: session.expires_at,
        parsed: parseUtcTimestamp(session.expires_at),
        now,
        isExpired: parseUtcTimestamp(session.expires_at) < now
      });
      if (parseUtcTimestamp(session.expires_at) < now) {
        return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      }

      if (session.attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Maximum attempts reached. Please request a new OTP.' });
      }

      if (session.otp_hash !== hashOtp(providedOtp)) {
        await db.prepare('UPDATE email_otp_sessions SET attempts = attempts + 1 WHERE id = ?').run(session.id);
        const remaining = MAX_ATTEMPTS - (session.attempts + 1);
        return res.status(400).json({
          error: remaining > 0
            ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Invalid OTP. Maximum attempts reached. Please request a new OTP.'
        });
      }

      const verificationToken = crypto.randomUUID();
      // Allow 30 minutes from verification for the participant to fill and submit the registration form
      const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

      // Mark the session as verified with its verification token. Leave consumed = 0 so participants API can consume it.
      await db
        .prepare('UPDATE email_otp_sessions SET verified = 1, verification_token = ?, expires_at = ? WHERE id = ?')
        .run(verificationToken, tokenExpiresAt, session.id);

      // Invalidate any older sessions for this email
      await db
        .prepare('UPDATE email_otp_sessions SET consumed = 1 WHERE email = ? AND id != ?')
        .run(normalizedEmail, session.id);

      return res.status(200).json({ ok: true, otp_token: verificationToken });
    }

    if (action === 'check') {
      const { otp_token } = req.body || {};
      if (!otp_token || typeof otp_token !== 'string') {
        return res.status(200).json({ valid: false });
      }

      let session = await db
        .prepare(
          `
            SELECT id, expires_at
            FROM email_otp_sessions
            WHERE email = ? AND verification_token = ? AND verified = 1 AND consumed = 0
            ORDER BY id DESC
            LIMIT 1
          `
        )
        .get(normalizedEmail, otp_token.trim());

      if (!session) {
        try {
          const localRes = await localClient.execute({
            sql: 'SELECT id, expires_at FROM email_otp_sessions WHERE email = ? AND verification_token = ? AND verified = 1 AND consumed = 0 ORDER BY id DESC LIMIT 1',
            args: [normalizedEmail, otp_token.trim()],
          });
          if (localRes.rows && localRes.rows.length > 0) {
            session = localRes.rows[0];
          }
        } catch (_) {}
      }

      if (!session || parseUtcTimestamp(session.expires_at) < Date.now()) {
        return res.status(200).json({ valid: false });
      }

      return res.status(200).json({ valid: true });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Email OTP API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing OTP' });
  }
}
