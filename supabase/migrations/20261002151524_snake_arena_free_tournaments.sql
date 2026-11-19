-- Free Snake competitions have no wallet/Flow relationship or monetary columns.
create table public.snake_tournaments (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 3 and 80),
 starts_at timestamptz not null, duration_seconds integer not null check(duration_seconds between 60 and 300),
 max_players integer not null check(max_players between 2 and 16),
 rules_version text not null default 'snake-free-v1' check(rules_version='snake-free-v1'),
 status text not null default 'open' check(status in ('open','locked','live','completed','cancelled')),
 cancel_reason text, worker_id uuid, lease_until timestamptz,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index snake_tournaments_schedule on public.snake_tournaments(status,starts_at);
create table public.snake_entries (
 tournament_id uuid not null references public.snake_tournaments(id), user_id uuid not null references public.profiles(id),
 display_name text not null, registered_at timestamptz not null default now(), primary key(tournament_id,user_id)
);
create table public.snake_results (
 tournament_id uuid not null, user_id uuid not null, display_name text not null,
 score integer not null check(score>=0), kills integer not null check(kills>=0),
 survived_ms integer not null check(survived_ms>=0), rank integer not null check(rank>0),
 reason text not null check(reason in ('wall','body','head','timeout','disconnect','no_show')),
 primary key(tournament_id,user_id), unique(tournament_id,rank),
 foreign key(tournament_id,user_id) references public.snake_entries(tournament_id,user_id)
);
alter table public.snake_tournaments enable row level security;
alter table public.snake_entries enable row level security;
alter table public.snake_results enable row level security;
create policy snake_tournaments_read on public.snake_tournaments for select using(true);
create policy snake_entries_own on public.snake_entries for select to authenticated using(user_id=auth.uid());
create policy snake_results_read on public.snake_results for select using(true);
revoke all on public.snake_tournaments,public.snake_entries,public.snake_results from anon,authenticated;
grant select(id,name,starts_at,duration_seconds,max_players,rules_version,status,cancel_reason,created_at) on public.snake_tournaments to anon,authenticated;
grant select on public.snake_entries to authenticated;
grant select on public.snake_results to anon,authenticated;
grant all on public.snake_tournaments,public.snake_entries,public.snake_results to service_role;

create function public.snake_register(p_tournament uuid,p_user uuid,p_terms text) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.snake_tournaments; p public.profiles;
begin
 select * into t from public.snake_tournaments where id=p_tournament for update;
 if not found then raise exception 'not_found'; end if;
 select * into p from public.profiles where id=p_user;
 if not found or p.is_banned or p.terms_accepted_at is null or p.terms_version is distinct from p_terms
 or p.birth_date is null or p.birth_date > (current_date - interval '18 years')::date
 or not exists(select 1 from public.profile_roles where profile_id=p_user and role='user')
 or not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null)
 then raise exception 'profile_required'; end if;
 if exists(select 1 from public.snake_entries where tournament_id=p_tournament and user_id=p_user) then return; end if;
 if t.status<>'open' or now()>=t.starts_at-interval '30 seconds' then raise exception 'registration_closed'; end if;
 if (select count(*) from public.snake_entries where tournament_id=p_tournament)>=t.max_players then raise exception 'capacity'; end if;
 insert into public.snake_entries(tournament_id,user_id,display_name) values(p_tournament,p_user,left(p.username,20));
end $$;

create function public.snake_claim(p_tournament uuid,p_worker uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.snake_tournaments; roster jsonb;
begin
 select * into t from public.snake_tournaments where id=p_tournament for update;
 if not found or t.status<>'open' or now()<t.starts_at-interval '30 seconds' then return null; end if;
 if now()>=t.starts_at or (select count(*) from public.snake_entries where tournament_id=p_tournament)<2 then
 update public.snake_tournaments set status='cancelled',cancel_reason=case when now()>=t.starts_at then 'server_unavailable' else 'insufficient_players' end where id=t.id; return null; end if;
 update public.snake_tournaments set status='locked',worker_id=p_worker,lease_until=now()+interval '15 seconds' where id=t.id;
 select jsonb_agg(jsonb_build_object('id',user_id,'name',display_name) order by user_id) into roster from public.snake_entries where tournament_id=t.id;
 return jsonb_build_object('id',t.id,'startsAt',t.starts_at,'duration',t.duration_seconds,'maxPlayers',t.max_players,'roster',roster);
end $$;

create function public.snake_heartbeat(p_tournament uuid,p_worker uuid) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update public.snake_tournaments set lease_until=now()+interval '15 seconds',status=case when now()>=starts_at then 'live' else 'locked' end
 where id=p_tournament and worker_id=p_worker and status in ('locked','live') and lease_until>now();
 return found;
end $$;

create function public.snake_recover() returns void
language sql security definer set search_path=public,pg_temp as $$
 update public.snake_tournaments set status='cancelled',cancel_reason='server_interrupted'
 where status in ('locked','live') and lease_until<now();
$$;

create function public.snake_finish(p_tournament uuid,p_worker uuid,p_results jsonb) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.snake_tournaments; expected integer;
begin
 select * into t from public.snake_tournaments where id=p_tournament for update;
 if not found or t.worker_id is distinct from p_worker then raise exception 'ownership'; end if;
 if t.status='completed' then return; end if;
 if t.status not in ('locked','live') or t.lease_until<now() or now()<t.starts_at+make_interval(secs=>t.duration_seconds) then raise exception 'not_finishable'; end if;
 select count(*) into expected from public.snake_entries where tournament_id=t.id;
 if jsonb_typeof(p_results)<>'array' or jsonb_array_length(p_results)<>expected then raise exception 'incomplete_results'; end if;
 if (select count(distinct (r->>'id')::uuid) from jsonb_array_elements(p_results) r)<>expected
 or exists(select 1 from jsonb_array_elements(p_results) r where not exists(select 1 from public.snake_entries e where e.tournament_id=t.id and e.user_id=(r->>'id')::uuid)
 or (r->>'survived_ms')::integer not between 0 and t.duration_seconds*1000) then raise exception 'invalid_results'; end if;
 insert into public.snake_results(tournament_id,user_id,display_name,score,kills,survived_ms,rank,reason)
 select t.id,e.user_id,e.display_name,(r->>'score')::integer,(r->>'kills')::integer,(r->>'survived_ms')::integer,
 row_number() over(order by (r->>'score')::integer desc,(r->>'survived_ms')::integer desc,(r->>'kills')::integer desc,e.user_id),r->>'reason'
 from jsonb_array_elements(p_results) r join public.snake_entries e on e.tournament_id=t.id and e.user_id=(r->>'id')::uuid;
 update public.snake_tournaments set status='completed',lease_until=null where id=t.id;
end $$;
revoke all on function public.snake_register(uuid,uuid,text),public.snake_claim(uuid,uuid),public.snake_heartbeat(uuid,uuid),public.snake_recover(),public.snake_finish(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.snake_register(uuid,uuid,text),public.snake_claim(uuid,uuid),public.snake_heartbeat(uuid,uuid),public.snake_recover(),public.snake_finish(uuid,uuid,jsonb) to service_role;
