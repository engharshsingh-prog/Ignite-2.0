import crypto from 'crypto';
import db from '../_db.js';
import { isSuperAdmin, getSuperAdminEmails } from '../_auth.js';
import { sendLoginApprovalNotification } from '../_mailer.js';
import { writeActivity } from '../_activity.js';

function verifyPassword(password, storedHash) {
  const [saltHex, keyHex] = (storedHash || '').split(':');
  if (!saltHex || !keyHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
  return key.toString('hex') === keyHex;
}

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '127.0.0.1';
}

function getUserAgent(req) {
  return String(req.headers['user-agent'] || '').slice(0, 255);
}

// In-memory rate limiting: max 8 attempts per email/IP per minute
const rateLimitMap = new Map();
function isRateLimited(key, limit = 8, windowMs = 60000) {
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  rateLimitMap.set(key, record);
  return record.count > limit;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const normalizedEmail = String(email).trim().toLowerCase();
    const ip = getClientIp(req);
    const userAgent = getUserAgent(req);

    if (isRateLimited(`login:${normalizedEmail}`) || isRateLimited(`ip:${ip}`)) {
      return res.status(429).json({ error: 'Too many login attempts. Please wait a minute before trying again.' });
    }

    const superAdmin = isSuperAdmin(normalizedEmail);

    // Fetch user from DB
    const user = await db
      .prepare('SELECT id, email, password_hash, role, status, is_approved FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1')
      .get(normalizedEmail);

    // If not super admin and not an active DB user, fail securely without revealing admin status
    if (!superAdmin && (!user || user.status !== 'active')) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Verify password
    if (!user || !verifyPassword(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateToken();
    const sessionLifetimeMs = 7 * 24 * 60 * 60 * 1000;
    const sessionExpiresAt = new Date(Date.now() + sessionLifetimeMs).toISOString();

    // 1. SUPER ADMIN OR PREVIOUSLY APPROVED ADMIN FLOW: Direct Active Login
    // Super admins always log in directly.
    // Once a super admin approves an admin once (is_approved === 1), they never need approval again!
    if (superAdmin || user.is_approved === 1) {
      await db
        .prepare(
          "INSERT INTO auth_sessions (id, user_id, expires_at, status, ip, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
        )
        .run(token, user.id, sessionExpiresAt, 'active', ip, userAgent);

      await db
        .prepare("UPDATE auth_users SET last_login_at = datetime('now') WHERE id = ?")
        .run(user.id);

      writeActivity({
        entity_type: superAdmin ? 'super_admin_auth' : 'admin_auth',
        entity_id: user.id,
        action: superAdmin ? 'super_admin_login' : 'approved_admin_login',
        actor_email: normalizedEmail,
        details: { ip, user_agent: userAgent },
      }).catch(() => {});

      return res.status(200).json({
        approved: true,
        user: { id: user.id, email: user.email, role: superAdmin ? 'super_admin' : 'admin' },
        token,
      });
    }

    // 2. UNAPPROVED REGULAR ADMIN FLOW: Pending Session & Approval Request
    // First-time or unapproved admins require super admin approval once.
    const requestId = crypto.randomUUID();
    const expiryMinutes = Math.max(1, Number(process.env.LOGIN_APPROVAL_EXPIRY_MINUTES || 10));
    const requestExpiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    await db
      .prepare(
        "INSERT INTO auth_sessions (id, user_id, expires_at, status, ip, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
      )
      .run(token, user.id, sessionExpiresAt, 'pending', ip, userAgent);

    await db
      .prepare(
        `
          INSERT INTO admin_access_requests (id, user_id, email, session_id, ip, user_agent, status, requested_at, expires_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'), ?)
        `
      )
      .run(requestId, user.id, normalizedEmail, token, ip, userAgent, requestExpiresAt);

    // Non-blocking email alert to all configured super admins
    const superAdmins = getSuperAdminEmails();
    sendLoginApprovalNotification({
      adminEmail: normalizedEmail,
      ip,
      userAgent,
      requestedAt: new Date().toLocaleString(),
      requestId,
      superAdminEmails: superAdmins,
    }).catch((err) => {
      console.error('Super admin notification error:', err?.message);
    });

    writeActivity({
      entity_type: 'admin_login_request',
      entity_id: user.id,
      action: 'login_approval_requested',
      actor_email: normalizedEmail,
      details: { request_id: requestId, ip, user_agent: userAgent, expires_at: requestExpiresAt },
    }).catch(() => {});

    return res.status(202).json({
      pending: true,
      request_id: requestId,
      token,
      expires_at: requestExpiresAt,
      message: 'Login requires Super Admin approval.',
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message });
  }
}
