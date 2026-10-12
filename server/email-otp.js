import 'dotenv/config';
import crypto from 'crypto';
import db from './_db.js';
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
  if (s.endsWith('Z')) return new Date(s).getTime();
  if (s.includes('T')) return new Date(s.endsWith('Z') ? s : s + 'Z').getTime();
  return new Date(s.replace(' ', 'T') + 'Z').getTime();
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

      const existing = await db.prepare('SELECT id FROM participants WHERE email = ? LIMIT 1').get(normalizedEmail);
      if (existing) {
        return res.status(409).json({ error: 'This email address is already registered' });
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

      // Retrieve recent unconsumed sessions to accommodate minor delivery delay races
      const activeSessions = await db
        .prepare(
          `
            SELECT * FROM email_otp_sessions
            WHERE email = ? AND consumed = 0
            ORDER BY id DESC
            LIMIT 5
          `
        )
        .all(normalizedEmail);

      if (!activeSessions || activeSessions.length === 0) {
        return res.status(404).json({ error: 'No active OTP session found. Please request a new OTP.' });
      }

      const latestSession = activeSessions[0];
      const now = Date.now();

      // Check if any recent active session matches
      const matchedSession = activeSessions.find(
        (s) => parseUtcTimestamp(s.expires_at) > now && s.attempts < MAX_ATTEMPTS && s.otp_hash === hashOtp(providedOtp)
      );

      if (matchedSession) {
        const verificationToken = crypto.randomUUID();
        await db
          .prepare('UPDATE email_otp_sessions SET verified = 1, verification_token = ? WHERE id = ?')
          .run(verificationToken, matchedSession.id);

        // Mark all active sessions for this email as consumed
        await db
          .prepare('UPDATE email_otp_sessions SET consumed = 1 WHERE email = ?')
          .run(normalizedEmail);

        return res.status(200).json({ ok: true, otp_token: verificationToken });
      }

      if (parseUtcTimestamp(latestSession.expires_at) < now) {
        return res.status(400).json({ error: 'OTP expired. Please request a new OTP.' });
      }

      if (latestSession.attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Maximum attempts reached. Please request a new OTP.' });
      }

      await db.prepare('UPDATE email_otp_sessions SET attempts = attempts + 1 WHERE id = ?').run(latestSession.id);
      const remaining = MAX_ATTEMPTS - (latestSession.attempts + 1);

      return res.status(400).json({
        error: remaining > 0
          ? `Invalid OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
          : 'Invalid OTP. Maximum attempts reached. Please request a new OTP.'
      });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Email OTP API error:', err);
    return res.status(500).json({ error: err.message || 'Internal server error processing OTP' });
  }
}
