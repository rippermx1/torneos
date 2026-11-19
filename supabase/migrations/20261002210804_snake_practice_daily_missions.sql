create table public.snake_practice_daily_contributions (
  round_id uuid not null,
  day date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  lights integer not null check(lights between 0 and 30),
  growth integer not null check(growth between 0 and 1),
  stars integer not null check(stars between 0 and 2),
  observed_at timestamptz not null,
  primary key(round_id,day),
  check(day = (observed_at at time zone 'America/Santiago')::date)
);
create index snake_daily_contributions_owner on public.snake_practice_daily_contributions(user_id,day);
alter table public.snake_practice_daily_contributions enable row level security;
create policy snake_daily_contributions_own on public.snake_practice_daily_contributions
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.snake_practice_daily_contributions from public,anon,authenticated,service_role;
grant select on public.snake_practice_daily_contributions to authenticated;
grant select,insert,update on public.snake_practice_daily_contributions to service_role;

create table public.snake_practice_daily_rewards (
  user_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  mission_id text not null,
  xp integer not null,
  earned_at timestamptz not null default now(),
  primary key(user_id,day,mission_id),
  check((mission_id='lights' and xp=60) or (mission_id='growth' and xp=75) or (mission_id='stars' and xp=100))
);
alter table public.snake_practice_daily_rewards enable row level security;
create policy snake_daily_rewards_own on public.snake_practice_daily_rewards
  for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.snake_practice_daily_rewards from public,anon,authenticated,service_role;
grant select on public.snake_practice_daily_rewards to authenticated,service_role;

-- A private trigger serializes each owner's day before writes and prevents older
-- cumulative checkpoints from rolling back progress or changing their identity.
create function private.snake_daily_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and (new.user_id<>old.user_id or new.round_id<>old.round_id or new.day<>old.day) then
    raise exception 'daily contribution identity is immutable';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text||':'||new.day::text,0));
  if tg_op='UPDATE' then
    new.lights=greatest(old.lights,new.lights);
    new.growth=greatest(old.growth,new.growth);
    new.stars=greatest(old.stars,new.stars);
    new.observed_at=greatest(old.observed_at,new.observed_at);
  end if;
  return new;
end;
$$;
revoke all on function private.snake_daily_guard() from public,anon,authenticated,service_role;
create trigger snake_daily_guard before insert or update on public.snake_practice_daily_contributions
  for each row execute function private.snake_daily_guard();

create function private.snake_daily_award() returns trigger
language plpgsql security definer set search_path='' as $$
declare l bigint; g bigint; s bigint;
begin
  select sum(lights),sum(growth),sum(stars) into l,g,s
    from public.snake_practice_daily_contributions where user_id=new.user_id and day=new.day;
  insert into public.snake_practice_daily_rewards(user_id,day,mission_id,xp)
    select new.user_id,new.day,v.id,v.xp from (values ('lights',60,l>=30),('growth',75,g>=3),('stars',100,s>=2)) v(id,xp,complete)
    where v.complete on conflict(user_id,day,mission_id) do nothing;
  return new;
end;
$$;
revoke all on function private.snake_daily_award() from public,anon,authenticated,service_role;
create trigger snake_daily_award after insert or update on public.snake_practice_daily_contributions
  for each row execute function private.snake_daily_award();

create view public.snake_practice_daily_progress with (security_invoker=true) as
  select user_id,day,least(sum(lights),30)::integer as lights,
    least(sum(growth),3)::integer as growth,least(sum(stars),2)::integer as stars
  from public.snake_practice_daily_contributions group by user_id,day;
revoke all on public.snake_practice_daily_progress from public,anon,authenticated,service_role;
grant select on public.snake_practice_daily_progress to authenticated,service_role;

create or replace view public.snake_practice_progress with (security_invoker=true) as
  select user_id,least(sum(xp),1000000000)::bigint as xp from (
    select user_id,xp from public.snake_practice_rewards
    union all select user_id,xp from public.snake_practice_daily_rewards
  ) rewards group by user_id;
