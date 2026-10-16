import 'dotenv/config';
import crypto from 'crypto';
import path from 'path';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createClient as createLibsqlClient } from '@libsql/client';

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

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha256');
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}

// -------------------------------------------------------------
// Database Clients Setup (Supabase with Local SQLite fallback)
// -------------------------------------------------------------
const supabaseUrl = process.env.SUPABASE_URL || 'https://yrkempqqaxjapkurhxwg.supabase.co';
const supabaseSecretKey = (
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  ''
).trim();
const supabasePublishableKey = (
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  ''
).trim();

function resolveLocalDatabaseUrl() {
  const rawPath = String(process.env.SQLITE_DB_PATH || './data/ignite26.db').trim();
  const normalized = rawPath.replace(/\\/g, '/');
  if (normalized.startsWith('file:')) return normalized;
  const resolved = path.resolve(process.cwd(), normalized);
  return `file:${resolved.replace(/\\/g, '/')}`;
}

export const localClient = createLibsqlClient({ url: resolveLocalDatabaseUrl() });

function isPlaceholderOrOldKey(key) {
  if (!key) return true;
  if (key.includes('your-') || key.includes('placeholder')) return true;
  if (key.includes('Q2LKrKLhYxHj3grBZyRkAw_ZTGyboaw')) return true;
  if (key.includes('1Y8d9iSTtWpnNyfn2cAW9Q_THmrRExY')) return true;
  return false;
}

const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  !isPlaceholderOrOldKey(supabaseSecretKey) &&
  !supabaseUrl.includes('ihwxebxdwcrswxjfgrqv')
);

export const supabase = isSupabaseConfigured
  ? createSupabaseClient(supabaseUrl, supabaseSecretKey, { auth: { persistSession: false } })
  : null;

let activeBackend = isSupabaseConfigured ? 'supabase' : 'sqlite';
let healthCheckPromise = null;

export async function checkSupabaseHealth() {
  if (!supabase) {
    activeBackend = 'sqlite';
    return activeBackend;
  }
  if (!healthCheckPromise) {
    healthCheckPromise = (async () => {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: 'SELECT 1', params: [] });
        if (!error) {
          console.log(`[db] Connected successfully to Supabase: ${supabaseUrl}`);
          activeBackend = 'supabase';
        } else {
          console.warn(`[db] Supabase RPC check returned error (${error.message}). Operating using local SQLite database.`);
          activeBackend = 'sqlite';
        }
      } catch (err) {
        console.warn(`[db] Supabase unavailable (${err.message}). Operating using local SQLite database.`);
        activeBackend = 'sqlite';
      }
      return activeBackend;
    })();
  }
  return healthCheckPromise;
}

checkSupabaseHealth().catch(() => {});

const BOOLEAN_COLUMNS = [
  'verified',
  'consumed',
  'is_approved',
  'payment_verified',
  'check_in_status',
  'enabled',
  'approval_email_sent',
];

function convertToPgSql(sql, args = []) {
  const pgArgs = [...args];
  let converted = String(sql).trim().replace(/;+\s*$/, '');

  // 1. Convert boolean literal comparisons / assignments in text: e.g. "check_in_status = 1" -> "check_in_status = TRUE"
  for (const col of BOOLEAN_COLUMNS) {
    const eq1 = new RegExp(`\\b${col}\\s*=\\s*1\\b`, 'gi');
    const eq0 = new RegExp(`\\b${col}\\s*=\\s*0\\b`, 'gi');
    const ne1 = new RegExp(`\\b${col}\\s*(!=|<>)\\s*1\\b`, 'gi');
    const ne0 = new RegExp(`\\b${col}\\s*(!=|<>)\\s*0\\b`, 'gi');
    converted = converted
      .replace(eq1, `${col} = TRUE`)
      .replace(eq0, `${col} = FALSE`)
      .replace(ne1, `${col} != TRUE`)
      .replace(ne0, `${col} != FALSE`);
  }

  // 2. Convert datetime('now') to NOW()
  converted = converted.replace(/datetime\('now'\)/gi, 'NOW()');

  // 3. Check for INSERT INTO table (cols...) VALUES (?...)
  const insertMatch = converted.match(/INSERT\s+INTO\s+[^\(]+\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  const insertBoolIndices = new Set();
  if (insertMatch) {
    const cols = insertMatch[1].split(',').map((c) => c.trim().toLowerCase());
    cols.forEach((col, idx) => {
      if (BOOLEAN_COLUMNS.includes(col)) {
        insertBoolIndices.add(idx);
      }
    });
  }

  // 4. Replace ? with $1, $2... and convert corresponding arg if it targets a boolean column
  let paramIndex = 0;
  let resultSql = '';
  let lastIdx = 0;
  const qRegex = /\?/g;
  let match;
  const boolColAssignRegex = new RegExp(`\\b(${BOOLEAN_COLUMNS.join('|')})\\s*(=|!=|<>)\\s*$`, 'i');

  while ((match = qRegex.exec(converted)) !== null) {
    const qPos = match.index;
    resultSql += converted.substring(lastIdx, qPos);

    const beforeQuestion = converted.substring(Math.max(0, qPos - 50), qPos).trim();
    const isBoolAssignment = boolColAssignRegex.test(beforeQuestion);
    const isBoolInsert = insertBoolIndices.has(paramIndex);

    if ((isBoolAssignment || isBoolInsert) && paramIndex < pgArgs.length) {
      const val = pgArgs[paramIndex];
      if (val === 1 || val === '1' || val === true) {
        pgArgs[paramIndex] = true;
      } else if (val === 0 || val === '0' || val === false) {
        pgArgs[paramIndex] = false;
      }
    }

    paramIndex++;
    resultSql += `$${paramIndex}`;
    lastIdx = qPos + 1;
  }
  resultSql += converted.substring(lastIdx);

  return { sql: resultSql.trim().replace(/;+\s*$/, ''), args: pgArgs };
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return undefined;
  const entries = Object.entries(row);
  if (entries.length === 0) return undefined;
  const hasValidValue = entries.some(([_, v]) => v !== null && v !== undefined);
  if (!hasValidValue) return undefined;
  return Object.fromEntries(entries);
}

function normalizeRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRow).filter(Boolean);
}

async function executeStatement(sql, args = []) {
  const backend = await checkSupabaseHealth();

  if (backend === 'supabase' && supabase) {
    try {
      const { sql: pgSql, args: pgArgs } = convertToPgSql(sql, args);
      const { data, error } = await supabase.rpc('exec_sql', {
        sql_query: pgSql,
        params: pgArgs,
      });
      if (error) throw error;
      const rows = normalizeRows(data || []);
      const firstRow = rows[0];
      const lastInsertRowid = firstRow && firstRow.id ? Number(firstRow.id) : undefined;
      return {
        rows,
        rowsAffected: rows.length,
        lastInsertRowid,
      };
    } catch (err) {
      console.warn(`[db] Supabase query failed (${err.message}). Falling back to local SQLite.`);
    }
  }

  const result = await localClient.execute({ sql, args });
  return {
    rows: normalizeRows(result.rows),
    rowsAffected: Number(result.rowsAffected || 0),
    lastInsertRowid: result.lastInsertRowid !== undefined ? Number(result.lastInsertRowid) : undefined,
  };
}

const db = {
  async exec(sql) {
    const statements = String(sql)
      .split(/;\s*(?:\r?\n|$)/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      await executeStatement(stmt);
    }
  },

  prepare(sql) {
    const upperSql = sql.trim().toUpperCase();
    const isPragma = upperSql.startsWith('PRAGMA');
    const isTransaction = upperSql.startsWith('BEGIN') || upperSql.startsWith('COMMIT') || upperSql.startsWith('ROLLBACK');

    if (isPragma || isTransaction) {
      return {
        async get() { return undefined; },
        async all() { return []; },
        async run() { return { changes: 0, lastInsertRowid: undefined }; },
      };
    }

    return {
      async get(...args) {
        const result = await executeStatement(sql, args);
        return normalizeRow(result.rows[0]);
      },

      async all(...args) {
        const result = await executeStatement(sql, args);
        return normalizeRows(result.rows);
      },

      async run(...args) {
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
    account_holder_name: row.account_holder_name || null,
    payment_screenshot_url: row.payment_screenshot_url || null,
    payment_status: row.payment_status || (row.payment_verified ? 'approved' : 'pending_verification'),
    payment_rejected_reason: row.payment_rejected_reason || null,
    payment_verified_at: row.payment_verified_at || null,
    payment_verified_by: row.payment_verified_by || null,
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