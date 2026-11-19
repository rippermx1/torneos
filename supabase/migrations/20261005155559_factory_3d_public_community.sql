-- FE3D-09: publication is opt-in. No browser role can enumerate private saves.
create table factory_private.publications (
  user_id uuid primary key references factory_private.colonies(user_id) on delete cascade,
  id uuid not null unique default gen_random_uuid(),
  visible boolean not null default false,
  alias text not null check(char_length(alias) between 3 and 32 and alias !~ '[[:cntrl:]<>@]'),
  production_milli numeric(60,0) not null check(production_milli>=0),
  historical_milli numeric(60,0) not null check(historical_milli>=0),
  snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and octet_length(snapshot::text)<=131072),
  snapshot_at timestamptz not null,
  published_at timestamptz not null default clock_timestamp()
);
alter table factory_private.publications enable row level security;
revoke all on factory_private.publications from public,anon,authenticated;
grant select,insert,update on factory_private.publications to service_role;
create policy factory_publication_service on factory_private.publications to service_role using(true) with check(true);
create index factory_publication_production on factory_private.publications(production_milli desc,id) where visible;
create index factory_publication_history on factory_private.publications(historical_milli desc,id) where visible;

create function public.factory_3d_sharing(p_user uuid) returns jsonb
language sql stable security invoker set search_path='' as $$
  select coalesce((select jsonb_build_object('id',id,'visible',visible,'alias',alias) from factory_private.publications where user_id=p_user),jsonb_build_object('visible',false,'alias',''));
$$;

create function public.factory_3d_share(p_user uuid,p_visible boolean,p_alias text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c factory_private.colonies%rowtype; r jsonb;
begin
  if p_visible is null then raise exception 'invalid_visibility'; end if;
  select * into c from factory_private.colonies where user_id=p_user for update;
  if not found or c.state is null then raise exception 'missing_colony'; end if;
  if not p_visible then
    update factory_private.publications set visible=false where user_id=p_user;
    return public.factory_3d_sharing(p_user);
  end if;
  if p_alias is null or char_length(p_alias) not between 3 and 32 or p_alias ~ '[[:cntrl:]<>@]' then raise exception 'invalid_alias'; end if;
  -- Take metrics exclusively from the matching server receipt, never the browser.
  select receipt into r from factory_private.receipts where user_id=p_user and receipt->'state'->>'revision'=c.revision::text limit 1;
  if r is null or coalesce(r->>'rateMilli','') !~ '^[0-9]{1,60}$' then raise exception 'missing_verified_receipt'; end if;
  insert into factory_private.publications(user_id,visible,alias,production_milli,historical_milli,snapshot,snapshot_at)
    values(p_user,true,p_alias,(r->>'rateMilli')::numeric,(c.state->>'historical')::numeric,c.state,c.updated_at)
    on conflict(user_id) do update set visible=true,alias=excluded.alias,production_milli=excluded.production_milli,
      historical_milli=excluded.historical_milli,snapshot=excluded.snapshot,snapshot_at=excluded.snapshot_at;
  return public.factory_3d_sharing(p_user);
end $$;

create function factory_private.refresh_publication() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  update factory_private.publications set production_milli=(new.receipt->>'rateMilli')::numeric,
    historical_milli=(new.receipt->'state'->>'historical')::numeric,snapshot=new.receipt->'state',snapshot_at=new.created_at
    where user_id=new.user_id and visible;
  return new;
end $$;
revoke all on function factory_private.refresh_publication() from public,anon,authenticated;
grant execute on function factory_private.refresh_publication() to service_role;
create trigger factory_publication_receipt after insert on factory_private.receipts
  for each row execute function factory_private.refresh_publication();

create function public.factory_3d_community(p_id uuid,p_order text,p_offset integer) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
  if p_order not in ('production','history') or p_order is null or p_offset is null or p_offset not between 0 and 1000 then raise exception 'invalid_directory_query'; end if;
  select coalesce(jsonb_agg(item order by metric desc,id),'[]'::jsonb) into result from (
    select p.id,case when p_order='history' then p.historical_milli else p.production_milli end metric,
      jsonb_build_object('id',p.id,'name',p.alias,'productionMilli',p.production_milli::text,
        'historicalMilli',p.historical_milli::text,'cores',coalesce(p.snapshot->>'coresAwarded','0'),
        'prestiges',coalesce((p.snapshot->>'prestigeCount')::integer,0),
        'machines',jsonb_array_length(p.snapshot->'structures'),'snapshotAt',p.snapshot_at,
        'publishedAt',p.published_at,'revision',(p.snapshot->>'revision')::bigint,
        'state',case when p_id is not null then p.snapshot else null end) item
    from factory_private.publications p join public.profiles pr on pr.id=p.user_id
    where p.visible and not pr.is_banned and (p_id is null or p.id=p_id)
      and exists(select 1 from public.profile_roles roles where roles.profile_id=p.user_id and roles.role='user')
    order by metric desc,p.id limit 26 offset p_offset
  ) entries;
  return jsonb_build_object('items',result);
end $$;
revoke all on function public.factory_3d_sharing(uuid) from public,anon,authenticated;
revoke all on function public.factory_3d_share(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.factory_3d_community(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.factory_3d_sharing(uuid) to service_role;
grant execute on function public.factory_3d_share(uuid,boolean,text) to service_role;
grant execute on function public.factory_3d_community(uuid,text,integer) to service_role;
