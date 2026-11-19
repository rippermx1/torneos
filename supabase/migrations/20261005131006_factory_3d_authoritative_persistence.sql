-- Practice-only server saves. Browser roles cannot write state or invoke these RPCs.
create schema if not exists factory_private;
revoke all on schema factory_private from public, anon, authenticated;
grant usage on schema factory_private to service_role;

create table factory_private.colonies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check(revision between 0 and 9999999999999),
  state jsonb,
  updated_at timestamptz not null default clock_timestamp(),
  check(state is null or (jsonb_typeof(state)='object' and octet_length(state::text)<=131072 and state->>'mode'='account-practice' and state->>'rulesVersion'='colony-3'))
);
create table factory_private.receipts (
  user_id uuid not null references factory_private.colonies(user_id) on delete cascade,
  command_id uuid not null,
  action_hash text not null check(action_hash ~ '^[0-9a-f]{64}$'),
  receipt jsonb not null check(octet_length(receipt::text)<=140000),
  created_at timestamptz not null default clock_timestamp(),
  primary key(user_id,command_id)
);
alter table factory_private.colonies enable row level security;
alter table factory_private.receipts enable row level security;
revoke all on all tables in schema factory_private from public,anon,authenticated;
grant select,insert,update on factory_private.colonies to service_role;
grant select,insert on factory_private.receipts to service_role;
-- Needed by service_role even in installations where it does not bypass RLS.
create policy factory_colony_service on factory_private.colonies to service_role using(true) with check(true);
create policy factory_receipt_service on factory_private.receipts to service_role using(true) with check(true);

create function public.factory_3d_load(p_user uuid,p_command uuid,p_action_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c factory_private.colonies%rowtype; r factory_private.receipts%rowtype;
begin
  insert into factory_private.colonies(user_id) values(p_user) on conflict do nothing;
  select * into c from factory_private.colonies where user_id=p_user;
  select * into r from factory_private.receipts where user_id=p_user and command_id=p_command;
  if found then
    if r.action_hash<>p_action_hash then raise exception 'command_payload_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('receipt',r.receipt);
  end if;
  return jsonb_build_object('state',c.state,'revision',c.revision,'serverTimeMs',floor(extract(epoch from clock_timestamp())*1000));
end $$;

create function public.factory_3d_commit(p_user uuid,p_command uuid,p_action_hash text,p_expected bigint,p_receipt jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare c factory_private.colonies%rowtype; r factory_private.receipts%rowtype;
begin
  select * into c from factory_private.colonies where user_id=p_user for update;
  if not found then raise exception 'missing_colony'; end if;
  select * into r from factory_private.receipts where user_id=p_user and command_id=p_command;
  if found then
    if r.action_hash<>p_action_hash then raise exception 'command_payload_conflict' using errcode='P0001'; end if;
    return jsonb_build_object('receipt',r.receipt);
  end if;
  if c.revision<>p_expected then return jsonb_build_object('conflict',true); end if;
  if coalesce((p_receipt->'state'->>'revision')::bigint,-1)<>p_expected+1
     or coalesce(p_receipt->>'commandId','')<>p_command::text
     or coalesce(p_receipt->>'prizeEligible','')<>'false'
     or coalesce(jsonb_typeof(p_receipt->'state'),'')<>'object' then raise exception 'invalid_receipt'; end if;
  update factory_private.colonies set revision=p_expected+1,state=p_receipt->'state',updated_at=clock_timestamp() where user_id=p_user;
  insert into factory_private.receipts(user_id,command_id,action_hash,receipt) values(p_user,p_command,p_action_hash,p_receipt);
  return jsonb_build_object('receipt',p_receipt);
end $$;
revoke all on function public.factory_3d_load(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.factory_3d_commit(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.factory_3d_load(uuid,uuid,text) to service_role;
grant execute on function public.factory_3d_commit(uuid,uuid,text,bigint,jsonb) to service_role;
