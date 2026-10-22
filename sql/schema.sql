-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.
-- Used from the next build step (play-history collector); safe to run now.

create table if not exists profiles (
  id uuid primary key default gen_random_uuid(),
  spotify_id text unique not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table if not exists plays (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  played_at timestamptz not null,
  source text not null default 'spotify',   -- 'spotify' | 'import' | 'upload'
  track_id text,
  track_name text not null,
  artist_names text[] not null,
  album_name text,
  album_image text,
  duration_ms integer,
  unique (profile_id, played_at, track_name)
);

create index if not exists plays_profile_time on plays (profile_id, played_at desc);

alter table profiles enable row level security;
alter table plays enable row level security;
-- No public policies yet: the collector uses the service key, and
-- per-user read policies are added together with Supabase login.
