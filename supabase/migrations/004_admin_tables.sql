-- ============================================================
-- Retiros y Disputas
-- ============================================================

-- ── WITHDRAWAL REQUESTS ──────────────────────────────────────
create table withdrawal_requests (
  id               uuid default gen_random_uuid() primary key,
  user_id          text references profiles(id) not null,
  amount_cents     bigint not null check (amount_cents > 0),
  status           text not null default 'pending'
                   check (status in ('pending', 'approved', 'rejected')),
  bank_name        text not null,
  bank_account     text not null,
  account_rut      text not null,
  account_holder   text not null,
  admin_notes      text,
  reviewed_by      text references profiles(id),
  reviewed_at      timestamptz,
  created_at       timestamptz not null default now()
);

alter table withdrawal_requests enable row level security;

create index idx_withdrawals_user    on withdrawal_requests(user_id, created_at desc);
create index idx_withdrawals_status  on withdrawal_requests(status, created_at desc);

create policy "Usuario ve sus retiros"
  on withdrawal_requests for select
  using (auth.uid()::text = user_id);

create policy "Admin ve todos los retiros"
  on withdrawal_requests for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid()::text and p.is_admin = true)
  );

-- ── DISPUTES ─────────────────────────────────────────────────

create table disputes (
  id             uuid default gen_random_uuid() primary key,
  user_id        text references profiles(id) not null,
  tournament_id  uuid references tournaments(id),
  type           text not null
                 check (type in ('payment', 'tournament_result', 'technical', 'other')),
  description    text not null,
  status         text not null default 'open'
                 check (status in ('open', 'resolved', 'rejected')),
  admin_notes    text,
  resolved_by    text references profiles(id),
  resolved_at    timestamptz,
  created_at     timestamptz not null default now()
);

alter table disputes enable row level security;

create index idx_disputes_user    on disputes(user_id, created_at desc);
create index idx_disputes_status  on disputes(status, created_at desc);

create policy "Usuario ve sus disputas"
  on disputes for select
  using (auth.uid()::text = user_id);

create policy "Usuario crea disputas"
  on disputes for insert
  with check (auth.uid()::text = user_id);

create policy "Admin ve todas las disputas"
  on disputes for select
  using (
    exists (select 1 from profiles p where p.id = auth.uid()::text and p.is_admin = true)
  );

-- ── FUNCIÓN APROBAR RETIRO ───────────────────────────────────
create or replace function approve_withdrawal(
  p_request_id uuid,
  p_admin_id   text,
  p_notes      text default null
) returns void as $$
begin
  update withdrawal_requests
  set
    status      = 'approved',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Solicitud no encontrada o ya procesada: %', p_request_id;
  end if;
end;
$$ language plpgsql security definer;

-- ── FUNCIÓN RECHAZAR RETIRO ──────────────────────────────────
create or replace function reject_withdrawal(
  p_request_id uuid,
  p_admin_id   text,
  p_notes      text default null
) returns void as $$
declare
  v_req withdrawal_requests%rowtype;
begin
  select * into v_req
  from withdrawal_requests
  where id = p_request_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Solicitud no encontrada o ya procesada: %', p_request_id;
  end if;

  perform wallet_insert_transaction(
    v_req.user_id,
    'refund',
    v_req.amount_cents,
    'withdrawal',
    p_request_id,
    jsonb_build_object('reason', 'withdrawal_rejected')
  );

  update withdrawal_requests
  set
    status      = 'rejected',
    admin_notes = p_notes,
    reviewed_by = p_admin_id,
    reviewed_at = now()
  where id = p_request_id;
end;
$$ language plpgsql security definer;
