-- ============================================================
-- RUN THIS IN SUPABASE SQL EDITOR (Dashboard → SQL Editor)
-- ============================================================

-- 1. Create a function to execute arbitrary SQL (for migration compatibility)
CREATE OR REPLACE FUNCTION exec_sql(sql_query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS SETOF record
LANGUAGE plpgsql
AS $$
DECLARE
  result record;
BEGIN
  -- Execute the dynamic SQL with parameters
  FOR result IN EXECUTE sql_query USING params
  LOOP
    RETURN NEXT result;
  END LOOP;
  RETURN;
END;
$$;

-- 2. Create a function for single row result
CREATE OR REPLACE FUNCTION exec_sql_single(sql_query text, params jsonb DEFAULT '[]'::jsonb)
RETURNS record
LANGUAGE plpgsql
AS $$
DECLARE
  result record;
BEGIN
  EXECUTE sql_query INTO result USING params;
  RETURN result;
END;
$$;

-- 3. Grant execute permissions
GRANT EXECUTE ON FUNCTION exec_sql(text, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION exec_sql_single(text, jsonb) TO authenticated, service_role;

-- ============================================================
-- 4. CREATE ALL TABLES (PostgreSQL schema)
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
-- 5. CREATE INDEXES
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
-- 6. INSERT DEFAULT DATA
-- ============================================================

-- Default participant_share_access
INSERT INTO participant_share_access (id, token, enabled, updated_at)
VALUES (1, encode(gen_random_bytes(24), 'hex'), FALSE, NOW())
ON CONFLICT (id) DO NOTHING;

-- Default registration_control
INSERT INTO registration_control (id, enabled, updated_at)
VALUES (1, TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

-- Default public_media_control
INSERT INTO public_media_control (id, enabled, updated_at)
VALUES (1, TRUE, NOW())
ON CONFLICT (id) DO NOTHING;

-- Default validation_handler_access
INSERT INTO validation_handler_access (id, token, enabled, password_hash, updated_at)
VALUES (1, encode(gen_random_bytes(24), 'hex'), FALSE, encode(sha256('ignite-handler-26'::bytea), 'hex'), NOW())
ON CONFLICT (id) DO NOTHING;

-- Default event_settings
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

-- ============================================================
-- 7. ENABLE ROW LEVEL SECURITY (RLS) - Optional but recommended
-- ============================================================
-- ALTER TABLE participants ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE media ENABLE ROW LEVEL SECURITY;
-- ... etc.
-- 
-- For now, we'll use service_role key which bypasses RLS.
-- Add RLS policies later if needed.

-- ============================================================
-- 8. VERIFY SETUP
-- ============================================================
SELECT 'Setup complete!' as status;
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;