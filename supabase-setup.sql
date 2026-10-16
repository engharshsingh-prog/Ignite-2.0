-- ============================================================
-- IGNITE 2.O - SUPABASE BACKEND SETUP MIGRATION
-- Project URL: https://yrkempqqaxjapkurhxwg.supabase.co
-- Run this script in: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Helper function for SQLite datetime('now') compatibility in PostgreSQL
CREATE OR REPLACE FUNCTION datetime(arg text DEFAULT 'now')
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN arg = 'now' THEN clock_timestamp() ELSE arg::timestamptz END;
$$;

-- 2. Create exec_sql RPC function for backend database execution
-- Returns query results directly as JSONB array of objects (no column definition list required!)
CREATE OR REPLACE FUNCTION exec_sql(sql_query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result_json jsonb;
  param_count int;
  i int;
  final_query text;
  param_text text;
  trimmed_sql text;
  rows_affected bigint;
BEGIN
  param_count := coalesce(jsonb_array_length(params), 0);
  final_query := sql_query;
  
  -- Replace parameters in reverse order ($10 before $1 to prevent sub-string replacement collisions)
  IF param_count > 0 THEN
    FOR i IN REVERSE param_count..1 LOOP
      CASE jsonb_typeof(params->(i-1))
        WHEN 'null' THEN
          param_text := 'NULL';
        WHEN 'string' THEN
          param_text := quote_literal(params->>(i-1));
        WHEN 'number', 'boolean' THEN
          param_text := params->>(i-1);
        ELSE
          param_text := quote_literal(params->>(i-1)) || '::jsonb';
      END CASE;
      final_query := replace(final_query, '$' || i, param_text);
    END LOOP;
  END IF;

  final_query := rtrim(rtrim(final_query), ';');
  trimmed_sql := ltrim(upper(final_query));

  -- 1. Handle SELECT and CTE queries
  IF trimmed_sql LIKE 'SELECT%' OR trimmed_sql LIKE 'WITH%' THEN
    EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM (' || final_query || ') t'
      INTO result_json;
    RETURN coalesce(result_json, '[]'::jsonb);
  END IF;

  -- 2. Handle INSERT / UPDATE / DELETE statements
  IF (trimmed_sql LIKE 'INSERT%' OR trimmed_sql LIKE 'UPDATE%' OR trimmed_sql LIKE 'DELETE%') THEN
    IF final_query NOT ILIKE '% RETURNING %' THEN
      BEGIN
        EXECUTE 'WITH t AS (' || final_query || ' RETURNING *) SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM t'
          INTO result_json;
        RETURN coalesce(result_json, '[]'::jsonb);
      EXCEPTION WHEN OTHERS THEN
        EXECUTE final_query;
        GET DIAGNOSTICS rows_affected = ROW_COUNT;
        RETURN jsonb_build_array(jsonb_build_object('rowsAffected', rows_affected));
      END;
    ELSE
      EXECUTE 'WITH t AS (' || final_query || ') SELECT coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) FROM t'
        INTO result_json;
      RETURN coalesce(result_json, '[]'::jsonb);
    END IF;
  END IF;

  -- 3. Handle other statements (CREATE, ALTER, DROP, etc.)
  EXECUTE final_query;
  RETURN '[]'::jsonb;
END;
$$;

-- Grant execute permissions to API roles
GRANT EXECUTE ON FUNCTION exec_sql(text, jsonb) TO authenticated, service_role, anon;
GRANT EXECUTE ON FUNCTION datetime(text) TO authenticated, service_role, anon;

-- ============================================================
-- 3. CREATE ALL TABLES
-- ============================================================

-- participants table
CREATE TABLE IF NOT EXISTS participants (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  roll_number TEXT NOT NULL,
  branch TEXT NOT NULL,
  year TEXT NOT NULL,
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  payment_id TEXT UNIQUE DEFAULT NULL,
  whatsapp_number TEXT NOT NULL,
  payment_verified BOOLEAN NOT NULL DEFAULT FALSE,
  check_in_status BOOLEAN NOT NULL DEFAULT FALSE,
  check_in_time TIMESTAMPTZ,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approval_status TEXT NOT NULL DEFAULT 'pending_approval',
  registration_id TEXT UNIQUE,
  step2_token TEXT,
  step2_token_expires_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  rejected_at TIMESTAMPTZ,
  rejected_by TEXT,
  rejection_reason TEXT,
  approval_email_sent BOOLEAN NOT NULL DEFAULT FALSE,
  approval_email_error TEXT,
  account_holder_name TEXT,
  payment_screenshot_url TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending_verification',
  payment_rejected_reason TEXT,
  payment_verified_at TIMESTAMPTZ,
  payment_verified_by TEXT,
  CONSTRAINT roll_number_length CHECK (LENGTH(roll_number) <= 15),
  CONSTRAINT whatsapp_number_length CHECK (LENGTH(whatsapp_number) = 10)
);

-- media table
CREATE TABLE IF NOT EXISTS media (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  thumb_url TEXT NOT NULL DEFAULT '',
  caption TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved',
  uploaded_by TEXT NOT NULL DEFAULT 'admin',
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- winners table
CREATE TABLE IF NOT EXISTS winners (
  id BIGSERIAL PRIMARY KEY,
  participant_id BIGINT,
  name TEXT NOT NULL,
  roll_no TEXT,
  branch TEXT,
  award_title TEXT NOT NULL,
  image_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auth_users table
CREATE TABLE IF NOT EXISTS auth_users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  status TEXT NOT NULL DEFAULT 'active',
  added_by TEXT NOT NULL DEFAULT 'system',
  last_login_at TIMESTAMPTZ,
  is_approved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- auth_sessions table
CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- management_team table
CREATE TABLE IF NOT EXISTS management_team (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  branch TEXT NOT NULL,
  year TEXT NOT NULL,
  roles JSONB NOT NULL DEFAULT '[]'::jsonb,
  fields TEXT NOT NULL DEFAULT '',
  profile_image TEXT NOT NULL DEFAULT '',
  whatsapp_number TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id BIGINT,
  action TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- email_otp_sessions table
CREATE TABLE IF NOT EXISTS email_otp_sessions (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  verification_token TEXT,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- participant_share_access (single row table)
CREATE TABLE IF NOT EXISTS participant_share_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- registration_control (single row table)
CREATE TABLE IF NOT EXISTS registration_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- public_media_control (single row table)
CREATE TABLE IF NOT EXISTS public_media_control (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- validation_handler_access (single row table)
CREATE TABLE IF NOT EXISTS validation_handler_access (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  token TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  password_hash TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- event_settings (single row table)
CREATE TABLE IF NOT EXISTS event_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT NOT NULL,
  date_label TEXT NOT NULL,
  time_label TEXT NOT NULL,
  venue TEXT NOT NULL,
  dress_code_male TEXT NOT NULL,
  dress_code_female TEXT NOT NULL,
  countdown_iso TIMESTAMPTZ,
  flow_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  support_note TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- admin_access_requests table
CREATE TABLE IF NOT EXISTS admin_access_requests (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
  ip TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT
);

-- ============================================================
-- 4. CREATE INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_participants_email ON participants(email);
CREATE INDEX IF NOT EXISTS idx_participants_roll_number ON participants(roll_number);
CREATE INDEX IF NOT EXISTS idx_participants_approval_status ON participants(approval_status);
CREATE INDEX IF NOT EXISTS idx_participants_registered_at ON participants(registered_at DESC);
CREATE INDEX IF NOT EXISTS idx_media_status ON media(status);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_at ON media(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_users_email ON auth_users(email);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_otp_sessions_email ON email_otp_sessions(email);
CREATE INDEX IF NOT EXISTS idx_email_otp_sessions_token ON email_otp_sessions(verification_token);

-- ============================================================
-- 5. INSERT DEFAULT CONTROL RECORDS
-- ============================================================

INSERT INTO participant_share_access (id, token, enabled, updated_at)
VALUES (1, encode(gen_random_bytes(24), 'hex'), FALSE, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO registration_control (id, enabled, updated_at)
VALUES (1, TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public_media_control (id, enabled, updated_at)
VALUES (1, TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO validation_handler_access (id, token, enabled, password_hash, updated_at)
VALUES (1, encode(gen_random_bytes(24), 'hex'), FALSE, encode(sha256('ignite-handler-26'::bytea), 'hex'), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO event_settings (
  id, title, date_label, time_label, venue, 
  dress_code_male, dress_code_female, countdown_iso, 
  flow_json, support_note, updated_at
) VALUES (
  1, 'Ignite 2.O', '', '', '', 
  'Formals', 'Western Wear', NULL,
  '[]'::jsonb, 'Payment verification may take 2-3 days. Please wait for confirmation from the support team.', NOW()
)
ON CONFLICT (id) DO NOTHING;

-- Seed default super admin users (passwords can also be updated via ADMIN_CREDENTIALS_JSON)
INSERT INTO auth_users (email, password_hash, role, status, is_approved, added_by)
VALUES 
  ('j74117204@gmail.com', 'a97a3efd8e7c10b7:346fa0b3e6488d01f11a768652d87e14d3a95bfcf2fa63e52f53d2bf2cb039c362d228d4ea547517c5b614068305f6e8ae2f8d85f8cfb50570da8c973a985a1a', 'super_admin', 'active', TRUE, 'system'),
  ('pragatiie0601@gmail.com', 'a97a3efd8e7c10b7:346fa0b3e6488d01f11a768652d87e14d3a95bfcf2fa63e52f53d2bf2cb039c362d228d4ea547517c5b614068305f6e8ae2f8d85f8cfb50570da8c973a985a1a', 'super_admin', 'active', TRUE, 'system'),
  ('harsh188200@gmail.com', 'b86c2dfc7f6b09a6:825ea0b2e5377c00e00a657541c76d03c2a84aecf1e952d41e42c1ae1ba028b251c117d3d9436406b4a503057204e5d7ad1e7c74e7bea40460c97b8629874909', 'admin', 'active', TRUE, 'system')
ON CONFLICT (email) DO NOTHING;

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS on core tables
ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_otp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE registration_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE participant_share_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_media_control ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_handler_access ENABLE ROW LEVEL SECURITY;

-- 1. Service role has full access to all tables (used by backend API)
CREATE POLICY "service_role_all_participants" ON participants FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_media" ON media FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_winners" ON winners FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_team" ON management_team FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_settings" ON event_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_users" ON auth_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_sessions" ON auth_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_requests" ON admin_access_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_activity" ON activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_otp" ON email_otp_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_reg_control" ON registration_control FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_share_access" ON participant_share_access FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_pub_media" ON public_media_control FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all_val_access" ON validation_handler_access FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. Public read policies for open public pages
CREATE POLICY "public_read_approved_media" ON media FOR SELECT TO anon, authenticated USING (status = 'approved');
CREATE POLICY "public_read_winners" ON winners FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_team" ON management_team FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_settings" ON event_settings FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_reg_control" ON registration_control FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "public_read_media_control" ON public_media_control FOR SELECT TO anon, authenticated USING (true);

-- ============================================================
-- 7. BOOLEAN COMPARISON OPERATORS FOR SQLITE COMPATIBILITY
-- ============================================================
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

-- Synchronize sequences with highest existing ID
SELECT setval(pg_get_serial_sequence('email_otp_sessions', 'id'), coalesce((SELECT max(id) FROM email_otp_sessions), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('participants', 'id'), coalesce((SELECT max(id) FROM participants), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('auth_users', 'id'), coalesce((SELECT max(id) FROM auth_users), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('media', 'id'), coalesce((SELECT max(id) FROM media), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('winners', 'id'), coalesce((SELECT max(id) FROM winners), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('management_team', 'id'), coalesce((SELECT max(id) FROM management_team), 0) + 1, false);
SELECT setval(pg_get_serial_sequence('activity_logs', 'id'), coalesce((SELECT max(id) FROM activity_logs), 0) + 1, false);

-- ============================================================
-- 8. VERIFICATION QUERY
-- ============================================================
SELECT 'Ignite 2.O Supabase schema setup completed successfully!' as status;