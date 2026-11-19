-- Persistent fairness survives worker/application restarts. No financial state changes.
alter table public.tournaments add column if not exists last_transition_checked_at timestamptz;
create index if not exists tournaments_transition_queue_idx
  on public.tournaments (last_transition_checked_at nulls first, play_window_start, id)
  where status in ('scheduled', 'open', 'live', 'finalizing', 'cancelled');
notify pgrst, 'reload schema';
