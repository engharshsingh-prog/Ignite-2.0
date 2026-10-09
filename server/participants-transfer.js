import XLSX from 'xlsx';
import db, { encodeSkills, toParticipant } from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';

const ALLOWED_YEARS = new Set(['1st Year', '2nd Year']);

function csvEscape(value) {
  const raw = String(value ?? '');
  if (/[",\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(content) {
  const lines = String(content || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => String(h || '').trim());
  const rows = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? '';
    });
    rows.push(row);
  }
  return rows;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return Buffer.from(match[2], 'base64');
}

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
  for (const [key, value] of entries) {
    const k = normKey(key);
    if (aliases.includes(k)) return value;
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

function parseBool(value, fallback = false) {
  if (value === true || value === false) return value;
  const v = norm(value).toLowerCase();
  if (!v) return fallback;
  return v === '1' || v === 'true' || v === 'yes' || v === 'y' || v === 'verified' || v === 'checkedin';
}

function normalizeYear(value) {
  const v = norm(value).toLowerCase();
  if (v === '1' || v === '1st' || v === 'first' || v === '1styear' || v === 'firstyear') return '1st Year';
  if (v === '2' || v === '2nd' || v === 'second' || v === '2ndyear' || v === 'secondyear') return '2nd Year';
  return norm(value);
}

function validateParticipantRow(row) {
  if (!row.email || !row.full_name || !row.roll_number || !row.branch || !row.year || row.skills === undefined || !row.payment_id || !row.whatsapp_number) {
    return 'All required participant fields must be present';
  }
  if (!/^\d{13}$/.test(String(row.roll_number))) return 'Roll number must be exactly 13 digits';
  if (!/^\d{10}$/.test(String(row.whatsapp_number))) return 'WhatsApp number must be exactly 10 digits';
  if (!Array.isArray(row.skills)) return 'Skills must be an array or comma-separated list';
  if (!ALLOWED_YEARS.has(row.year)) return 'Only 1st Year and 2nd Year registrations are allowed';
  return null;
}

async function duplicate(field, value, currentId = null) {
  if (!value) return null;
  if (currentId) {
    return db.prepare(`SELECT id FROM participants WHERE ${field} = ? AND id != ? LIMIT 1`).get(value, currentId);
  }
  return db.prepare(`SELECT id FROM participants WHERE ${field} = ? LIMIT 1`).get(value);
}

function toTransferRow(raw) {
  return {
    email: norm(pick(raw, ['email', 'mail'])).toLowerCase(),
    full_name: norm(pick(raw, ['fullname', 'name', 'participantname'])),
    roll_number: norm(pick(raw, ['rollnumber', 'rollno', 'roll'])),
    branch: norm(pick(raw, ['branch', 'department'])),
    year: normalizeYear(pick(raw, ['year', 'academicyear'])),
    skills: parseSkills(pick(raw, ['skills', 'skillset'])),
    payment_id: norm(pick(raw, ['paymentid', 'payment', 'txn', 'transactionid'])),
    whatsapp_number: norm(pick(raw, ['whatsappnumber', 'whatsapp', 'phone', 'mobile'])),
    payment_verified: parseBool(pick(raw, ['paymentverified', 'paymentstatus']), false),
    check_in_status: parseBool(pick(raw, ['checkinstatus', 'checkin', 'status']), false),
  };
}

async function participantsForExport() {
  const rows = (await db.prepare('SELECT * FROM participants ORDER BY registered_at DESC').all()).map(toParticipant);
  return rows.map((row) => ({
    id: row.id,
    full_name: row.full_name,
    email: row.email,
    roll_number: row.roll_number,
    branch: row.branch,
    year: row.year,
    skills: (row.skills || []).join(', '),
    payment_id: row.payment_id,
    whatsapp_number: row.whatsapp_number,
    payment_verified: row.payment_verified ? 1 : 0,
    check_in_status: row.check_in_status ? 1 : 0,
    check_in_time: row.check_in_time || '',
    registered_at: row.registered_at || '',
  }));
}

function readImportRows(fileName, dataUrl) {
  const buffer = parseDataUrl(dataUrl);
  if (!buffer) throw new Error('Invalid file payload');

  const lower = String(fileName || '').toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const firstSheet = wb.SheetNames[0];
    if (!firstSheet) return [];
    return XLSX.utils.sheet_to_json(wb.Sheets[firstSheet], { defval: '' });
  }

  const content = buffer.toString('utf8');
  return parseCsv(content);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    if (req.method === 'GET') {
      const format = String(req.query?.format || 'csv').toLowerCase();
      const rows = await participantsForExport();
      const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);

      if (format === 'xlsx' || format === 'excel') {
        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Participants');
        const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="ignite26-participants-${stamp}.xlsx"`);
        return res.status(200).send(buffer);
      }

      const headers = Object.keys(rows[0] || {
        id: '', full_name: '', email: '', roll_number: '', branch: '', year: '', skills: '', payment_id: '', whatsapp_number: '',
        payment_verified: '', check_in_status: '', check_in_time: '', registered_at: '',
      });
      const csv = [
        headers.map(csvEscape).join(','),
        ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(',')),
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ignite26-participants-${stamp}.csv"`);
      return res.status(200).send(csv);
    }

    if (req.method === 'POST') {
      const { file_name, file_data_url } = req.body || {};
      if (!file_name || !file_data_url) {
        return res.status(400).json({ error: 'file_name and file_data_url are required' });
      }

      const rawRows = readImportRows(file_name, file_data_url);
      const total = rawRows.length;
      if (total === 0) return res.status(400).json({ error: 'No rows found in import file' });

      let created = 0;
      let updated = 0;
      const failed = [];

      for (let i = 0; i < rawRows.length; i += 1) {
        const raw = rawRows[i];
        const rowNum = i + 2;
        const row = toTransferRow(raw);

        const validationError = validateParticipantRow(row);
        if (validationError) {
          failed.push({ row: rowNum, error: validationError });
          continue;
        }

        let existing = await db.prepare('SELECT * FROM participants WHERE email = ? LIMIT 1').get(row.email);
        const existingId = existing?.id || null;

        if (await duplicate('email', row.email, existingId)) {
          failed.push({ row: rowNum, error: 'Duplicate email conflict' });
          continue;
        }
        if (await duplicate('payment_id', row.payment_id, existingId)) {
          failed.push({ row: rowNum, error: 'Duplicate payment ID conflict' });
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
          failed.push({ row: rowNum, error: err?.message || 'Failed to import row' });
        }
      }

      await writeActivity({
        entity_type: 'participant',
        entity_id: null,
        action: 'registration_imported',
        actor_email: admin.email,
        details: { total, created, updated, failed: failed.length, file_name },
      });

      return res.status(200).json({
        ok: true,
        total,
        created,
        updated,
        failed_count: failed.length,
        failed,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Participants transfer API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
