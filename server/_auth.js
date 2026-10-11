import db from './_db.js';

export function getSuperAdminEmails() {
  const raw = String(process.env.SUPER_ADMIN_EMAILS || '');
  const emails = new Set();
  for (const part of raw.split(',')) {
    const trimmed = part.trim().toLowerCase();
    if (trimmed) emails.add(trimmed);
  }
  if (emails.size === 0) {
    console.error('[super_admin] FATAL: SUPER_ADMIN_EMAILS is empty or not configured. Super admin actions will fail safely.');
  }
  return emails;
}

export function isSuperAdmin(email) {
  const supers = getSuperAdminEmails();
  if (supers.size === 0) return false;
  return supers.has(String(email || '').trim().toLowerCase());
}

export async function isAllowedAdminEmail(email) {
  const normalized = String(email || '').trim().toLowerCase();
  if (isSuperAdmin(normalized)) return true;
  try {
    const user = await db.prepare('SELECT id, status FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1').get(normalized);
    return Boolean(user && user.status === 'active');
  } catch {
    return false;
  }
}

export async function getAdminFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  try {
    const row = await db.prepare(
      `
        SELECT 
          u.id, 
          u.email, 
          u.role as db_role, 
          u.status as user_status,
          s.id as session_id,
          s.status as session_status,
          s.expires_at
        FROM auth_sessions s
        JOIN auth_users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?
        LIMIT 1
      `
    ).get(token, new Date().toISOString());

    if (!row) return null;

    // Only active sessions have access to protected endpoints
    if (row.session_status !== 'active') return null;

    const normalizedEmail = String(row.email).trim().toLowerCase();
    const superAdmin = isSuperAdmin(normalizedEmail);

    // Regular admin must have active status in database
    if (!superAdmin && row.user_status !== 'active') {
      return null;
    }

    const role = superAdmin ? 'super_admin' : 'admin';

    // Touch session last_seen_at
    db.prepare("UPDATE auth_sessions SET last_seen_at = datetime('now') WHERE id = ?").run(token).catch(() => {});

    return {
      id: row.id,
      email: normalizedEmail,
      role,
      session_id: row.session_id,
    };
  } catch (err) {
    console.error('getAdminFromRequest error:', err);
    return null;
  }
}

export async function requireAdmin(req, res) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return admin;
}

export async function requireSuperAdmin(req, res) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (admin.role !== 'super_admin') {
    res.status(403).json({ error: 'Forbidden: Super Admin access required' });
    return null;
  }
  return admin;
}
