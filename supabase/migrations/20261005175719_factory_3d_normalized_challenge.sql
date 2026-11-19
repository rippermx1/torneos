-- FE3D-10. Practice-only normalized runs, isolated from campaign/publications.
create table factory_private.challenge_editions (
  edition date primary key,
  seed integer not null,
  rules_hash text not null check(rules_hash ~ '^[0-9a-f]{64}$'),
  content jsonb not null check(octet_length(content::text)<=32768),
  duration_ms bigint not null check(duration_ms=86400000)
);
create table factory_private.challenge_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  edition date not null references factory_private.challenge_editions(edition),
  alias text not null check(char_length(alias) between 3 and 32 and alias !~ '[[:cntrl:]<>@]'),
  started_ms bigint not null,
  ends_ms bigint not null check(ends_ms=started_ms+86400000),
  closed_ms bigint,
  revision bigint not null default 0 check(revision between 0 and 9999999999999),
  state jsonb not null check(jsonb_typeof(state)='object' and octet_length(state::text)<=131072 and state->>'mode'='normalized-challenge' and state->>'coresAwarded'='0' and state->>'prestigeCount'='0'),
  rate_milli numeric(60,0) not null default 0 check(rate_milli>=0),
  score_milli numeric(60,0) not null default 0 check(score_milli>=0),
  unique(user_id,edition),
  check(closed_ms is null or closed_ms=ends_ms)
);
create unique index factory_challenge_one_active on factory_private.challenge_entries(user_id) where closed_ms is null;
create index factory_challenge_due on factory_private.challenge_entries(ends_ms,id) where closed_ms is null;
create index factory_challenge_ranking on factory_private.challenge_entries(edition,score_milli desc,rate_milli desc,id) where closed_ms is not null;
create table factory_private.challenge_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  command_id uuid not null,
  entry_id uuid not null references factory_private.challenge_entries(id) on delete cascade,
  action_hash text not null check(action_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null check(octet_length(receipt::text)<=140000),
  primary key(user_id,command_id)
);
alter table factory_private.challenge_editions enable row level security;
alter table factory_private.challenge_entries enable row level security;
alter table factory_private.challenge_receipts enable row level security;
revoke all on factory_private.challenge_editions,factory_private.challenge_entries,factory_private.challenge_receipts from public,anon,authenticated;
grant select,insert on factory_private.challenge_editions,factory_private.challenge_receipts to service_role;
grant select,insert,update on factory_private.challenge_entries to service_role;
create policy factory_challenge_editions_service on factory_private.challenge_editions to service_role using(true) with check(true);
create policy factory_challenge_entries_service on factory_private.challenge_entries to service_role using(true) with check(true);
create policy factory_challenge_receipts_service on factory_private.challenge_receipts to service_role using(true) with check(true);

create function factory_private.challenge_finish(p_entry uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare e factory_private.challenge_entries%rowtype; earned numeric; numerator numeric; s jsonb;
begin
  select * into e from factory_private.challenge_entries where id=p_entry for update;
  if not found or e.closed_ms is not null or floor(extract(epoch from clock_timestamp())*1000)<e.ends_ms then return; end if;
  -- All passive production up to the deadline, even if nobody returns. The rate
  -- is the one committed with the last server action; no client clock or score.
  numerator:=e.rate_milli*(e.ends_ms-(e.state->>'lastSettledMs')::bigint)+(e.state->>'remainder')::integer;
  earned:=floor(numerator/1000);
  s:=e.state||jsonb_build_object('balance',((e.state->>'balance')::numeric+earned)::text,
    'extracted',((e.state->>'extracted')::numeric+earned)::text,'historical',((e.state->>'historical')::numeric+earned)::text,
    'remainder',mod(numerator,1000)::integer,'lastSettledMs',e.ends_ms,'revision',e.revision+1);
  update factory_private.challenge_entries set state=s,revision=e.revision+1,score_milli=(s->>'historical')::numeric,closed_ms=e.ends_ms where id=e.id;
end $$;

create function factory_private.challenge_receipt(p_entry uuid,p_command uuid,p_now bigint,p_accepted boolean,p_message text) returns jsonb
language sql stable security invoker set search_path='' as $$
  select jsonb_build_object('state',e.state,'serverTimeMs',p_now,'rateMilli',e.rate_milli::text,'offlineEarned','0',
    'accepted',p_accepted,'message',p_message,'commandId',p_command,'prizeEligible',false,'entryId',e.id,'edition',e.edition,
    'startedAtMs',e.started_ms,'endsAtMs',e.ends_ms,'closed',e.closed_ms is not null,'rulesHash',d.rules_hash,'scoreMilli',e.score_milli::text)
  from factory_private.challenge_entries e join factory_private.challenge_editions d using(edition) where e.id=p_entry;
$$;

create function public.factory_3d_challenge_close_due() returns integer
language plpgsql security invoker set search_path='' as $$
declare entry record; count_closed integer:=0;
begin
  for entry in select id from factory_private.challenge_entries where closed_ms is null
    and ends_ms<=floor(extract(epoch from clock_timestamp())*1000) order by ends_ms,id limit 500 for update skip locked
  loop perform factory_private.challenge_finish(entry.id);count_closed:=count_closed+1;end loop;
  return count_closed;
end $$;

create function public.factory_3d_challenge_start(p_user uuid,p_command uuid,p_action_hash text,p_alias text,p_content jsonb,p_rules_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e factory_private.challenge_entries%rowtype; old factory_private.challenge_receipts%rowtype;
  day date; now_ms bigint; d factory_private.challenge_editions%rowtype; result jsonb; s jsonb; entry_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended('factory-challenge:'||p_user::text,0));
  select * into old from factory_private.challenge_receipts where user_id=p_user and command_id=p_command;
  if found then
    if old.action_hash<>p_action_hash then raise exception 'command_payload_conflict'; end if;
    return old.receipt;
  end if;
  if p_alias is null or char_length(p_alias) not between 3 and 32 or p_alias ~ '[[:cntrl:]<>@]' then raise exception 'invalid_alias'; end if;
  if p_rules_hash !~ '^[0-9a-f]{64}$' or (p_content->'challenge'->>'durationMs')::bigint<>86400000
     or p_content->'challenge'->>'startingBalanceMilli'<>'0' or p_content->'challenge'->>'prestigeAllowed'<>'false'
     or p_content->'rules'->>'version'<>'colony-3' then raise exception 'incompatible_rules'; end if;
  select * into e from factory_private.challenge_entries where user_id=p_user and closed_ms is null for update;
  if found then perform factory_private.challenge_finish(e.id);end if;
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);day:=(to_timestamp(now_ms/1000.0) at time zone 'UTC')::date;
  select * into e from factory_private.challenge_entries where user_id=p_user and (closed_ms is null or edition=day) order by started_ms desc limit 1;
  if not found then
    insert into factory_private.challenge_editions values(day,(p_content->'challenge'->>'seed')::integer,p_rules_hash,p_content,86400000) on conflict do nothing;
    select * into d from factory_private.challenge_editions where edition=day;
    if d.rules_hash<>p_rules_hash then raise exception 'incompatible_rules'; end if;
    entry_id:=gen_random_uuid();
    s:=jsonb_build_object('schema',4,'seed',d.seed,'rulesVersion',d.content->'rules'->>'version','worldId',replace(entry_id::text,'-',''),
      'mode','normalized-challenge','balance','0','extracted','0','historical','0','revision',0,'lastSettledMs',now_ms,'lastManualMs',0,
      'remainder',0,'sectors',jsonb_build_array(12),'structures','[]'::jsonb,'technologies','[]'::jsonb,'coresAwarded','0','prestigeCount',0,'earnedAchievements','[]'::jsonb);
    insert into factory_private.challenge_entries(id,user_id,edition,alias,started_ms,ends_ms,state) values(entry_id,p_user,day,p_alias,now_ms,now_ms+86400000,s) returning * into e;
  end if;
  result:=factory_private.challenge_receipt(e.id,p_command,now_ms,e.closed_ms is null,case when e.closed_ms is null then 'Desafío de 24 horas iniciado o recuperado.' else 'Este desafío ya finalizó; no se puede reiniciar.' end);
  insert into factory_private.challenge_receipts values(p_user,p_command,e.id,p_action_hash,result);
  return result;
end $$;

create function public.factory_3d_challenge_load(p_user uuid,p_entry uuid,p_command uuid,p_action_hash text,p_rules_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e factory_private.challenge_entries%rowtype; old factory_private.challenge_receipts%rowtype; d factory_private.challenge_editions%rowtype; now_ms bigint; result jsonb;
begin
  select * into e from factory_private.challenge_entries where id=p_entry and user_id=p_user;
  if not found then raise exception 'challenge_not_found'; end if;
  select * into old from factory_private.challenge_receipts where user_id=p_user and command_id=p_command;
  if found then
    if old.action_hash<>p_action_hash or old.entry_id<>p_entry then raise exception 'command_payload_conflict'; end if;
    return jsonb_build_object('receipt',old.receipt);
  end if;
  perform factory_private.challenge_finish(p_entry);
  select * into e from factory_private.challenge_entries where id=p_entry;
  select * into d from factory_private.challenge_editions where edition=e.edition;
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  if now_ms>=e.ends_ms and e.closed_ms is null then
    perform factory_private.challenge_finish(p_entry);
    select * into e from factory_private.challenge_entries where id=p_entry;
  end if;
  if e.closed_ms is not null then
    result:=factory_private.challenge_receipt(e.id,p_command,now_ms,false,'Desafío finalizado. Resultado definitivo de tu partida.');
    insert into factory_private.challenge_receipts values(p_user,p_command,e.id,p_action_hash,result) on conflict do nothing;
    select * into old from factory_private.challenge_receipts where user_id=p_user and command_id=p_command;
    if old.action_hash<>p_action_hash or old.entry_id<>p_entry then raise exception 'command_payload_conflict'; end if;
    return jsonb_build_object('receipt',old.receipt);
  end if;
  if d.rules_hash<>p_rules_hash then raise exception 'incompatible_rules'; end if;
  return jsonb_build_object('state',e.state,'revision',e.revision,'serverTimeMs',now_ms,'entryId',e.id,'edition',e.edition,
    'startedAtMs',e.started_ms,'endsAtMs',e.ends_ms,'rulesHash',d.rules_hash);
end $$;

create function public.factory_3d_challenge_commit(p_user uuid,p_entry uuid,p_command uuid,p_action_hash text,p_expected bigint,p_receipt jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e factory_private.challenge_entries%rowtype; old factory_private.challenge_receipts%rowtype; result jsonb; now_ms bigint;
begin
  select * into e from factory_private.challenge_entries where id=p_entry and user_id=p_user for update;
  if not found then raise exception 'challenge_not_found'; end if;
  select * into old from factory_private.challenge_receipts where user_id=p_user and command_id=p_command;
  if found then
    if old.action_hash<>p_action_hash or old.entry_id<>p_entry then raise exception 'command_payload_conflict'; end if;
    return jsonb_build_object('receipt',old.receipt);
  end if;
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  if e.closed_ms is not null or now_ms>=e.ends_ms then
    perform factory_private.challenge_finish(e.id);
    result:=factory_private.challenge_receipt(e.id,p_command,now_ms,false,'El plazo terminó antes de confirmar la acción. Resultado cerrado.');
  else
    if e.revision<>p_expected then return jsonb_build_object('conflict',true); end if;
    if coalesce((p_receipt->'state'->>'revision')::bigint,-1)<>p_expected+1 or p_receipt->>'entryId'<>e.id::text
      or coalesce(p_receipt->>'commandId','')<>p_command::text or coalesce(p_receipt->>'prizeEligible','')<>'false'
      or coalesce(p_receipt->>'closed','')<>'false' or p_receipt->'state'->>'worldId'<>e.state->>'worldId'
      or p_receipt->'state'->>'seed'<>e.state->>'seed' or p_receipt->'state'->>'mode'<>'normalized-challenge'
      or (p_receipt->'state'->>'lastSettledMs')::bigint< (e.state->>'lastSettledMs')::bigint
      or (p_receipt->'state'->>'lastSettledMs')::bigint>=e.ends_ms
      or (p_receipt->'state'->>'lastSettledMs')::bigint>now_ms
      or coalesce(p_receipt->>'rateMilli','') !~ '^[0-9]{1,60}$' then raise exception 'invalid_receipt'; end if;
    update factory_private.challenge_entries set state=p_receipt->'state',revision=p_expected+1,rate_milli=(p_receipt->>'rateMilli')::numeric,score_milli=(p_receipt->'state'->>'historical')::numeric where id=e.id;
    result:=p_receipt;
  end if;
  insert into factory_private.challenge_receipts values(p_user,p_command,e.id,p_action_hash,result);
  return jsonb_build_object('receipt',result);
end $$;

create function public.factory_3d_challenge_status(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare e factory_private.challenge_entries%rowtype; now_ms bigint; position bigint; result jsonb;
begin
  select * into e from factory_private.challenge_entries where user_id=p_user order by started_ms desc limit 1;
  if found then perform factory_private.challenge_finish(e.id);select * into e from factory_private.challenge_entries where id=e.id;end if;
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  if e.id is null then return jsonb_build_object('serverTimeMs',now_ms,'entry',null);end if;
  if e.closed_ms is not null then
    -- Shared ranks for identical metrics; UUID only stabilizes display ordering.
    select 1+count(*) into position from factory_private.challenge_entries x join public.profiles pr on pr.id=x.user_id
      where x.edition=e.edition and x.closed_ms is not null and not pr.is_banned
      and exists(select 1 from public.profile_roles roles where roles.profile_id=x.user_id and roles.role='user')
      and (x.score_milli>e.score_milli or (x.score_milli=e.score_milli and x.rate_milli>e.rate_milli));
  end if;
  result:=factory_private.challenge_receipt(e.id,null,now_ms,false,case when e.closed_ms is null then 'Desafío en curso.' else 'Desafío finalizado.' end);
  return jsonb_build_object('serverTimeMs',now_ms,'entry',result||jsonb_build_object('alias',e.alias,'rank',position));
end $$;

create function public.factory_3d_challenge_board(p_edition date,p_offset integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare day date:=coalesce(p_edition,(clock_timestamp() at time zone 'UTC')::date);now_ms bigint;items jsonb;
begin
  if p_offset is null or p_offset not between 0 and 1000 or mod(p_offset,20)<>0 then raise exception 'invalid_directory_query'; end if;
  perform public.factory_3d_challenge_close_due();
  now_ms:=floor(extract(epoch from clock_timestamp())*1000);
  with ranked as (
    select x.id,x.alias,x.score_milli,x.rate_milli,x.closed_ms,rank() over(order by x.score_milli desc,x.rate_milli desc) as position
    from factory_private.challenge_entries x join public.profiles pr on pr.id=x.user_id
    where x.edition=day and x.closed_ms is not null and not pr.is_banned
      and exists(select 1 from public.profile_roles roles where roles.profile_id=x.user_id and roles.role='user')
  ), page as (select * from ranked order by score_milli desc,rate_milli desc,id limit 21 offset p_offset)
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',alias,'rank',position,'scoreMilli',score_milli::text,'rateMilli',rate_milli::text,'closedAtMs',closed_ms) order by score_milli desc,rate_milli desc,id),'[]'::jsonb) into items from page;
  return jsonb_build_object('edition',day,'serverTimeMs',now_ms,'items',items,
    'seed',(select seed from factory_private.challenge_editions where edition=day),
    'rulesHash',(select rules_hash from factory_private.challenge_editions where edition=day),
    'final',now_ms>=floor(extract(epoch from (day::timestamp at time zone 'UTC'))*1000)+172800000 and not exists(select 1 from factory_private.challenge_entries where edition=day and closed_ms is null),
    'active',(select count(*) from factory_private.challenge_entries where edition=day and closed_ms is null and ends_ms>now_ms),
    'closing',(select count(*) from factory_private.challenge_entries where edition=day and closed_ms is null and ends_ms<=now_ms),
    'finished',(select count(*) from factory_private.challenge_entries x join public.profiles pr on pr.id=x.user_id where edition=day and closed_ms is not null and not pr.is_banned and exists(select 1 from public.profile_roles roles where roles.profile_id=x.user_id and roles.role='user')));
end $$;

revoke all on function factory_private.challenge_finish(uuid),factory_private.challenge_receipt(uuid,uuid,bigint,boolean,text),
  public.factory_3d_challenge_close_due(),public.factory_3d_challenge_start(uuid,uuid,text,text,jsonb,text),
  public.factory_3d_challenge_load(uuid,uuid,uuid,text,text),public.factory_3d_challenge_commit(uuid,uuid,uuid,text,bigint,jsonb),
  public.factory_3d_challenge_status(uuid),public.factory_3d_challenge_board(date,integer) from public,anon,authenticated;
grant execute on function factory_private.challenge_finish(uuid),factory_private.challenge_receipt(uuid,uuid,bigint,boolean,text),
  public.factory_3d_challenge_close_due(),public.factory_3d_challenge_start(uuid,uuid,text,text,jsonb,text),
  public.factory_3d_challenge_load(uuid,uuid,uuid,text,text),public.factory_3d_challenge_commit(uuid,uuid,uuid,text,bigint,jsonb),
  public.factory_3d_challenge_status(uuid),public.factory_3d_challenge_board(date,integer) to service_role;

-- Existing pg_cron installations close due runs independently of browser visits.
-- No extension/server/secret is provisioned by this migration.
do $$ begin
  if to_regprocedure('cron.schedule(text,text,text)') is not null then
    perform cron.schedule('factory-3d-challenge-close','* * * * *','select public.factory_3d_challenge_close_due();');
  end if;
end $$;
