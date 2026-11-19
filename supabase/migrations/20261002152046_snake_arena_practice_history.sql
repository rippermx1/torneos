-- SA-11: practice history only; no tournament, wallet, prize or Flow relationships.
create table public.snake_practice_runs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null check(score between 0 and 10000000),
  rank integer not null check(rank between 1 and 64),
  kills integer not null check(kills between 0 and 100000),
  survived_seconds numeric not null check(survived_seconds between 0 and 86400),
  max_size integer not null check(max_size between 8 and 240),
  reason text not null check(reason in ('boundary','head_collision','body_collision','disconnect')),
  ended_at timestamptz not null
);
create index snake_practice_runs_recent on public.snake_practice_runs(user_id,ended_at desc);
create index snake_practice_runs_best on public.snake_practice_runs(user_id,score desc);
alter table public.snake_practice_runs enable row level security;
create policy snake_practice_own_read on public.snake_practice_runs for select to authenticated
  using ((select auth.uid())=user_id);
revoke all on public.snake_practice_runs from anon,authenticated;
grant select on public.snake_practice_runs to authenticated;
grant select,insert on public.snake_practice_runs to service_role;
-- Existing service_role default privileges can include mutation grants; remove them explicitly.
revoke update,delete,truncate on public.snake_practice_runs from service_role;
