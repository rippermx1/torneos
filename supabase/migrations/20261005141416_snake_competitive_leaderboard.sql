-- Free tournaments only; practice, frozen rules and results are unchanged.
create table public.snake_competitive_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  participating boolean not null default false
);
alter table public.snake_competitive_preferences enable row level security;
create policy snake_competitive_own_read on public.snake_competitive_preferences for select to authenticated using ((select auth.uid())=user_id);
create policy snake_competitive_own_insert on public.snake_competitive_preferences for insert to authenticated with check ((select auth.uid())=user_id);
create policy snake_competitive_own_update on public.snake_competitive_preferences for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
revoke all on public.snake_competitive_preferences from public,anon,authenticated,service_role;
grant select,insert,update on public.snake_competitive_preferences to authenticated;
grant select on public.snake_competitive_preferences to service_role;

create function public.snake_competitive_snapshot(p_owner uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
  with completed as (
    select t.id,count(r.user_id)::integer as players
    from public.snake_tournaments t join public.snake_results r on r.tournament_id=t.id
    where t.status='completed' and t.rules_version='snake-free-v1'
      and t.starts_at+pg_catalog.make_interval(secs=>t.duration_seconds)<=statement_timestamp()
    group by t.id,t.max_players
    having count(r.user_id) between 2 and t.max_players
      and count(r.user_id)=(select count(*) from public.snake_entries e where e.tournament_id=t.id)
      and min(r.rank)=1 and max(r.rank)=count(r.user_id)
  ), totals as materialized (
    select r.user_id,
      sum(case when r.reason='no_show' then 0 else pg_catalog.round(100.0*(c.players-r.rank)/(c.players-1))::integer end)::bigint as points,
      count(*) filter(where r.reason<>'no_show')::bigint as tournaments,
      count(*) filter(where r.reason<>'no_show' and r.rank=1)::bigint as wins
    from public.snake_results r join completed c on c.id=r.tournament_id group by r.user_id
  ), board as materialized (
    select a.user_id,a.points,a.tournaments,a.wins,
      left(coalesce(nullif(btrim(regexp_replace(p.username,'[<>[:cntrl:]]','','g')),''),'Jugador'),20) as name,
      rank() over(order by a.points desc,a.wins desc)::bigint as position
    from totals a
    join public.snake_competitive_preferences o on o.user_id=a.user_id and o.participating
    join public.profiles p on p.id=a.user_id and not p.is_banned
    where a.tournaments>0 and exists(select 1 from public.profile_roles pr where pr.profile_id=a.user_id and pr.role='user')
  ), top_rows as (select * from board order by points desc,wins desc,name,user_id limit 20)
  select pg_catalog.jsonb_build_object(
    'rules','snake-league-v1','players',(select count(*) from board),
    'entries',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',name,'points',points,'wins',wins,'tournaments',tournaments,'position',position,'isMe',coalesce(user_id=p_owner,false))
      order by points desc,wins desc,name,user_id) from top_rows),'[]'::jsonb),
    'mine',case when p_owner is null then null else pg_catalog.jsonb_build_object(
      'participating',coalesce((select participating from public.snake_competitive_preferences where user_id=p_owner),false),
      'points',coalesce((select points from totals where user_id=p_owner),0),
      'wins',coalesce((select wins from totals where user_id=p_owner),0),
      'tournaments',coalesce((select tournaments from totals where user_id=p_owner),0),
      'position',(select position from board where user_id=p_owner)
    ) end
  );
$$;
revoke all on function public.snake_competitive_snapshot(uuid) from public,anon,authenticated,service_role;
grant execute on function public.snake_competitive_snapshot(uuid) to service_role;
