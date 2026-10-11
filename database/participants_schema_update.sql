-- Participants schema migration for updated registration fields
-- Run in Supabase SQL editor.

alter table if exists public.participants
  rename column name to full_name;

alter table if exists public.participants
  rename column roll_no to roll_number;

alter table if exists public.participants
  rename column phone to whatsapp_number;

alter table if exists public.participants
  drop column if exists food_pref;

alter table if exists public.participants
  add column if not exists year text,
  add column if not exists skills text[] default '{}',
  add column if not exists payment_id text;

-- Ensure key columns are present (for fresh tables)
alter table if exists public.participants
  add column if not exists email text,
  add column if not exists full_name text,
  add column if not exists roll_number text,
  add column if not exists branch text,
  add column if not exists whatsapp_number text,
  add column if not exists check_in_status boolean default false,
  add column if not exists check_in_time timestamptz,
  add column if not exists registered_at timestamptz default now();

-- Backfill minimal defaults for existing rows if needed
update public.participants set year = coalesce(year, '1st Year') where year is null;
update public.participants set skills = coalesce(skills, '{}'::text[]) where skills is null;
update public.participants set payment_id = coalesce(payment_id, '') where payment_id is null;

-- Constraints and uniqueness
create unique index if not exists participants_email_unique on public.participants (email);
create unique index if not exists participants_roll_number_unique on public.participants (roll_number);
create unique index if not exists participants_payment_id_unique on public.participants (payment_id);
create unique index if not exists participants_whatsapp_number_unique on public.participants (whatsapp_number);

alter table public.participants
  alter column email set not null,
  alter column full_name set not null,
  alter column roll_number set not null,
  alter column branch set not null,
  alter column year set not null,
  alter column skills set not null,
  alter column payment_id set not null,
  alter column whatsapp_number set not null;

alter table public.participants
  drop constraint if exists participants_roll_number_format_check;

alter table public.participants
  add constraint participants_roll_number_format_check check (roll_number ~ '^[0-9]{13}$');

alter table public.participants
  drop constraint if exists participants_whatsapp_number_format_check;

alter table public.participants
  add constraint participants_whatsapp_number_format_check check (whatsapp_number ~ '^[0-9]{10}$');
