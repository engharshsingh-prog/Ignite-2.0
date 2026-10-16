import 'dotenv/config';
import { createClient as createLibsqlClient } from '@libsql/client';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://yrkempqqaxjapkurhxwg.supabase.co';
const supabaseKey = (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!supabaseKey || supabaseKey.includes('your-') || supabaseKey.includes('Q2LKrKLhYxHj3grBZyRkAw_ZTGyboaw')) {
  console.error('[migration] Error: Valid SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY is required in .env to run migration.');
  console.error('[migration] Obtain the secret service-role key from your Supabase Dashboard: Project Settings -> API.');
  process.exit(1);
}

const supabase = createSupabaseClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const sqlite = createLibsqlClient({ url: 'file:data/ignite26.db' });

const TABLES = [
  'auth_users',
  'participants',
  'media',
  'winners',
  'management_team',
  'event_settings',
  'registration_control',
  'participant_share_access',
  'public_media_control',
  'validation_handler_access',
  'email_otp_sessions',
  'auth_sessions',
  'activity_logs',
  'admin_access_requests'
];

async function migrateTable(tableName) {
  try {
    const sqliteResult = await sqlite.execute(`SELECT * FROM ${tableName}`);
    const rows = sqliteResult.rows;
    if (!rows || rows.length === 0) {
      console.log(`[migration] ${tableName}: 0 rows to migrate.`);
      return;
    }

    console.log(`[migration] Migrating ${rows.length} rows for ${tableName}...`);

    // Parse JSON fields if necessary
    const cleanedRows = rows.map(r => {
      const obj = { ...r };
      if (typeof obj.skills === 'string') {
        try { obj.skills = JSON.parse(obj.skills); } catch (_) { obj.skills = []; }
      }
      if (typeof obj.roles === 'string') {
        try { obj.roles = JSON.parse(obj.roles); } catch (_) { obj.roles = []; }
      }
      if (typeof obj.flow_json === 'string') {
        try { obj.flow_json = JSON.parse(obj.flow_json); } catch (_) { obj.flow_json = []; }
      }
      if (typeof obj.details === 'string') {
        try { obj.details = JSON.parse(obj.details); } catch (_) {}
      }
      if (obj.countdown_iso === '') {
        obj.countdown_iso = null;
      }
      return obj;
    });

    const conflictCol = tableName === 'auth_users' ? 'email' : 'id';
    const { error } = await supabase.from(tableName).upsert(cleanedRows, { onConflict: conflictCol });
    if (error) {
      console.error(`[migration] Error migrating ${tableName}:`, error.message);
    } else {
      console.log(`[migration] SUCCESS: ${cleanedRows.length} rows migrated to ${tableName}.`);
    }
  } catch (err) {
    console.error(`[migration] Exception on ${tableName}:`, err.message);
  }
}

async function run() {
  console.log(`[migration] Starting migration from data/ignite26.db to ${supabaseUrl}...`);
  for (const table of TABLES) {
    await migrateTable(table);
  }
  console.log('[migration] Migration finished.');
}

run().catch(console.error);

