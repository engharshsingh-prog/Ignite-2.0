import 'dotenv/config';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

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

// Supabase client (service role for server-side operations)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[db] FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in environment');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
});

// Helper to convert SQLite-style ? params to PostgreSQL $1, $2, ...
function convertParams(sql, args) {
  let paramIndex = 0;
  const newSql = sql.replace(/\?/g, () => {
    paramIndex++;
    return `$${paramIndex}`;
  });
  return { sql: newSql, args };
}

// Normalize row from Supabase (snake_case keys)
function normalizeRow(row) {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row));
}

function normalizeRows(rows) {
  return Array.isArray(rows) ? rows.map(normalizeRow) : [];
}

// Execute raw SQL via RPC function (created in supabase-setup.sql)
async function executeRaw(sql, args = []) {
  const { sql: pgSql, args: pgArgs } = convertParams(sql, args);
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: pgSql,
    params: pgArgs
  });
  
  if (error) {
    // Log the actual SQL for debugging
    console.error('[db] SQL Error:', error.message);
    console.error('[db] Query:', pgSql);
    console.error('[db] Args:', pgArgs);
    throw error;
  }
  
  return {
    rows: normalizeRows(data || []),
    rowsAffected: (data || []).length,
    lastInsertRowid: data && data.length > 0 && data[0].id ? Number(data[0].id) : undefined,
  };
}

async function executeRawSingle(sql, args = []) {
  const { sql: pgSql, args: pgArgs } = convertParams(sql, args);
  
  const { data, error } = await supabase.rpc('exec_sql_single', {
    sql_query: pgSql,
    params: pgArgs
  });
  
  if (error) {
    console.error('[db] SQL Error:', error.message);
    console.error('[db] Query:', pgSql);
    console.error('[db] Args:', pgArgs);
    throw error;
  }
  
  return normalizeRow(data);
}

// Main db object with prepare() API compatible with SQLite version
const db = {
  async exec(sql) {
    const statements = String(sql)
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);
    
    for (const statement of statements) {
      await this.prepare(statement).run();
    }
  },

  prepare(sql) {
    const upperSql = sql.trim().toUpperCase();
    const isSelect = upperSql.startsWith('SELECT');
    const isInsert = upperSql.startsWith('INSERT');
    const isUpdate = upperSql.startsWith('UPDATE');
    const isDelete = upperSql.startsWith('DELETE');
    const isCreate = upperSql.startsWith('CREATE');
    const isAlter = upperSql.startsWith('ALTER');
    const isDrop = upperSql.startsWith('DROP');
    const isPragma = upperSql.startsWith('PRAGMA');
    const isSavepoint = upperSql.startsWith('SAVEPOINT') || upperSql.startsWith('RELEASE') || upperSql.startsWith('ROLLBACK');
    const isTransaction = upperSql.startsWith('BEGIN') || upperSql.startsWith('COMMIT');

    // Handle PRAGMA (SQLite-specific) - no-op for PostgreSQL
    if (isPragma) {
      return {
        async get(...args) { return undefined; },
        async all(...args) { return []; },
        async run(...args) { return { changes: 0, lastInsertRowid: undefined }; },
      };
    }

    // Handle transaction statements
    if (isTransaction || isSavepoint) {
      return {
        async get(...args) { return undefined; },
        async all(...args) { return []; },
        async run(...args) { return { changes: 0, lastInsertRowid: undefined }; },
      };
    }

    // For DDL statements (CREATE, ALTER, DROP) - these should be run via Supabase SQL Editor
    // In dev, we'll execute them via RPC; in production they should already exist
    if (isCreate || isAlter || isDrop) {
      return {
        async get(...args) { return undefined; },
        async all(...args) { return []; },
        async run(...args) { 
          try {
            const result = await executeRaw(sql, args);
            return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
          } catch (err) {
            // DDL might fail if already exists, log but don't throw
            console.warn('[db] DDL execution warning:', err.message);
            return { changes: 0, lastInsertRowid: undefined };
          }
        },
      };
    }

    // For DML statements (SELECT, INSERT, UPDATE, DELETE)
    return {
      async get(...args) {
        try {
          return await executeRawSingle(sql, args);
        } catch (err) {
          // If exec_sql_single doesn't exist, fall back to exec_sql
          if (err.message?.includes('function') && err.message?.includes('exec_sql_single')) {
            const result = await executeRaw(sql, args);
            return result.rows[0];
          }
          throw err;
        }
      },

      async all(...args) {
        const result = await executeRaw(sql, args);
        return result.rows;
      },

      async run(...args) {
        const result = await executeRaw(sql, args);
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