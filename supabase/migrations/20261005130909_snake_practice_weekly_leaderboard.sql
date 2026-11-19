-- Weekly free-practice projection. Existing records/preferences remain unchanged.
create index snake_practice_runs_season on public.snake_practice_runs(ended_at,user_id) include(score);

-- Calendar dates in Santiago, never a fixed 168 hours across daylight-saving changes.
create function public.snake_practice_week_window(p_at timestamptz,p_previous boolean default false)
returns table(day date,starts_at timestamptz,ends_at timestamptz,server_now bigint)
language sql stable security invoker set search_path='' as $$
  with calendar as (
    select pg_catalog.date_trunc('week',p_at at time zone 'America/Santiago')::date
      - case when p_previous then 7 else 0 end as first_day
  )
  select first_day,first_day::timestamp at time zone 'America/Santiago',
    (first_day+7)::timestamp at time zone 'America/Santiago',
    pg_catalog.floor(extract(epoch from p_at)*1000)::bigint from calendar;
$$;
revoke all on function public.snake_practice_week_window(timestamptz,boolean) from public,anon,authenticated,service_role;
grant execute on function public.snake_practice_week_window(timestamptz,boolean) to service_role;

create function public.snake_practice_weekly_snapshot(p_owner uuid default null,p_previous boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
  with bounds as materialized (
    select * from public.snake_practice_week_window(pg_catalog.statement_timestamp(),p_previous)
  ), runs as materialized (
    select r.user_id,r.score from public.snake_practice_runs r cross join bounds w
    where r.ended_at>=w.starts_at and r.ended_at<w.ends_at
      and r.ended_at<=pg_catalog.statement_timestamp()
  ), best as (
    select r.user_id,max(r.score)::integer as score from runs r
    join public.snake_practice_leaderboard_preferences o on o.user_id=r.user_id and o.participating
    join public.profiles p on p.id=r.user_id and not p.is_banned
    where exists(select 1 from public.profile_roles pr where pr.profile_id=r.user_id and pr.role='user')
    group by r.user_id having max(r.score)>0
  ), board as materialized (
    select b.user_id,left(coalesce(nullif(btrim(regexp_replace(p.username,'[<>[:cntrl:]]','','g')),''),'Jugador'),20) as name,
      b.score,rank() over(order by b.score desc)::bigint as position
    from best b join public.profiles p on p.id=b.user_id
  ), top_rows as (
    select * from board order by score desc,name,user_id limit 20
  )
  select pg_catalog.jsonb_build_object(
    'season',(select pg_catalog.jsonb_build_object('day',day,'startsAt',starts_at,'endsAt',ends_at,'serverNow',server_now,
      'period',case when p_previous then 'previous' else 'current' end) from bounds),
    'players',(select count(*) from board),
    'entries',coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'name',name,'score',score,'position',position,'isMe',coalesce(user_id=p_owner,false))
      order by score desc,name,user_id) from top_rows),'[]'::jsonb),
    'mine',case when p_owner is null then null else pg_catalog.jsonb_build_object(
      'participating',coalesce((select participating from public.snake_practice_leaderboard_preferences where user_id=p_owner),false),
      'best',coalesce((select max(score) from runs where user_id=p_owner),0),
      'position',(select position from board where user_id=p_owner)
    ) end
  );
$$;
revoke all on function public.snake_practice_weekly_snapshot(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.snake_practice_weekly_snapshot(uuid,boolean) to service_role;
