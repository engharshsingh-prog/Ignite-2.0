import crypto from 'crypto';
import db, { toParticipant } from './_db.js';

function normalize(value) {
  return String(value ?? '').trim();
}

function normalizePhone(value) {
  const digits = normalize(value).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

async function loadAccess() {
  return db.prepare('SELECT * FROM validation_handler_access WHERE id = 1').get();
}

async function isAuthorized(token, password) {
  const access = await loadAccess();
  if (!access || !access.enabled) return false;
  if (String(access.token || '') !== normalize(token)) return false;
  const passwordHash = crypto.createHash('sha256').update(normalize(password)).digest('hex');
  return passwordHash === String(access.password_hash || '');
}

function parsePayloadToLookupValue(payload) {
  const raw = normalize(payload);
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    const fromJson =
      normalize(parsed?.roll_number)
      || normalize(parsed?.rollNumber)
      || normalize(parsed?.payment_id)
      || normalize(parsed?.paymentId)
      || normalize(parsed?.email)
      || normalize(parsed?.whatsapp_number)
      || normalize(parsed?.whatsapp)
      || normalize(parsed?.id);
    if (fromJson) return fromJson;
  } catch {
    // ignore non-JSON payloads
  }

  return raw;
}

async function findParticipants(value) {
  const lookup = normalize(value);
  if (!lookup) return [];

  if (/^\d+$/.test(lookup)) {
    const byId = await db.prepare('SELECT * FROM participants WHERE id = ? LIMIT 1').get(Number(lookup));
    if (byId) return [toParticipant(byId)];

    const digits = normalizePhone(lookup);
    if (/^\d{13}$/.test(lookup)) {
      const byRoll = await db.prepare('SELECT * FROM participants WHERE roll_number = ? LIMIT 1').get(lookup);
      if (byRoll) return [toParticipant(byRoll)];
    }
    if (/^\d{10}$/.test(digits)) {
      const byPhone = await db.prepare('SELECT * FROM participants WHERE whatsapp_number = ? LIMIT 1').get(digits);
      if (byPhone) return [toParticipant(byPhone)];
    }
  }

  const email = lookup.toLowerCase();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const byEmail = await db.prepare('SELECT * FROM participants WHERE lower(email) = lower(?) LIMIT 1').get(email);
    if (byEmail) return [toParticipant(byEmail)];
  }

  const byPayment = await db.prepare('SELECT * FROM participants WHERE payment_id = ? LIMIT 1').get(lookup);
  if (byPayment) return [toParticipant(byPayment)];

  const needle = `%${lookup}%`;
  return (await db
    .prepare(
      `
        SELECT *
        FROM participants
        WHERE full_name LIKE ? OR roll_number LIKE ? OR email LIKE ? OR payment_id LIKE ? OR whatsapp_number LIKE ?
        ORDER BY registered_at DESC
        LIMIT 20
      `
    )
    .all(needle, needle, needle, needle, needle)).map(toParticipant);
}

async function exportParticipants() {
  return (await db
    .prepare(
      `
        SELECT *
        FROM participants
        ORDER BY registered_at DESC
      `
    )
    .all()).map(toParticipant);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { token, password, action } = req.body || {};
    if (!(await isAuthorized(token, password))) {
      return res.status(401).json({ error: 'Invalid handler access or password' });
    }

    if (action === 'verify') {
      return res.status(200).json({ ok: true });
    }

    if (action === 'lookup') {
      const value = parsePayloadToLookupValue(req.body?.qr_text || req.body?.query || '');
      if (!value) return res.status(400).json({ error: 'query or qr_text is required' });
      const rows = await findParticipants(value);
      return res.status(200).json({ ok: true, rows, count: rows.length });
    }

    if (action === 'export') {
      const rows = await exportParticipants();
      return res.status(200).json({ ok: true, rows, count: rows.length });
    }

    if (action === 'update') {
      const participantId = Number(req.body?.participant_id);
      if (!participantId) return res.status(400).json({ error: 'participant_id is required' });

      const existing = await db.prepare('SELECT * FROM participants WHERE id = ? LIMIT 1').get(participantId);
      if (!existing) return res.status(404).json({ error: 'Participant not found' });

      const hasPayment = typeof req.body?.payment_verified === 'boolean';
      const hasCheckin = typeof req.body?.check_in_status === 'boolean';
      if (!hasPayment && !hasCheckin) {
        return res.status(400).json({ error: 'At least one of payment_verified or check_in_status is required' });
      }

      const paymentVerified = hasPayment ? (req.body.payment_verified ? 1 : 0) : existing.payment_verified;
      const checkinStatus = hasCheckin ? (req.body.check_in_status ? 1 : 0) : existing.check_in_status;
      const checkinTime = hasCheckin ? (req.body.check_in_status ? new Date().toISOString() : null) : existing.check_in_time;

      await db
        .prepare(
          `
            UPDATE participants
            SET payment_verified = ?, check_in_status = ?, check_in_time = ?
            WHERE id = ?
          `
        )
        .run(paymentVerified, checkinStatus, checkinTime, participantId);

      const updated = toParticipant(await db.prepare('SELECT * FROM participants WHERE id = ?').get(participantId));
      return res.status(200).json({ ok: true, participant: updated });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (err) {
    console.error('Validation handler API error:', err);
    return res.status(500).json({ error: err.message || 'Validation handler failed' });
  }
}
