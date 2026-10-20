import db from './_db.js';
import { requireAdmin } from './_auth.js';
import { writeActivity } from './_activity.js';
import { storeMediaUpload } from './_media-storage.js';

const DEFAULT_SETTINGS = {
  title: 'Ignite 2.O',
  date_label: '',
  time_label: '',
  venue: '',
  dress_code_male: 'Formals',
  dress_code_female: 'Western Wear',
  countdown_iso: '',
  flow: [],
  support_note: 'Payment verification may take 2-3 days. Please wait for confirmation from the support team.',
  fee_1st_year: 599,
  fee_2nd_year: 699,
  qr_1st_year_url: '/payment-qr-1st-year.png',
  qr_2nd_year_url: '/payment-qr-2nd-year.png',
  upi_id_1st_year: 'ysamarjeetyadav2334@okaxis',
  upi_id_2nd_year: 'ysamarjeetyadav2334@okaxis',
  upi_name_1st_year: 'Samarjeet Yadav',
  upi_name_2nd_year: 'Samarjeet Yadav',
  registration_1st_year_enabled: 1,
  registration_2nd_year_enabled: 1,
  registration_updated_by: null,
};

const safeText = (value, fallback) => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed : fallback;
};

const normalizeFlow = (value, fallback = []) => {
  if (!Array.isArray(value)) return fallback;
  const cleaned = value
    .map((item) => ({
      time: typeof item?.time === 'string' ? item.time.trim() : '',
      title: typeof item?.title === 'string' ? item.title.trim() : '',
      desc: typeof item?.desc === 'string' ? item.desc.trim() : '',
    }))
    .filter((item) => item.time || item.title || item.desc);
  return cleaned;
};

const parseFlowJson = (value) => {
  if (!value) return [];
  try {
    return normalizeFlow(JSON.parse(value), []);
  } catch {
    return [];
  }
};

let columnsEnsured = false;
export async function ensureEventSettingsColumns() {
  if (columnsEnsured) return;
  const cols = [
    { name: 'fee_1st_year', sql: 'ALTER TABLE event_settings ADD COLUMN fee_1st_year INTEGER DEFAULT 599' },
    { name: 'fee_2nd_year', sql: 'ALTER TABLE event_settings ADD COLUMN fee_2nd_year INTEGER DEFAULT 699' },
    { name: 'qr_1st_year_url', sql: "ALTER TABLE event_settings ADD COLUMN qr_1st_year_url TEXT DEFAULT '/payment-qr-1st-year.png'" },
    { name: 'qr_2nd_year_url', sql: "ALTER TABLE event_settings ADD COLUMN qr_2nd_year_url TEXT DEFAULT '/payment-qr-2nd-year.png'" },
    { name: 'upi_id_1st_year', sql: "ALTER TABLE event_settings ADD COLUMN upi_id_1st_year TEXT DEFAULT 'ysamarjeetyadav2334@okaxis'" },
    { name: 'upi_id_2nd_year', sql: "ALTER TABLE event_settings ADD COLUMN upi_id_2nd_year TEXT DEFAULT 'ysamarjeetyadav2334@okaxis'" },
    { name: 'upi_name_1st_year', sql: "ALTER TABLE event_settings ADD COLUMN upi_name_1st_year TEXT DEFAULT 'Samarjeet Yadav'" },
    { name: 'upi_name_2nd_year', sql: "ALTER TABLE event_settings ADD COLUMN upi_name_2nd_year TEXT DEFAULT 'Samarjeet Yadav'" },
    { name: 'registration_1st_year_enabled', sql: 'ALTER TABLE event_settings ADD COLUMN registration_1st_year_enabled INTEGER DEFAULT 1' },
    { name: 'registration_2nd_year_enabled', sql: 'ALTER TABLE event_settings ADD COLUMN registration_2nd_year_enabled INTEGER DEFAULT 1' },
    { name: 'registration_updated_by', sql: 'ALTER TABLE event_settings ADD COLUMN registration_updated_by TEXT DEFAULT NULL' },
  ];
  for (const c of cols) {
    try {
      await db.prepare(c.sql).run();
    } catch (_) {}
  }
  try {
    await db.prepare('ALTER TABLE participants ADD COLUMN payment_amount INTEGER DEFAULT NULL').run();
  } catch (_) {}
  columnsEnsured = true;
}

async function ensureRow() {
  await ensureEventSettingsColumns();
  let row = await db.prepare('SELECT * FROM event_settings WHERE id = 1').get();
  if (!row) {
    await db
      .prepare(
        `
          INSERT INTO event_settings (
            id, title, date_label, time_label, venue, dress_code_male, dress_code_female,
            countdown_iso, flow_json, support_note, fee_1st_year, fee_2nd_year,
            qr_1st_year_url, qr_2nd_year_url, upi_id_1st_year, upi_id_2nd_year,
            upi_name_1st_year, upi_name_2nd_year, updated_at
          )
          VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        DEFAULT_SETTINGS.title,
        DEFAULT_SETTINGS.date_label,
        DEFAULT_SETTINGS.time_label,
        DEFAULT_SETTINGS.venue,
        DEFAULT_SETTINGS.dress_code_male,
        DEFAULT_SETTINGS.dress_code_female,
        DEFAULT_SETTINGS.countdown_iso,
        JSON.stringify(DEFAULT_SETTINGS.flow),
        DEFAULT_SETTINGS.support_note,
        DEFAULT_SETTINGS.fee_1st_year,
        DEFAULT_SETTINGS.fee_2nd_year,
        DEFAULT_SETTINGS.qr_1st_year_url,
        DEFAULT_SETTINGS.qr_2nd_year_url,
        DEFAULT_SETTINGS.upi_id_1st_year,
        DEFAULT_SETTINGS.upi_id_2nd_year,
        DEFAULT_SETTINGS.upi_name_1st_year,
        DEFAULT_SETTINGS.upi_name_2nd_year,
        new Date().toISOString()
      );
    row = await db.prepare('SELECT * FROM event_settings WHERE id = 1').get();
  }
  return row;
}

function toEventSettings(row) {
  if (!row) return null;
  return {
    title: row.title,
    date_label: row.date_label,
    time_label: row.time_label,
    venue: row.venue,
    dress_code_male: row.dress_code_male,
    dress_code_female: row.dress_code_female,
    countdown_iso: row.countdown_iso,
    flow: parseFlowJson(row.flow_json),
    support_note: typeof row.support_note === 'string' ? row.support_note : DEFAULT_SETTINGS.support_note,
    fee_1st_year: row.fee_1st_year != null ? Number(row.fee_1st_year) : DEFAULT_SETTINGS.fee_1st_year,
    fee_2nd_year: row.fee_2nd_year != null ? Number(row.fee_2nd_year) : DEFAULT_SETTINGS.fee_2nd_year,
    qr_1st_year_url: row.qr_1st_year_url || DEFAULT_SETTINGS.qr_1st_year_url,
    qr_2nd_year_url: row.qr_2nd_year_url || DEFAULT_SETTINGS.qr_2nd_year_url,
    upi_id_1st_year: row.upi_id_1st_year || DEFAULT_SETTINGS.upi_id_1st_year,
    upi_id_2nd_year: row.upi_id_2nd_year || DEFAULT_SETTINGS.upi_id_2nd_year,
    upi_name_1st_year: row.upi_name_1st_year || DEFAULT_SETTINGS.upi_name_1st_year,
    upi_name_2nd_year: row.upi_name_2nd_year || DEFAULT_SETTINGS.upi_name_2nd_year,
    registration_1st_year_enabled: row.registration_1st_year_enabled !== undefined && row.registration_1st_year_enabled !== null ? Boolean(row.registration_1st_year_enabled) : true,
    registration_2nd_year_enabled: row.registration_2nd_year_enabled !== undefined && row.registration_2nd_year_enabled !== null ? Boolean(row.registration_2nd_year_enabled) : true,
    registration_updated_by: row.registration_updated_by || null,
    updated_at: row.updated_at || null,
  };
}

function normalizeCountdown(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  if (!trimmed) return '';
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return trimmed;
}

async function handleQrImageUpload(possibleDataUrl, fallbackUrl) {
  if (typeof possibleDataUrl !== 'string') return fallbackUrl;
  const trimmed = possibleDataUrl.trim();
  if (!trimmed) return fallbackUrl;
  if (trimmed.startsWith('data:image/')) {
    try {
      const uploadResult = await storeMediaUpload({
        category: 'payment-qr',
        originalDataUrl: trimmed,
      });
      if (uploadResult?.url) return uploadResult.url;
    } catch (uploadErr) {
      console.error('Failed to store QR code upload:', uploadErr);
    }
  }
  return trimmed;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const row = await ensureRow();
      return res.status(200).json(toEventSettings(row));
    }

    if (req.method === 'PUT') {
      const admin = await requireAdmin(req, res);
      if (!admin) return;

      const current = await ensureRow();
      const countdown = normalizeCountdown(req.body?.countdown_iso, current?.countdown_iso || '');
      if (countdown === null) return res.status(400).json({ error: 'countdown_iso must be a valid date string' });

      const flow = normalizeFlow(req.body?.flow, parseFlowJson(current?.flow_json));
      const updated_at = new Date().toISOString();

      const qr1st = await handleQrImageUpload(req.body?.qr_1st_year_url, current?.qr_1st_year_url || DEFAULT_SETTINGS.qr_1st_year_url);
      const qr2nd = await handleQrImageUpload(req.body?.qr_2nd_year_url, current?.qr_2nd_year_url || DEFAULT_SETTINGS.qr_2nd_year_url);

      const fee1st = req.body?.fee_1st_year != null && !isNaN(Number(req.body.fee_1st_year))
        ? Math.max(0, Math.round(Number(req.body.fee_1st_year)))
        : (current?.fee_1st_year != null ? Number(current.fee_1st_year) : DEFAULT_SETTINGS.fee_1st_year);

      const fee2nd = req.body?.fee_2nd_year != null && !isNaN(Number(req.body.fee_2nd_year))
        ? Math.max(0, Math.round(Number(req.body.fee_2nd_year)))
        : (current?.fee_2nd_year != null ? Number(current.fee_2nd_year) : DEFAULT_SETTINGS.fee_2nd_year);

      const payload = {
        title: safeText(req.body?.title, current?.title || DEFAULT_SETTINGS.title),
        date_label: typeof req.body?.date_label === 'string' ? req.body.date_label.trim() : (current?.date_label || ''),
        time_label: typeof req.body?.time_label === 'string' ? req.body.time_label.trim() : (current?.time_label || ''),
        venue: typeof req.body?.venue === 'string' ? req.body.venue.trim() : (current?.venue || ''),
        dress_code_male: safeText(req.body?.dress_code_male, current?.dress_code_male || DEFAULT_SETTINGS.dress_code_male),
        dress_code_female: safeText(req.body?.dress_code_female, current?.dress_code_female || DEFAULT_SETTINGS.dress_code_female),
        countdown_iso: countdown,
        flow_json: JSON.stringify(flow),
        support_note: safeText(req.body?.support_note, current?.support_note || DEFAULT_SETTINGS.support_note),
        fee_1st_year: fee1st,
        fee_2nd_year: fee2nd,
        qr_1st_year_url: qr1st,
        qr_2nd_year_url: qr2nd,
        upi_id_1st_year: safeText(req.body?.upi_id_1st_year, current?.upi_id_1st_year || DEFAULT_SETTINGS.upi_id_1st_year),
        upi_id_2nd_year: safeText(req.body?.upi_id_2nd_year, current?.upi_id_2nd_year || DEFAULT_SETTINGS.upi_id_2nd_year),
        upi_name_1st_year: safeText(req.body?.upi_name_1st_year, current?.upi_name_1st_year || DEFAULT_SETTINGS.upi_name_1st_year),
        upi_name_2nd_year: safeText(req.body?.upi_name_2nd_year, current?.upi_name_2nd_year || DEFAULT_SETTINGS.upi_name_2nd_year),
        updated_at,
      };

      await db
        .prepare(
          `
            UPDATE event_settings
            SET title = ?, date_label = ?, time_label = ?, venue = ?, dress_code_male = ?, dress_code_female = ?,
                countdown_iso = ?, flow_json = ?, support_note = ?,
                fee_1st_year = ?, fee_2nd_year = ?, qr_1st_year_url = ?, qr_2nd_year_url = ?,
                upi_id_1st_year = ?, upi_id_2nd_year = ?, upi_name_1st_year = ?, upi_name_2nd_year = ?,
                updated_at = ?
            WHERE id = 1
          `
        )
        .run(
          payload.title,
          payload.date_label,
          payload.time_label,
          payload.venue,
          payload.dress_code_male,
          payload.dress_code_female,
          payload.countdown_iso,
          payload.flow_json,
          payload.support_note,
          payload.fee_1st_year,
          payload.fee_2nd_year,
          payload.qr_1st_year_url,
          payload.qr_2nd_year_url,
          payload.upi_id_1st_year,
          payload.upi_id_2nd_year,
          payload.upi_name_1st_year,
          payload.upi_name_2nd_year,
          payload.updated_at
        );

      await writeActivity({
        entity_type: 'event_settings',
        entity_id: 1,
        action: 'updated',
        actor_email: admin.email,
        details: {
          title: payload.title,
          date_label: payload.date_label,
          fee_1st_year: payload.fee_1st_year,
          fee_2nd_year: payload.fee_2nd_year,
          qr_1st_year_url: payload.qr_1st_year_url,
          qr_2nd_year_url: payload.qr_2nd_year_url,
        },
      });

      return res.status(200).json(toEventSettings({ ...payload }));
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Event settings API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
