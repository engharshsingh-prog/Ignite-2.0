import db from './_db.js';

const ADMIN_EMAILS = new Set([
  'sharvilm112@gmail.com',
  'adityabhai01@gmail.com',
  'harsh188200@gmail.com',
]);

export function isAllowedAdminEmail(email) {
  return ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());
}

export async function getAdminFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length);
  if (!token) return null;

  const admin = (
    await db
    .prepare(
      `
        SELECT u.id, u.email
        FROM auth_sessions s
        JOIN auth_users u ON u.id = s.user_id
        WHERE s.id = ? AND s.expires_at > ?
        LIMIT 1
      `
    )
    .get(token, new Date().toISOString())
  ) || null;
  return admin && isAllowedAdminEmail(admin.email) ? admin : null;
}

export async function requireAdmin(req, res) {
  const admin = await getAdminFromRequest(req);
  if (!admin) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return admin;
}
