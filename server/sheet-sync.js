import XLSX from 'xlsx';
import db, { encodeSkills } from './_db.js';
import { getAdminFromRequest, requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

const ALLOWED_YEARS = new Set(['1st Year', '2nd Year']);
const SKILL_CANONICAL = ['Singing', 'Games/Fun Activities', 'Dance', 'Comedy/Standup', 'Others'];

function norm(value) {
  return String(value ?? '').trim();
}

function normKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function pick(raw, aliases) {
  const entries = Object.entries(raw || {});
  const normalizedAliases = aliases.map((a) => normKey(a)).filter(Boolean);

  for (const [key, value] of entries) {
    const k = normKey(key);
    if (normalizedAliases.includes(k)) return value;
  }

  const meaningfulAliases = normalizedAliases.filter((a) => a.length >= 5);
  for (const [key, value] of entries) {
    const k = normKey(key);
    if (meaningfulAliases.some((alias) => k.includes(alias))) return value;
  }
  return '';
}

function parseSkills(value) {
  if (Array.isArray(value)) return value.map((x) => norm(x)).filter(Boolean);
  return norm(value)
    .split(/[;,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeSkillLabel(label) {
  const value = norm(label);
  const key = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (key === 'singing') return 'Singing';
  if (key === 'gamesfunactivities' || key === 'gamesactivities' || key === 'gamesfunactivity') return 'Games/Fun Activities';
  if (key === 'dance') return 'Dance';
  if (key === 'comedystandup' || key === 'standup' || key === 'comedy') return 'Comedy/Standup';
  if (key === 'others' || key === 'other') return 'Others';
  return '';
}

function parseSkillsFromYesNoColumns(raw) {
  const out = [];
  for (const [key, value] of Object.entries(raw || {})) {
    const header = String(key || '');
    if (!/showcase\s*your\s*talent/i.test(header) && !/talent\s*\[[^\]]+\]/i.test(header)) {
      continue;
    }

    const selected = parseBool(value, false);
    if (!selected) continue;

    const match = header.match(/\[([^\]]+)\]/);
    const label = normalizeSkillLabel(match?.[1] || '');
    if (label) out.push(label);
  }

  return Array.from(new Set(out));
}

function normalizeYear(value) {
  const v = norm(value).toLowerCase().replace(/\s+/g, '');
  if (v === '1' || v === '1st' || v === 'first' || v === '1styear' || v === 'firstyear') return '1st Year';
  if (v === '2' || v === '2nd' || v === 'second' || v === '2ndyear' || v === 'secondyear') return '2nd Year';
  return norm(value);
}

function normalizePhone(value) {
  const digits = norm(value).replace(/\D/g, '');
  if (digits.length === 10) return digits;
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const v = norm(value).toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'verified' || v === 'checkedin';
}

function toParticipantRow(raw) {
  const listedSkills = parseSkills(pick(raw, ['skills', 'skillset', 'interests']));
  const yesNoSkills = parseSkillsFromYesNoColumns(raw);
  const mergedSkills = Array.from(
    new Set([...listedSkills.map(normalizeSkillLabel).filter(Boolean), ...yesNoSkills])
  );

  return {
    email: norm(pick(raw, ['email', 'mail', 'emailaddress'])).toLowerCase(),
    full_name: norm(pick(raw, ['fullname', 'participantname', 'studentname', 'candidatefullname'])),
    roll_number: norm(pick(raw, ['rollnumber', 'rollno', 'roll', 'universityrollnumber'])).replace(/\s+/g, ''),
    branch: norm(pick(raw, ['branch', 'department', 'stream'])),
    year: normalizeYear(pick(raw, ['year', 'academicyear'])),
    skills: mergedSkills.filter((s) => SKILL_CANONICAL.includes(s)),
    payment_id: norm(pick(raw, ['paymentid', 'payment', 'txn', 'transactionid', 'utr', 'utrnumber'])),
    whatsapp_number: normalizePhone(pick(raw, ['whatsappnumber', 'whatsapp', 'phone', 'mobile', 'mobilenumber'])),
    payment_verified: parseBool(pick(raw, ['paymentverified', 'paymentstatus']), false),
    check_in_status: parseBool(pick(raw, ['checkinstatus', 'checkin', 'status']), false),
  };
}

function validateRow(row) {
  if (!row.email || !row.full_name || !row.roll_number || !row.branch || !row.year || !row.payment_id || !row.whatsapp_number) {
    return 'Missing required fields (email, full_name, roll_number, branch, year, payment_id, whatsapp_number)';
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) return 'Invalid email';
  if (!/^\d{13}$/.test(row.roll_number)) return 'Roll number must be exactly 13 digits';
  if (!/^\d{10}$/.test(row.whatsapp_number)) return 'WhatsApp number must be exactly 10 digits';
  if (!Array.isArray(row.skills)) return 'Skills must be a list';
  if (!ALLOWED_YEARS.has(row.year)) return 'Only 1st Year and 2nd Year are allowed';
  return null;
}

async function duplicate(field, value, currentId = null) {
  if (!value) return null;
  if (currentId) {
    return db.prepare(`SELECT id FROM participants WHERE ${field} = ? AND id != ? LIMIT 1`).get(value, currentId);
  }
  return db.prepare(`SELECT id FROM participants WHERE ${field} = ? LIMIT 1`).get(value);
}

async function detectExistingId(row) {
  const byEmail = await db.prepare('SELECT id FROM participants WHERE email = ? LIMIT 1').get(row.email);
  if (byEmail?.id) return { conflict: false, existingId: Number(byEmail.id) };

  const byPayment = await db.prepare('SELECT id FROM participants WHERE payment_id = ? LIMIT 1').get(row.payment_id);
  if (byPayment?.id) return { conflict: false, existingId: Number(byPayment.id) };

  const byRollSameEmail = await db
    .prepare('SELECT id FROM participants WHERE roll_number = ? AND email = ? LIMIT 1')
    .get(row.roll_number, row.email);
  if (byRollSameEmail?.id) return { conflict: false, existingId: Number(byRollSameEmail.id) };

  return { conflict: false, existingId: null };
}

function sheetUrlToCsvUrl(input) {
  const raw = norm(input);
  if (!raw) return '';

  if (/\/export\?/.test(raw) && /format=csv/.test(raw)) return raw;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return raw;
  }

  const match = parsed.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match?.[1]) return raw;

  const gid = parsed.searchParams.get('gid') || '0';
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
}

async function fetchRowsFromSheetUrl(sheetUrl) {
  const csvUrl = sheetUrlToCsvUrl(sheetUrl);
  if (!csvUrl) throw new Error('Google Sheet URL is required');

  const response = await fetch(csvUrl, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Failed to fetch sheet CSV (HTTP ${response.status})`);
  }
  const content = await response.text();
  const workbook = XLSX.read(content, { type: 'string' });
  const first = workbook.SheetNames[0];
  if (!first) return [];
  return XLSX.utils.sheet_to_json(workbook.Sheets[first], { defval: '' });
}

function toRawRowsFromBody(body) {
  if (Array.isArray(body?.rows)) return body.rows;
  if (body?.row && typeof body.row === 'object') return [body.row];
  return [];
}

function isWebhookAuthorized(req) {
  const configured = norm(process.env.SHEET_SYNC_SECRET);
  if (!configured) return false;
  const headerSecret = norm(req.headers['x-sheet-sync-secret']);
  const bodySecret = norm(req.body?.sync_secret);
  return configured === headerSecret || configured === bodySecret;
}

function getConfiguredSheetUrl() {
  return norm(process.env.GOOGLE_SHEET_SYNC_URL);
}

async function syncRows(rawRows) {
  let created = 0;
  let updated = 0;
  const failed = [];

  for (let i = 0; i < rawRows.length; i += 1) {
    const row = toParticipantRow(rawRows[i]);
    const rowNumber = i + 2;

    const validationError = validateRow(row);
    if (validationError) {
      failed.push({ row: rowNumber, error: validationError });
      continue;
    }

    const existing = await detectExistingId(row);
    if (existing.conflict) {
      failed.push({ row: rowNumber, error: 'Conflicting unique fields map to different existing records' });
      continue;
    }
    const existingId = existing.existingId;

    if (await duplicate('email', row.email, existingId)) {
      failed.push({ row: rowNumber, error: 'Duplicate email conflict' });
      continue;
    }
    if (await duplicate('payment_id', row.payment_id, existingId)) {
      failed.push({ row: rowNumber, error: 'Duplicate payment ID conflict' });
      continue;
    }

    const rollOwnedByDifferentEmail = await db
      .prepare('SELECT id FROM participants WHERE roll_number = ? AND email != ? LIMIT 1')
      .get(row.roll_number, row.email);
    if (rollOwnedByDifferentEmail?.id && existingId && Number(rollOwnedByDifferentEmail.id) === Number(existingId)) {
      failed.push({ row: rowNumber, error: 'Roll number belongs to a different email' });
      continue;
    }

    try {
      if (existingId) {
        await db
          .prepare(
            `
              UPDATE participants
              SET email = ?, full_name = ?, roll_number = ?, branch = ?, year = ?, skills = ?, payment_id = ?, whatsapp_number = ?,
                  payment_verified = ?, check_in_status = ?
              WHERE id = ?
            `
          )
          .run(
            row.email,
            row.full_name,
            row.roll_number,
            row.branch,
            row.year,
            encodeSkills(row.skills),
            row.payment_id,
            row.whatsapp_number,
            row.payment_verified ? 1 : 0,
            row.check_in_status ? 1 : 0,
            existingId
          );
        updated += 1;
      } else {
        await db
          .prepare(
            `
              INSERT INTO participants (email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number, payment_verified, check_in_status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
          )
          .run(
            row.email,
            row.full_name,
            row.roll_number,
            row.branch,
            row.year,
            encodeSkills(row.skills),
            row.payment_id,
            row.whatsapp_number,
            row.payment_verified ? 1 : 0,
            row.check_in_status ? 1 : 0
          );
        created += 1;
      }
    } catch (err) {
      failed.push({ row: rowNumber, error: err?.message || 'Failed to sync row' });
    }
  }

  return { created, updated, failed };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Sheet-Sync-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;
      return res.status(200).json({
        ok: true,
        sync_url_configured: Boolean(getConfiguredSheetUrl()),
        webhook_secret_configured: Boolean(norm(process.env.SHEET_SYNC_SECRET)),
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const admin = await getAdminFromRequest(req);
    const webhookAuthorized = isWebhookAuthorized(req);
    if (!admin && !webhookAuthorized) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const actorEmail = admin?.email || 'sheet-sync-webhook';
    const bodyRows = toRawRowsFromBody(req.body);
    const bodySheetUrl = norm(req.body?.sheet_url);
    const defaultSheetUrl = getConfiguredSheetUrl();

    let rawRows = [];
    let source = 'payload';

    if (bodyRows.length > 0) {
      rawRows = bodyRows;
      source = 'payload';
    } else {
      const sheetUrl = bodySheetUrl || defaultSheetUrl;
      if (!sheetUrl) {
        return res.status(400).json({ error: 'No rows provided and no sheet URL configured' });
      }
      rawRows = await fetchRowsFromSheetUrl(sheetUrl);
      source = 'sheet_url';
    }

    if (!Array.isArray(rawRows) || rawRows.length === 0) {
      return res.status(400).json({ error: 'No rows found to sync' });
    }

    const total = rawRows.length;
    const { created, updated, failed } = await syncRows(rawRows);

    await writeActivity({
      entity_type: 'participant',
      entity_id: null,
      action: 'registration_sheet_synced',
      actor_email: actorEmail,
      details: { source, total, created, updated, failed: failed.length },
    });

    return res.status(200).json({
      ok: true,
      source,
      total,
      created,
      updated,
      failed_count: failed.length,
      failed,
    });
  } catch (err) {
    console.error('Sheet sync API error:', err);
    return res.status(500).json({ error: err.message || 'Sheet sync failed' });
  }
}
