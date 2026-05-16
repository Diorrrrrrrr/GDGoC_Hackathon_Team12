-- 001_init.sql
-- Run this in the Supabase SQL Editor (Dashboard -> SQL -> New query).
-- Idempotent where reasonable. Safe to re-run after editing.

-- 1) profiles: extra fields for auth.users (role + display name)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('elder', 'caregiver')),
  display_name text,
  created_at timestamptz not null default now()
);

-- 2) pair_tokens: short-lived one-time tokens issued by an elder
create table if not exists public.pair_tokens (
  token uuid primary key default gen_random_uuid(),
  elder_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users(id) on delete set null
);

create index if not exists pair_tokens_elder_idx
  on public.pair_tokens (elder_id, expires_at desc);

-- 3) pairings: elder <-> caregiver many-to-many
create table if not exists public.pairings (
  id uuid primary key default gen_random_uuid(),
  elder_id uuid not null references auth.users(id) on delete cascade,
  caregiver_id uuid not null references auth.users(id) on delete cascade,
  paired_at timestamptz not null default now(),
  unique (elder_id, caregiver_id)
);

create index if not exists pairings_caregiver_idx
  on public.pairings (caregiver_id);

-- 4) events: CV-detected risk events per elder
create table if not exists public.events (
  id bigserial primary key,
  elder_id uuid not null references auth.users(id) on delete cascade,
  ts timestamptz not null default now(),
  alert_type text not null,
  overall_severity text not null,
  risk_score real not null,
  features jsonb not null
);

create index if not exists events_elder_ts_idx
  on public.events (elder_id, ts desc);

-- Backend connects with the postgres role and bypasses RLS, so no policies
-- are strictly required for the current API surface. We still enable RLS so
-- the Supabase JS client (anon/auth keys) cannot read these tables directly
-- without explicit policies.
alter table public.profiles    enable row level security;
alter table public.pair_tokens enable row level security;
alter table public.pairings    enable row level security;
alter table public.events      enable row level security;
