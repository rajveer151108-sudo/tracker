-- Tracker's complete backend. This migration also upgrades the original two-table schema.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  spotify_id text unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles alter column spotify_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and conname = 'profiles_user_id_key'
  ) then
    alter table public.profiles add constraint profiles_user_id_key unique (user_id);
  end if;
end $$;

create table if not exists public.plays (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  played_at timestamptz not null,
  source text not null default 'spotify',
  track_id text,
  track_name text not null,
  artist_names text[] not null default '{}',
  album_name text,
  album_image text,
  duration_ms integer,
  counted boolean not null default true,
  created_at timestamptz not null default now(),
  constraint plays_source_check check (source in ('spotify', 'desktop', 'import', 'upload')),
  constraint plays_duration_check check (duration_ms is null or duration_ms >= 0),
  unique (profile_id, played_at, track_name)
);

alter table public.plays add column if not exists counted boolean not null default true;
alter table public.plays add column if not exists created_at timestamptz not null default now();

create index if not exists plays_profile_time on public.plays (profile_id, played_at desc);
create index if not exists plays_profile_counted_time on public.plays (profile_id, counted, played_at desc);
create index if not exists plays_track_id on public.plays (profile_id, track_id) where track_id is not null;

create table if not exists public.spotify_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text not null,
  updated_at timestamptz not null default now(),
  last_synced_at timestamptz,
  last_error text
);

alter table public.spotify_tokens add column if not exists last_synced_at timestamptz;
alter table public.spotify_tokens add column if not exists last_error text;
-- Preserve the timestamp used by the pre-migration backend, when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'spotify_tokens' and column_name = 'last_sync_at'
  ) then
    execute 'update public.spotify_tokens set last_synced_at = coalesce(last_synced_at, last_sync_at)';
  end if;
end $$;

create table if not exists public.own_files (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) > 0),
  artist text not null check (length(trim(artist)) > 0),
  album text,
  file_path text not null unique,
  cover_path text,
  created_at timestamptz not null default now()
);

create index if not exists own_files_profile_created on public.own_files (profile_id, created_at desc);

create table if not exists public.playlists (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  cover_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.playlists add column if not exists updated_at timestamptz not null default now();

create index if not exists playlists_profile_created on public.playlists (profile_id, created_at desc);

create table if not exists public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  file_id uuid not null references public.own_files(id) on delete cascade,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  unique (playlist_id, file_id)
);

alter table public.playlist_items add column if not exists created_at timestamptz not null default now();
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'playlist_items' and column_name = 'added_at'
  ) then
    execute 'update public.playlist_items set created_at = added_at where added_at is not null';
  end if;
end $$;

create index if not exists playlist_items_order on public.playlist_items (playlist_id, position, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists playlists_set_updated_at on public.playlists;
create trigger playlists_set_updated_at before update on public.playlists
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  spotify_value text := coalesce(new.raw_user_meta_data ->> 'provider_id', new.raw_user_meta_data ->> 'sub');
begin
  -- Reuse a profile created by the legacy collector before Supabase Auth was enabled.
  if spotify_value is not null then
    update public.profiles
    set user_id = new.id,
        display_name = coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', new.email, display_name)
    where spotify_id = spotify_value
      and user_id is null
      and not exists (select 1 from public.profiles existing where existing.user_id = new.id);
  end if;

  insert into public.profiles (user_id, spotify_id, display_name)
  values (
    new.id,
    spotify_value,
    coalesce(new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (user_id) do update set
    display_name = coalesce(excluded.display_name, profiles.display_name),
    spotify_id = coalesce(excluded.spotify_id, profiles.spotify_id);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert or update of raw_user_meta_data on auth.users
for each row execute function public.handle_new_user();

-- Backfill profiles for users who connected before this migration was installed.
update public.profiles p
set user_id = u.id,
    display_name = coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', u.email, p.display_name)
from auth.users u
where p.user_id is null
  and p.spotify_id = coalesce(u.raw_user_meta_data ->> 'provider_id', u.raw_user_meta_data ->> 'sub')
  and not exists (select 1 from public.profiles existing where existing.user_id = u.id);

insert into public.profiles (user_id, spotify_id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'provider_id', u.raw_user_meta_data ->> 'sub'),
  coalesce(u.raw_user_meta_data ->> 'name', u.raw_user_meta_data ->> 'full_name', u.email)
from auth.users u
where not exists (select 1 from public.profiles p where p.user_id = u.id)
on conflict do nothing;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where user_id = auth.uid() limit 1
$$;

revoke all on function public.current_profile_id() from public;
grant execute on function public.current_profile_id() to authenticated;

alter table public.profiles enable row level security;
alter table public.plays enable row level security;
alter table public.spotify_tokens enable row level security;
alter table public.own_files enable row level security;
alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;

revoke all on public.spotify_tokens from anon, authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert on public.plays to authenticated;
grant select, insert, update, delete on public.own_files to authenticated;
grant select, insert, update, delete on public.playlists to authenticated;
grant select, insert, update, delete on public.playlist_items to authenticated;
grant usage, select on sequence public.plays_id_seq to authenticated;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated
using (user_id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "plays_select_own" on public.plays;
create policy "plays_select_own" on public.plays for select to authenticated
using (profile_id = public.current_profile_id());

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own" on public.plays for insert to authenticated
with check (profile_id = public.current_profile_id() and source in ('import', 'upload', 'desktop'));

-- Refresh tokens are written and read only by the service-role Edge Function/collector.
-- RLS remains enabled with no client policies, so browser code cannot retrieve them.

drop policy if exists "own_files_all_own" on public.own_files;
create policy "own_files_all_own" on public.own_files for all to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

drop policy if exists "playlists_all_own" on public.playlists;
create policy "playlists_all_own" on public.playlists for all to authenticated
using (profile_id = public.current_profile_id())
with check (profile_id = public.current_profile_id());

drop policy if exists "playlist_items_select_own" on public.playlist_items;
create policy "playlist_items_select_own" on public.playlist_items for select to authenticated
using (exists (
  select 1 from public.playlists p
  where p.id = playlist_id and p.profile_id = public.current_profile_id()
));

drop policy if exists "playlist_items_insert_own" on public.playlist_items;
create policy "playlist_items_insert_own" on public.playlist_items for insert to authenticated
with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.profile_id = public.current_profile_id())
  and exists (select 1 from public.own_files f where f.id = file_id and f.profile_id = public.current_profile_id())
);

drop policy if exists "playlist_items_update_own" on public.playlist_items;
create policy "playlist_items_update_own" on public.playlist_items for update to authenticated
using (exists (
  select 1 from public.playlists p
  where p.id = playlist_id and p.profile_id = public.current_profile_id()
)) with check (
  exists (select 1 from public.playlists p where p.id = playlist_id and p.profile_id = public.current_profile_id())
  and exists (select 1 from public.own_files f where f.id = file_id and f.profile_id = public.current_profile_id())
);

drop policy if exists "playlist_items_delete_own" on public.playlist_items;
create policy "playlist_items_delete_own" on public.playlist_items for delete to authenticated
using (exists (
  select 1 from public.playlists p
  where p.id = playlist_id and p.profile_id = public.current_profile_id()
));

create or replace function public.top_artists(since timestamptz, lim integer default 10)
returns table(name text, artist text, image text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select a.name, null::text as artist, max(p.album_image) as image, count(*) as n
  from public.plays p
  cross join lateral unnest(p.artist_names) as a(name)
  where p.profile_id = public.current_profile_id()
    and p.counted and p.played_at >= since
  group by a.name
  order by n desc, a.name
  limit greatest(1, least(lim, 100))
$$;

create or replace function public.top_albums(since timestamptz, lim integer default 10)
returns table(name text, artist text, image text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.album_name as name, p.artist_names[1] as artist,
    max(p.album_image) as image, count(*) as n
  from public.plays p
  where p.profile_id = public.current_profile_id()
    and p.counted and p.played_at >= since and p.album_name is not null
  group by p.album_name, p.artist_names[1]
  order by n desc, p.album_name
  limit greatest(1, least(lim, 100))
$$;

create or replace function public.top_songs(since timestamptz, lim integer default 10)
returns table(name text, artist text, image text, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select p.track_name as name, p.artist_names[1] as artist,
    max(p.album_image) as image, count(*) as n
  from public.plays p
  where p.profile_id = public.current_profile_id()
    and p.counted and p.played_at >= since
  group by p.track_name, p.track_id, p.artist_names[1]
  order by n desc, p.track_name
  limit greatest(1, least(lim, 100))
$$;

create or replace function public.artist_suggest(q text)
returns table(name text)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct a.name
  from public.plays p
  cross join lateral unnest(p.artist_names) as a(name)
  where p.profile_id = public.current_profile_id()
    and a.name ilike '%' || replace(replace(q, '%', E'\\%'), '_', E'\\_') || '%' escape E'\\'
  order by a.name
  limit 10
$$;

revoke all on function public.top_artists(timestamptz, integer) from public;
revoke all on function public.top_albums(timestamptz, integer) from public;
revoke all on function public.top_songs(timestamptz, integer) from public;
revoke all on function public.artist_suggest(text) from public;
grant execute on function public.top_artists(timestamptz, integer) to authenticated;
grant execute on function public.top_albums(timestamptz, integer) to authenticated;
grant execute on function public.top_songs(timestamptz, integer) to authenticated;
grant execute on function public.artist_suggest(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('own-files', 'own-files', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "own_files_storage_select" on storage.objects;
create policy "own_files_storage_select" on storage.objects for select to authenticated
using (bucket_id = 'own-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_files_storage_insert" on storage.objects;
create policy "own_files_storage_insert" on storage.objects for insert to authenticated
with check (bucket_id = 'own-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_files_storage_update" on storage.objects;
create policy "own_files_storage_update" on storage.objects for update to authenticated
using (bucket_id = 'own-files' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'own-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "own_files_storage_delete" on storage.objects;
create policy "own_files_storage_delete" on storage.objects for delete to authenticated
using (bucket_id = 'own-files' and (storage.foldername(name))[1] = auth.uid()::text);
