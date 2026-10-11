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
        const elapsed = Date.now() - new Date(recent.created_at).getTime();
        if (elapsed < RESEND_COOLDOWN_SECONDS * 1000) {
          const left = Math.ceil((RESEND_COOLDOWN_SECONDS * 1000 - elapsed) / 1000);
          return res.status(429).json({ error: `Please wait ${left}s before requesting another OTP` });
        }
      }

      const code = randomOtp();
      const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000).toISOString();

      await db
        .prepare(
          `
            INSERT INTO email_otp_sessions (email, otp_hash, expires_at)
            VALUES (?, ?, ?)
          `
        )
        .run(normalizedEmail, hashOtp(code), expiresAt);

      await sendOtpEmail(normalizedEmail, code);
      return res.status(200).json({ ok: true, message: 'OTP sent successfully' });
    }

    if (action === 'verify') {
      if (!(await registrationsEnabled())) {
        return res.status(403).json({ error: 'Registrations are currently closed by admin.' });
      }

      const providedOtp = String(otp || '').trim();
      if (!/^\d{6}$/.test(providedOtp)) {
        return res.status(400).json({ error: 'OTP must be 6 digits' });
      }

      const session = await db
        .prepare(
          `
            SELECT * FROM email_otp_sessions
            WHERE email = ? AND consumed = 0
            ORDER BY id DESC
            LIMIT 1
          `
        )
        .get(normalizedEmail);

      if (!session) return res.status(404).json({ error: 'No OTP session found. Request OTP again.' });
      if (new Date(session.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ error: 'OTP expired. Request a new OTP.' });
      }
      if (session.attempts >= MAX_ATTEMPTS) {
        return res.status(429).json({ error: 'Maximum attempts reached. Request a new OTP.' });
      }

      if (session.otp_hash !== hashOtp(providedOtp)) {
        await db.prepare('UPDATE email_otp_sessions SET attempts = attempts + 1 WHERE id = ?').run(session.id);
        return res.status(400).json({ error: 'Invalid OTP' });
      }

      const verificationToken = crypto.randomUUID();
      await db
        .prepare('UPDATE email_otp_sessions SET verified = 1, verification_token = ? WHERE id = ?')
        .run(verificationToken, session.id);

      return res.status(200).json({ ok: true, otp_token: verificationToken });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Email OTP API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
