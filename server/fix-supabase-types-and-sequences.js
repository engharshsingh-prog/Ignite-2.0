import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

const supabase = createClient(url, key, { auth: { persistSession: false } });

async function fix() {
  console.log('1. Creating integer to boolean implicit cast and comparison operators...');
  const sqlCastAndOps = `
    -- Cast integer to boolean implicitly
    CREATE OR REPLACE FUNCTION int_to_bool(i integer)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT i <> 0;
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_cast 
        WHERE castsource = 'integer'::regtype AND casttarget = 'boolean'::regtype
      ) THEN
        CREATE CAST (integer AS boolean) WITH FUNCTION int_to_bool(integer) AS IMPLICIT;
      END IF;
    END $$;

    -- Create = operator for boolean and integer
    CREATE OR REPLACE FUNCTION bool_int_eq(b boolean, i integer)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT b = (i <> 0);
    $$;

    CREATE OR REPLACE FUNCTION int_bool_eq(i integer, b boolean)
    RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
      SELECT (i <> 0) = b;
    $$;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_operator 
        WHERE oprname = '=' AND oprleft = 'boolean'::regtype AND oprright = 'integer'::regtype
      ) THEN
        CREATE OPERATOR = (
          LEFTARG = boolean,
          RIGHTARG = integer,
          PROCEDURE = bool_int_eq,
          COMMUTATOR = =
        );
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_operator 
        WHERE oprname = '=' AND oprleft = 'integer'::regtype AND oprright = 'boolean'::regtype
      ) THEN
        CREATE OPERATOR = (
          LEFTARG = integer,
          RIGHTARG = boolean,
          PROCEDURE = int_bool_eq,
          COMMUTATOR = =
        );
      END IF;
    END $$;
  `;

  const { error: err1 } = await supabase.rpc('exec_sql', { sql_query: sqlCastAndOps, params: [] });
  if (err1) {
    console.error('Failed to create cast/operators:', err1.message);
  } else {
    console.log('SUCCESS: Integer <-> Boolean cast and operators created in Supabase!');
  }

  console.log('\n2. Updating all table sequences to prevent duplicate key errors...');
  const serialTables = [
    'email_otp_sessions',
    'participants',
    'auth_users',
    'media',
    'winners',
    'management_team',
    'activity_logs'
  ];

  for (const table of serialTables) {
    const seqSql = `
      SELECT setval(
        pg_get_serial_sequence('${table}', 'id'),
        coalesce((SELECT max(id) FROM ${table}), 0) + 1,
        false
      );
    `;
    const { error: seqErr } = await supabase.rpc('exec_sql', { sql_query: seqSql, params: [] });
    if (seqErr) {
      console.warn(`Warning resetting sequence on ${table}:`, seqErr.message);
    } else {
      console.log(`SUCCESS: Reset sequence on ${table} to max(id) + 1`);
    }
  }

  console.log('\n3. Verifying new email_otp_sessions insert without duplicate key...');
  const testInsertSql = `
    INSERT INTO email_otp_sessions (email, otp_hash, expires_at, created_at)
    VALUES ('test_seq_check@gmail.com', 'test_hash', NOW() + INTERVAL '10 minutes', NOW())
    RETURNING id;
  `;
  const { data: testData, error: testErr } = await supabase.rpc('exec_sql', { sql_query: testInsertSql, params: [] });
  if (testErr) {
    console.error('Test insert failed:', testErr.message);
  } else {
    console.log('SUCCESS: Inserted test OTP session with generated ID:', testData);
    // Clean up test row
    await supabase.rpc('exec_sql', {
      sql_query: "DELETE FROM email_otp_sessions WHERE email = 'test_seq_check@gmail.com'",
      params: []
    });
  }

  console.log('\n4. Verifying boolean = integer query...');
  const testBoolSql = `
    SELECT id FROM email_otp_sessions WHERE verified = 0 AND consumed = 0 LIMIT 1;
  `;
  const { data: boolData, error: boolErr } = await supabase.rpc('exec_sql', { sql_query: testBoolSql, params: [] });
  if (boolErr) {
    console.error('Test boolean query failed:', boolErr.message);
  } else {
    console.log('SUCCESS: Boolean = integer comparison works seamlessly! Result:', boolData);
  }
}

fix().catch(console.error);

