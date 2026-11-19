create table public.snake_practice_rewards (
  round_id uuid not null,
  mission_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  xp integer not null,
  earned_at timestamptz not null,
  primary key (round_id, mission_id),
  constraint snake_practice_reward_amount check (
    (mission_id = 'gather' and xp = 25) or
    (mission_id = 'grow' and xp = 35) or
    (mission_id = 'star' and xp = 60)
  )
);
create index snake_practice_rewards_owner on public.snake_practice_rewards(user_id);
alter table public.snake_practice_rewards enable row level security;
create policy snake_practice_rewards_own on public.snake_practice_rewards
  for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.snake_practice_rewards from public, anon, authenticated, service_role;
grant select on public.snake_practice_rewards to authenticated;
grant select, insert on public.snake_practice_rewards to service_role;

create view public.snake_practice_progress with (security_invoker = true) as
  select user_id, least(sum(xp), 1000000000)::bigint as xp
  from public.snake_practice_rewards group by user_id;
revoke all on public.snake_practice_progress from public, anon, authenticated, service_role;
grant select on public.snake_practice_progress to authenticated, service_role;
