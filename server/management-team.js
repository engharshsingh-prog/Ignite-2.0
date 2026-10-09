import db, { encodeRoles, toManagementMember } from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';
import { getDataUrlImageDimensions } from './_image-dimensions.js';

function validate(payload) {
  const { name, branch, year, roles, fields, whatsapp_number, profile_image } = payload;
  if (!name || !branch || !year || !fields || !whatsapp_number) return 'All fields are required';
  if (!Array.isArray(roles) || roles.length === 0) return 'At least one role is required';
  if (!/^\d{10}$/.test(String(whatsapp_number))) return 'WhatsApp number must be exactly 10 digits';
  if (profile_image) {
    const image = String(profile_image);
    if (!image.startsWith('data:image/')) return 'Invalid profile image format';
    if (image.length > 900000) return 'Profile image is too large';
    try {
      const { width, height } = getDataUrlImageDimensions(image);
      if (width !== height) return 'Profile photo must be 1:1 (square ratio)';
    } catch (err) {
      return err instanceof Error ? err.message : 'Invalid profile image data';
    }
  }
  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const rows = (await db.prepare('SELECT * FROM management_team ORDER BY name ASC').all()).map(toManagementMember);
      return res.status(200).json(rows);
    }

    if (req.method === 'POST') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const validationError = validate(req.body || {});
      if (validationError) return res.status(400).json({ error: validationError });

      const { name, branch, year, roles, fields, whatsapp_number, profile_image } = req.body;

      const result = await db
        .prepare(
          `
            INSERT INTO management_team (name, branch, year, roles, fields, profile_image, whatsapp_number, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `
        )
        .run(name, branch, year, encodeRoles(roles), fields, profile_image || '', whatsapp_number);

      const row = toManagementMember(await db.prepare('SELECT * FROM management_team WHERE id = ?').get(result.lastInsertRowid));

      await writeActivity({
        entity_type: 'management_team',
        entity_id: row.id,
        action: 'management_member_created',
        actor_email: admin.email,
        details: row,
      });

      return res.status(201).json(row);
    }

    if (req.method === 'PUT') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id, name, branch, year, roles, fields, whatsapp_number, profile_image } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Member ID required' });

      const existing = await db.prepare('SELECT * FROM management_team WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Member not found' });

      const validationError = validate({ name, branch, year, roles, fields, whatsapp_number, profile_image });
      if (validationError) return res.status(400).json({ error: validationError });

      await db
        .prepare(
          `
            UPDATE management_team
            SET name = ?, branch = ?, year = ?, roles = ?, fields = ?, profile_image = ?, whatsapp_number = ?, updated_at = datetime('now')
            WHERE id = ?
          `
        )
        .run(name, branch, year, encodeRoles(roles), fields, profile_image || '', whatsapp_number, id);

      const updated = toManagementMember(await db.prepare('SELECT * FROM management_team WHERE id = ?').get(id));

      await writeActivity({
        entity_type: 'management_team',
        entity_id: updated.id,
        action: 'management_member_updated',
        actor_email: admin.email,
        details: {
          before: toManagementMember(existing),
          after: updated,
        },
      });

      return res.status(200).json(updated);
    }

    if (req.method === 'DELETE') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Member ID required' });

      const existing = await db.prepare('SELECT * FROM management_team WHERE id = ?').get(id);
      if (!existing) return res.status(404).json({ error: 'Member not found' });

      await db.prepare('DELETE FROM management_team WHERE id = ?').run(id);

      await writeActivity({
        entity_type: 'management_team',
        entity_id: Number(id),
        action: 'management_member_deleted',
        actor_email: admin.email,
        details: {
          deleted_record: toManagementMember(existing),
        },
      });

      return res.status(200).json({ ok: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Management team API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
