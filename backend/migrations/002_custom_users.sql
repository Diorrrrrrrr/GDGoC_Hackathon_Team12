-- 002_custom_users.sql
-- Switch from Supabase Auth (auth.users) to our own public.users table.
-- Safe to run after 001_init.sql. Wipes existing rows in dependent tables
-- (acceptable here because no production data exists yet).

-- 1) Our own users table (username + bcrypt password hash + role)
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,20}$'),
  password_hash text not null,
  role text not null check (role in ('elder', 'caregiver')),
  display_name text,
  created_at timestamptz not null default now()
);

-- 2) Drop the old profiles table (role/display_name now live on users)
drop table if exists public.profiles cascade;

-- 3) Clear dependent tables before swapping FK targets
truncate public.events;
truncate public.pairings;
truncate public.pair_tokens;

-- 4) Swap foreign keys from auth.users -> public.users
alter table public.pair_tokens
  drop constraint if exists pair_tokens_elder_id_fkey,
  drop constraint if exists pair_tokens_used_by_fkey;
alter table public.pair_tokens
  add constraint pair_tokens_elder_id_fkey
    foreign key (elder_id) references public.users(id) on delete cascade,
  add constraint pair_tokens_used_by_fkey
    foreign key (used_by) references public.users(id) on delete set null;

alter table public.pairings
  drop constraint if exists pairings_elder_id_fkey,
  drop constraint if exists pairings_caregiver_id_fkey;
alter table public.pairings
  add constraint pairings_elder_id_fkey
    foreign key (elder_id) references public.users(id) on delete cascade,
  add constraint pairings_caregiver_id_fkey
    foreign key (caregiver_id) references public.users(id) on delete cascade;

alter table public.events
  drop constraint if exists events_elder_id_fkey;
alter table public.events
  add constraint events_elder_id_fkey
    foreign key (elder_id) references public.users(id) on delete cascade;

-- 5) RLS posture stays the same: enabled, no policies (backend bypasses RLS).
alter table public.users enable row level security;
