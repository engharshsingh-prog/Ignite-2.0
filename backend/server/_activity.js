import db from './_db.js';

export async function writeActivity({
  entity_type,
  entity_id = null,
  action,
  actor_email,
  details = null,
}) {
  return db.prepare(
    `
      INSERT INTO activity_logs (entity_type, entity_id, action, actor_email, details)
      VALUES (?, ?, ?, ?, ?)
    `
  ).run(entity_type, entity_id, action, actor_email || 'system', details ? JSON.stringify(details) : null);
}

export function toActivityLog(row) {
  if (!row) return null;
  let parsedDetails = null;
  if (row.details) {
    try {
      parsedDetails = JSON.parse(row.details);
    } catch {
      parsedDetails = null;
    }
  }

  return {
    id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    action: row.action,
    actor_email: row.actor_email,
    details: parsedDetails,
    created_at: row.created_at,
  };
}
