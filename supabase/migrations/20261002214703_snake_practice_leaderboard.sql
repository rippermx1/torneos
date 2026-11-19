-- Historical free-practice leaderboard. Histories and account XP remain private.
create table public.snake_practice_leaderboard_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  participating boolean not null default false
);
alter table public.snake_practice_leaderboard_preferences enable row level security;
create policy snake_leaderboard_own_read on public.snake_practice_leaderboard_preferences
  for select to authenticated using ((select auth.uid())=user_id);
create policy snake_leaderboard_own_insert on public.snake_practice_leaderboard_preferences
  for insert to authenticated with check ((select auth.uid())=user_id);
create policy snake_leaderboard_own_update on public.snake_practice_leaderboard_preferences
  for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.snake_practice_leaderboard_preferences from public,anon,authenticated,service_role;
grant select,insert,update on public.snake_practice_leaderboard_preferences to authenticated;
grant select on public.snake_practice_leaderboard_preferences to service_role;

-- Service-only invoker projection; never broadens the private history's RLS.
create view public.snake_practice_leaderboard with (security_invoker=true) as
  with best as (
    select r.user_id,max(r.score)::integer as score
    from public.snake_practice_runs r
    join public.snake_practice_leaderboard_preferences o on o.user_id=r.user_id and o.participating
    join public.profiles p on p.id=r.user_id and not p.is_banned
    where exists(select 1 from public.profile_roles pr where pr.profile_id=r.user_id and pr.role='user')
    group by r.user_id having max(r.score)>0
  )
  select b.user_id,
    left(coalesce(nullif(btrim(regexp_replace(p.username,'[<>[:cntrl:]]','','g')),''),'Jugador'),20) as name,
    b.score,rank() over(order by b.score desc)::bigint as position
  from best b join public.profiles p on p.id=b.user_id;
revoke all on public.snake_practice_leaderboard from public,anon,authenticated,service_role;
grant select on public.snake_practice_leaderboard to service_role;

-- One snapshot for top 20 and personal rank, including positions beyond the top.
-- Invoker + service-only execution; no public SECURITY DEFINER function.
create function public.snake_practice_leaderboard_snapshot(p_owner uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  with board as materialized (select * from public.snake_practice_leaderboard),
  top_rows as (
    select * from board order by score desc,name,user_id limit 20
  )
  select pg_catalog.jsonb_build_object(
    'players',(select count(*) from board),
    'entries',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',name,'score',score,'position',position,'isMe',coalesce(user_id=p_owner,false))
      order by score desc,name,user_id) from top_rows),'[]'::jsonb),
    'mine',case when p_owner is null then null else pg_catalog.jsonb_build_object(
      'participating',coalesce((select participating from public.snake_practice_leaderboard_preferences where user_id=p_owner),false),
      'best',coalesce((select max(score) from public.snake_practice_runs where user_id=p_owner),0),
      'position',(select position from board where user_id=p_owner)
    ) end
  );
$$;
revoke all on function public.snake_practice_leaderboard_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.snake_practice_leaderboard_snapshot(uuid) to service_role;
