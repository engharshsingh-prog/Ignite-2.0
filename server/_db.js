import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { createClient } from '@libsql/client';

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

export const adminCredentials = (() => {
  const credentials = new Map();
  try {
    const configured = JSON.parse(String(process.env.ADMIN_CREDENTIALS_JSON || '{}'));
    for (const [email, password] of Object.entries(configured)) {
      const normalized = email.trim().toLowerCase();
      if (typeof password === 'string' && password.length >= 8) credentials.set(normalized, password);
    }
  } catch {
    console.error('[auth] ADMIN_CREDENTIALS_JSON must be valid JSON; no admin credentials were provisioned from it.');
  }
  const legacyEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const legacyPassword = String(process.env.ADMIN_PASSWORD || '');
  if (legacyPassword.length >= 8 && !credentials.has(legacyEmail)) credentials.set(legacyEmail, legacyPassword);
  return credentials;
})();
const tursoUrl = String(process.env.TURSO_DATABASE_URL || '').trim();
const tursoAuthToken = String(process.env.TURSO_AUTH_TOKEN || '').trim() || undefined;

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

function resolveLocalDatabaseUrl() {
  const isVercel = Boolean(process.env.VERCEL);
  const defaultLocalPath = isVercel
    ? path.join('/tmp', 'ignite26.db')
    : path.join(process.cwd(), 'data', 'ignite26.db');
  const configuredPath = String(process.env.SQLITE_DB_PATH || defaultLocalPath).trim();
  const absolutePath = isVercel
    ? (path.isAbsolute(configuredPath) ? configuredPath : path.join('/tmp', path.basename(configuredPath || 'ignite26.db')))
    : (path.isAbsolute(configuredPath) ? configuredPath : path.join(process.cwd(), configuredPath));
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  return pathToFileURL(absolutePath).href;
}

const localDatabaseUrl = resolveLocalDatabaseUrl();
let activeDatabaseUrl = tursoUrl || localDatabaseUrl;
let activeClient = createClient({
  url: activeDatabaseUrl,
  authToken: activeDatabaseUrl === tursoUrl ? tursoAuthToken : undefined,
});

function switchToLocalDatabase(error) {
  if (activeDatabaseUrl === localDatabaseUrl || !tursoUrl) return false;
  console.warn(`[db] Remote database unavailable (${error?.cause?.code || error?.code || error?.message || 'unknown error'}). Falling back to local SQLite at ${localDatabaseUrl}`);
  activeDatabaseUrl = localDatabaseUrl;
  activeClient = createClient({ url: localDatabaseUrl });
  return true;
}

function normalizeRow(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row));
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

async function executeStatement(sql, args = []) {
  let result;
  try {
    result = await activeClient.execute({ sql, args });
  } catch (error) {
    if (!switchToLocalDatabase(error)) throw error;
    result = await activeClient.execute({ sql, args });
  }
  return {
    rows: normalizeRows(result.rows),
    rowsAffected: Number(result.rowsAffected || 0),
    lastInsertRowid: result.lastInsertRowid == null ? undefined : Number(result.lastInsertRowid),
  };
}

const schemaStatements = [
  `
    CREATE TABLE IF NOT EXISTS participants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      branch TEXT NOT NULL,
      year TEXT NOT NULL,
      skills TEXT NOT NULL DEFAULT '[]',
      payment_id TEXT UNIQUE DEFAULT NULL,
      whatsapp_number TEXT NOT NULL,
      payment_verified INTEGER NOT NULL DEFAULT 0,
      check_in_status INTEGER NOT NULL DEFAULT 0,
      check_in_time TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      approval_status TEXT NOT NULL DEFAULT 'pending_approval',
      registration_id TEXT UNIQUE,
      step2_token TEXT,
      step2_token_expires_at TEXT,
      approved_at TEXT,
      approved_by TEXT,
      rejected_at TEXT,
      rejected_by TEXT,
      rejection_reason TEXT,
      approval_email_sent INTEGER NOT NULL DEFAULT 0,
      approval_email_error TEXT,
      CHECK (length(roll_number) <= 15),
      CHECK (length(whatsapp_number) = 10)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      thumb_url TEXT NOT NULL DEFAULT '',
      caption TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'approved',
      uploaded_by TEXT NOT NULL DEFAULT 'admin',
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS winners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id INTEGER,
      name TEXT NOT NULL,
      roll_no TEXT,
      branch TEXT,
      award_title TEXT NOT NULL,
      image_url TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES auth_users(id)
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS management_team (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      branch TEXT NOT NULL,
      year TEXT NOT NULL,
      roles TEXT NOT NULL DEFAULT '[]',
      fields TEXT NOT NULL DEFAULT '',
      profile_image TEXT NOT NULL DEFAULT '',
      whatsapp_number TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      action TEXT NOT NULL,
      actor_email TEXT NOT NULL,
      details TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS email_otp_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      consumed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS participant_share_access (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS registration_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS public_media_control (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      enabled INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS validation_handler_access (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      token TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS event_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      title TEXT NOT NULL,
      date_label TEXT NOT NULL,
      time_label TEXT NOT NULL,
      venue TEXT NOT NULL,
      dress_code_male TEXT NOT NULL,
      dress_code_female TEXT NOT NULL,
      countdown_iso TEXT NOT NULL,
      flow_json TEXT NOT NULL DEFAULT '[]',
      support_note TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS admin_access_requests (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      session_id TEXT NOT NULL,
      ip TEXT NOT NULL DEFAULT '',
      user_agent TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      requested_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      resolved_at TEXT,
      resolved_by TEXT,
      FOREIGN KEY (user_id) REFERENCES auth_users(id),
      FOREIGN KEY (session_id) REFERENCES auth_sessions(id)
    )
  `,
];

async function columnExists(tableName, columnName) {
  const result = await executeStatement(`PRAGMA table_info(${tableName})`);
  return result.rows.some((column) => column.name === columnName);
}

async function ensureColumn(tableName, columnName, definition) {
  if (!(await columnExists(tableName, columnName))) {
    await executeStatement(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

async function getUniqueIndexesForTable(tableName) {
  const indexes = await executeStatement(`PRAGMA index_list(${tableName})`);
  const uniqueIndexes = [];
  for (const idx of indexes.rows) {
    if (!idx?.name || !idx?.unique) continue;
    const info = await executeStatement(`PRAGMA index_info(${idx.name})`);
    uniqueIndexes.push({
      name: idx.name,
      columns: info.rows.map((row) => row.name).filter(Boolean),
    });
  }
  return uniqueIndexes;
}

async function migrateParticipantsUniqueness() {
  const uniqueIndexes = await getUniqueIndexesForTable('participants');
  const hasLegacyRollUnique = uniqueIndexes.some((idx) => idx.columns.length === 1 && idx.columns[0] === 'roll_number');
  const hasLegacyWhatsappUnique = uniqueIndexes.some((idx) => idx.columns.length === 1 && idx.columns[0] === 'whatsapp_number');
  if (!hasLegacyRollUnique && !hasLegacyWhatsappUnique) return;

  let savepointStarted = false;
  try {
    await executeStatement('SAVEPOINT participants_uniqueness_migration');
    savepointStarted = true;
    await executeStatement(`
      CREATE TABLE IF NOT EXISTS participants__migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        branch TEXT NOT NULL,
        year TEXT NOT NULL,
        skills TEXT NOT NULL DEFAULT '[]',
        payment_id TEXT NOT NULL UNIQUE,
        whatsapp_number TEXT NOT NULL,
        payment_verified INTEGER NOT NULL DEFAULT 0,
        check_in_status INTEGER NOT NULL DEFAULT 0,
        check_in_time TEXT,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (length(roll_number) <= 15),
        CHECK (length(whatsapp_number) = 10)
      )
    `);

    await executeStatement(`
      INSERT INTO participants__migrated (
        id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
        payment_verified, check_in_status, check_in_time, registered_at
      )
      SELECT
        id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
        payment_verified, check_in_status, check_in_time, registered_at
      FROM participants
    `);

    await executeStatement('DROP TABLE participants');
    await executeStatement('ALTER TABLE participants__migrated RENAME TO participants');
    await executeStatement('RELEASE SAVEPOINT participants_uniqueness_migration');
  } catch (error) {
    if (savepointStarted) {
      try {
        await executeStatement('ROLLBACK TO SAVEPOINT participants_uniqueness_migration');
        await executeStatement('RELEASE SAVEPOINT participants_uniqueness_migration');
      } catch {
        // ignore rollback errors
      }
    }
    throw error;
  }
}

async function migrateParticipantsRollConstraint() {
  const tableDef = await executeStatement("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'participants'");
  const currentSql = tableDef.rows[0]?.sql || '';
  if (!currentSql.includes('length(roll_number) = 13')) return;

  let savepointStarted = false;
  try {
    await executeStatement('SAVEPOINT participants_roll_migration');
    savepointStarted = true;
    await executeStatement(`
      CREATE TABLE IF NOT EXISTS participants__migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        roll_number TEXT NOT NULL,
        branch TEXT NOT NULL,
        year TEXT NOT NULL,
        skills TEXT NOT NULL DEFAULT '[]',
        payment_id TEXT NOT NULL UNIQUE,
        whatsapp_number TEXT NOT NULL,
        payment_verified INTEGER NOT NULL DEFAULT 0,
        check_in_status INTEGER NOT NULL DEFAULT 0,
        check_in_time TEXT,
        registered_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (length(roll_number) <= 15),
        CHECK (length(whatsapp_number) = 10)
      )
    `);

    await executeStatement(`
      INSERT INTO participants__migrated (
        id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
        payment_verified, check_in_status, check_in_time, registered_at
      )
      SELECT
        id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
        payment_verified, check_in_status, check_in_time, registered_at
      FROM participants
    `);

    await executeStatement('DROP TABLE participants');
    await executeStatement('ALTER TABLE participants__migrated RENAME TO participants');
    await executeStatement('RELEASE SAVEPOINT participants_roll_migration');
    console.log('[db] Successfully migrated participants table roll_number check constraint to <= 15');
  } catch (error) {
    if (savepointStarted) {
      try {
        await executeStatement('ROLLBACK TO SAVEPOINT participants_roll_migration');
        await executeStatement('RELEASE SAVEPOINT participants_roll_migration');
      } catch {
        // ignore rollback errors
      }
    }
    console.error('[db] Failed to migrate participants roll_number constraint:', error);
    throw error;
  }
}

async function migrateParticipantsApprovalSchema() {
  const tableDef = await executeStatement("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'participants'");
  const currentSql = tableDef.rows[0]?.sql || '';

  const hasPaymentNotNull = currentSql.includes('payment_id TEXT NOT NULL');
  if (hasPaymentNotNull) {
    let savepointStarted = false;
    try {
      await executeStatement('SAVEPOINT participants_approval_migration');
      savepointStarted = true;
      await executeStatement(`
        CREATE TABLE IF NOT EXISTS participants__approval_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          full_name TEXT NOT NULL,
          roll_number TEXT NOT NULL,
          branch TEXT NOT NULL,
          year TEXT NOT NULL,
          skills TEXT NOT NULL DEFAULT '[]',
          payment_id TEXT UNIQUE DEFAULT NULL,
          whatsapp_number TEXT NOT NULL,
          payment_verified INTEGER NOT NULL DEFAULT 0,
          check_in_status INTEGER NOT NULL DEFAULT 0,
          check_in_time TEXT,
          registered_at TEXT NOT NULL DEFAULT (datetime('now')),
          approval_status TEXT NOT NULL DEFAULT 'pending_approval',
          registration_id TEXT UNIQUE,
          step2_token TEXT,
          step2_token_expires_at TEXT,
          approved_at TEXT,
          approved_by TEXT,
          rejected_at TEXT,
          rejected_by TEXT,
          rejection_reason TEXT,
          approval_email_sent INTEGER NOT NULL DEFAULT 0,
          approval_email_error TEXT,
          CHECK (length(roll_number) <= 15),
          CHECK (length(whatsapp_number) = 10)
        )
      `);

      await executeStatement(`
        INSERT INTO participants__approval_migrated (
          id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
          payment_verified, check_in_status, check_in_time, registered_at,
          approval_status, registration_id
        )
        SELECT
          id, email, full_name, roll_number, branch, year, skills, payment_id, whatsapp_number,
          payment_verified, check_in_status, check_in_time, registered_at,
          'approved', 'IGN26-' || printf('%04d', id)
        FROM participants
      `);

      await executeStatement('DROP TABLE participants');
      await executeStatement('ALTER TABLE participants__approval_migrated RENAME TO participants');
      await executeStatement('RELEASE SAVEPOINT participants_approval_migration');
      console.log('[db] Successfully migrated participants table to support approval workflow');
    } catch (error) {
      if (savepointStarted) {
        try {
          await executeStatement('ROLLBACK TO SAVEPOINT participants_approval_migration');
          await executeStatement('RELEASE SAVEPOINT participants_approval_migration');
        } catch {}
      }
      console.error('[db] Failed to migrate participants approval schema:', error);
      throw error;
    }
  }

  await ensureColumn('participants', 'approval_status', "TEXT NOT NULL DEFAULT 'pending_approval'");
  await ensureColumn('participants', 'registration_id', "TEXT");
  await ensureColumn('participants', 'step2_token', "TEXT");
  await ensureColumn('participants', 'step2_token_expires_at', "TEXT");
  await ensureColumn('participants', 'approved_at', "TEXT");
  await ensureColumn('participants', 'approved_by', "TEXT");
  await ensureColumn('participants', 'rejected_at', "TEXT");
  await ensureColumn('participants', 'rejected_by', "TEXT");
  await ensureColumn('participants', 'rejection_reason', "TEXT");
  await ensureColumn('participants', 'approval_email_sent', "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn('participants', 'approval_email_error', "TEXT");

  try {
    await executeStatement(`
      UPDATE participants 
      SET registration_id = 'IGN26-' || printf('%04d', id) 
      WHERE registration_id IS NULL OR registration_id = ''
    `);
    await executeStatement(`
      UPDATE participants 
      SET approval_status = 'approved' 
      WHERE (approval_status IS NULL OR approval_status = 'pending_approval') AND (payment_id IS NOT NULL AND payment_id != '')
    `);
  } catch (e) {
    console.error('[db] Error updating default registration_ids:', e);
  }
}

async function initSchema() {
  for (const sql of schemaStatements) {
    await executeStatement(sql);
  }

  await migrateParticipantsUniqueness();
  await migrateParticipantsRollConstraint();
  await migrateParticipantsApprovalSchema();

  await ensureColumn('participants', 'payment_verified', "INTEGER NOT NULL DEFAULT 0");
  await ensureColumn('media', 'thumb_url', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('media', 'status', "TEXT NOT NULL DEFAULT 'approved'");
  await ensureColumn('media', 'uploaded_by', "TEXT NOT NULL DEFAULT 'admin'");
  await ensureColumn('management_team', 'profile_image', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('event_settings', 'support_note', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('event_settings', 'flow_json', "TEXT NOT NULL DEFAULT '[]'");

  await ensureColumn('auth_users', 'role', "TEXT NOT NULL DEFAULT 'admin'");
  await ensureColumn('auth_users', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn('auth_users', 'added_by', "TEXT NOT NULL DEFAULT 'system'");
  await ensureColumn('auth_users', 'last_login_at', "TEXT");
  await ensureColumn('auth_users', 'is_approved', "INTEGER NOT NULL DEFAULT 0");

  // Automatically mark any admin who was previously approved as is_approved = 1
  try {
    await executeStatement(`
      UPDATE auth_users 
      SET is_approved = 1 
      WHERE id IN (SELECT DISTINCT user_id FROM admin_access_requests WHERE status = 'approved')
    `);
  } catch {
    // ignore if admin_access_requests not ready yet
  }

  await ensureColumn('auth_sessions', 'status', "TEXT NOT NULL DEFAULT 'active'");
  await ensureColumn('auth_sessions', 'ip', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('auth_sessions', 'user_agent', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('auth_sessions', 'last_seen_at', "TEXT NOT NULL DEFAULT ''");

  const shareAccess = await executeStatement('SELECT id FROM participant_share_access WHERE id = 1');
  if (!shareAccess.rows[0]) {
    await executeStatement(
      'INSERT INTO participant_share_access (id, token, enabled, updated_at) VALUES (1, ?, 0, ?)',
      [crypto.randomBytes(24).toString('hex'), new Date().toISOString()]
    );
  }

  const registrationControl = await executeStatement('SELECT id FROM registration_control WHERE id = 1');
  if (!registrationControl.rows[0]) {
    await executeStatement(
      'INSERT INTO registration_control (id, enabled, updated_at) VALUES (1, 1, ?)',
      [new Date().toISOString()]
    );
  }

  const publicMediaControl = await executeStatement('SELECT id FROM public_media_control WHERE id = 1');
  if (!publicMediaControl.rows[0]) {
    await executeStatement(
      'INSERT INTO public_media_control (id, enabled, updated_at) VALUES (1, 1, ?)',
      [new Date().toISOString()]
    );
  }

  const defaultHandlerPassword = String(process.env.VALIDATION_HANDLER_PASSWORD || 'ignite-handler-26');
  const defaultHandlerPasswordHash = crypto.createHash('sha256').update(defaultHandlerPassword).digest('hex');
  const validationAccess = await executeStatement('SELECT id FROM validation_handler_access WHERE id = 1');
  if (!validationAccess.rows[0]) {
    await executeStatement(
      'INSERT INTO validation_handler_access (id, token, enabled, password_hash, updated_at) VALUES (1, ?, 0, ?, ?)',
      [crypto.randomBytes(24).toString('hex'), defaultHandlerPasswordHash, new Date().toISOString()]
    );
  } else {
    await executeStatement(
      'UPDATE validation_handler_access SET password_hash = ?, updated_at = ? WHERE id = 1',
      [defaultHandlerPasswordHash, new Date().toISOString()]
    );
  }

  const defaultEventFlow = JSON.stringify([
    { time: '11:00', title: 'Kickoff and Entry Flow', desc: 'Wristbands, welcome desk, and opening drop.' },
    { time: '12:30', title: 'Open Stage Rounds', desc: 'Solo and group performances with live judges.' },
    { time: '15:00', title: 'Spotlight Challenges', desc: 'Interactive games and personality rounds.' },
    { time: '18:30', title: 'Crown Ceremony', desc: 'Final results, awards and celebration set.' },
  ]);
  const eventSettings = await executeStatement('SELECT id FROM event_settings WHERE id = 1');
  if (!eventSettings.rows[0]) {
    await executeStatement(
      `
        INSERT INTO event_settings (
          id, title, date_label, time_label, venue, dress_code_male, dress_code_female,
          countdown_iso, flow_json, support_note, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        'Ignite 2.O',
        '',
        '',
        '',
        'Formals',
        'Western Wear',
        '',
        '[]',
        'Payment verification may take 2-3 days. Please wait for confirmation from the support team.',
        new Date().toISOString(),
      ]
    );
  }

  // Remove only the known shipped sample values. Preserve details an admin has changed.
  await executeStatement(`
    UPDATE event_settings SET
      date_label = CASE WHEN date_label IN ('25 March 2026', '23 March 2026') THEN '' ELSE date_label END,
      time_label = CASE WHEN time_label = '11:00 AM Onwards' THEN '' ELSE time_label END,
      venue = CASE WHEN venue IN ('Top secret', 'Knot Kitchen and Banquet, Gorakhpur') THEN '' ELSE venue END,
      countdown_iso = CASE WHEN countdown_iso IN ('2026-03-25T11:00:00', '2026-03-23T11:00:00') THEN '' ELSE countdown_iso END,
      flow_json = CASE WHEN flow_json = ? THEN '[]' ELSE flow_json END,
      title = CASE WHEN title = 'Ignite''26 Fresher Event' THEN 'Ignite 2.O' ELSE title END
    WHERE id = 1
  `, [defaultEventFlow]);

  // Seed the 3 legacy admins so they remain valid active admins in DB
  const LEGACY_SEED_ADMINS = ['sharvilm112@gmail.com', 'adityabhai01@gmail.com', 'harsh188200@gmail.com'];
  for (const email of LEGACY_SEED_ADMINS) {
    const existing = await executeStatement('SELECT id FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1', [email]);
    if (!existing.rows[0]) {
      const pass = adminCredentials.get(email) || 'Admin@Ignite2026!';
      const hash = hashPassword(pass);
      await executeStatement(
        'INSERT INTO auth_users (email, password_hash, role, status, added_by) VALUES (?, ?, ?, ?, ?)',
        [email, hash, 'admin', 'active', 'system']
      );
    }
  }

  // Seed configured super admin accounts
  const superEmails = getSuperAdminEmails();
  for (const email of superEmails) {
    const existing = await executeStatement('SELECT id FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1', [email]);
    const pass = adminCredentials.get(email) || 'pokimon@7';
    const hash = hashPassword(pass);
    if (!existing.rows[0]) {
      await executeStatement(
        'INSERT INTO auth_users (email, password_hash, role, status, is_approved, added_by) VALUES (?, ?, ?, ?, 1, ?)',
        [email, hash, 'super_admin', 'active', 'system']
      );
    } else {
      await executeStatement(
        "UPDATE auth_users SET role = 'super_admin', status = 'active', is_approved = 1 WHERE id = ?",
        [existing.rows[0].id]
      );
    }
  }

  // Provision passwords from adminCredentials map
  for (const [email, password] of adminCredentials) {
    const adminUser = await executeStatement('SELECT id FROM auth_users WHERE lower(trim(email)) = ? LIMIT 1', [email]);
    const adminHash = hashPassword(password);
    const isSuper = superEmails.has(email);
    if (!adminUser.rows[0]) {
      await executeStatement(
        'INSERT INTO auth_users (email, password_hash, role, status, added_by) VALUES (?, ?, ?, ?, ?)',
        [email, adminHash, isSuper ? 'super_admin' : 'admin', 'active', 'system']
      );
    } else {
      await executeStatement('UPDATE auth_users SET password_hash = ? WHERE id = ?', [adminHash, adminUser.rows[0].id]);
    }
  }

  // Enforce Super Admin policy in database:
  // Exactly the configured SUPER_ADMIN_EMAILS have role = 'super_admin'.
  // Nobody else can ever be a super_admin.
  const allDbUsers = await executeStatement('SELECT id, email, role FROM auth_users');
  for (const u of (allDbUsers?.rows || [])) {
    const isSuper = superEmails.has(String(u.email || '').trim().toLowerCase());
    const expectedRole = isSuper ? 'super_admin' : 'admin';
    if (u.role !== expectedRole) {
      await executeStatement('UPDATE auth_users SET role = ? WHERE id = ?', [expectedRole, u.id]);
    }
  }
}

const ready = initSchema();

const db = {
  async exec(sql) {
    await ready;
    const statements = String(sql)
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    for (const statement of statements) {
      await executeStatement(statement);
    }
  },
  prepare(sql) {
    return {
      async get(...args) {
        await ready;
        const result = await executeStatement(sql, args);
        return result.rows[0];
      },
      async all(...args) {
        await ready;
        const result = await executeStatement(sql, args);
        return result.rows;
      },
      async run(...args) {
        await ready;
        const result = await executeStatement(sql, args);
        return {
          changes: result.rowsAffected,
          lastInsertRowid: result.lastInsertRowid,
        };
      },
    };
  },
};

export function toParticipant(row) {
  if (!row) return null;
  return {
    ...row,
    skills: safeJsonArray(row.skills),
    payment_verified: Boolean(row.payment_verified),
    check_in_status: Boolean(row.check_in_status),
    approval_status: row.approval_status || 'pending_approval',
    registration_id: row.registration_id || (row.id ? `IGN26-${String(row.id).padStart(4, '0')}` : null),
    approval_email_sent: Boolean(row.approval_email_sent),
  };
}

export function safeJsonArray(value) {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function encodeSkills(skills) {
  return JSON.stringify(Array.isArray(skills) ? skills : []);
}

export function toManagementMember(row) {
  if (!row) return null;
  return {
    ...row,
    roles: safeJsonArray(row.roles),
  };
}

export function encodeRoles(roles) {
  return JSON.stringify(Array.isArray(roles) ? roles : []);
}

export default db;
