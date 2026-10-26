-- Realtime desktop ingestion with cross-source duplicate protection.

create or replace function public.suppress_near_duplicate_play()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.track_id is not null and exists (
    select 1
    from public.plays existing
    where existing.profile_id = new.profile_id
      and existing.track_id = new.track_id
      and existing.played_at between new.played_at - interval '15 seconds'
        and new.played_at + interval '15 seconds'
  ) then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists plays_suppress_near_duplicate on public.plays;
create trigger plays_suppress_near_duplicate
before insert on public.plays
for each row execute function public.suppress_near_duplicate_play();

create or replace function public.ingest_desktop_play(
  p_played_at timestamptz,
  p_track_id text,
  p_track_name text,
  p_artist_names text[],
  p_album_name text default null,
  p_album_image text default null,
  p_duration_ms integer default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if public.current_profile_id() is null then
    raise exception 'Tracker profile is not ready';
  end if;
  if p_track_id is null or p_track_name is null or coalesce(array_length(p_artist_names, 1), 0) = 0 then
    raise exception 'Incomplete play data';
  end if;

  insert into public.plays (
    profile_id, played_at, source, track_id, track_name, artist_names,
    album_name, album_image, duration_ms, counted
  ) values (
    public.current_profile_id(), p_played_at, 'desktop', p_track_id, left(p_track_name, 500), p_artist_names,
    nullif(left(coalesce(p_album_name, ''), 500), ''),
    nullif(left(coalesce(p_album_image, ''), 1000), ''), p_duration_ms, true
  )
  on conflict (profile_id, played_at, track_name) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count > 0;
end;
$$;

revoke all on function public.ingest_desktop_play(timestamptz, text, text, text[], text, text, integer) from public;
grant execute on function public.ingest_desktop_play(timestamptz, text, text, text[], text, text, integer) to authenticated;
