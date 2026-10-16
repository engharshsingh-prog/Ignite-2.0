import { createClient } from '@supabase/supabase-js';

// Browser-safe Supabase client (only uses public URL and publishable/anon key)
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://yrkempqqaxjapkurhxwg.supabase.co';

const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  '';

export const isSupabaseClientConfigured = Boolean(
  supabasePublishableKey && !supabasePublishableKey.includes('your-')
);

export const supabase = isSupabaseClientConfigured
  ? createClient(supabaseUrl, supabasePublishableKey)
  : null;

