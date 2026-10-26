-- Restore the historical import source after the backend consolidation.

alter table public.plays drop constraint if exists plays_source_check;
alter table public.plays add constraint plays_source_check
  check (source in ('spotify', 'desktop', 'lastfm', 'import', 'upload')) not valid;
alter table public.plays validate constraint plays_source_check;

drop policy if exists "plays_insert_own" on public.plays;
create policy "plays_insert_own" on public.plays for insert to authenticated
with check (
  profile_id = public.current_profile_id()
  and source in ('lastfm', 'import', 'upload', 'desktop')
);
