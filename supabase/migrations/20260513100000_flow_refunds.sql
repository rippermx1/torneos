-- ────────────────────────────────────────────────────────────────
-- Reembolsos Flow para torneos cancelados.
--
-- Cambios:
-- 1. Tabla flow_refund_attempts: tracking de cada reembolso emitido.
-- 2. cancel_tournament(): elimina wallet_insert_transaction. El
--    reembolso ahora es una reversa Flow gestionada por TypeScript.
-- 3. wallet_withdrawable_balance(): elimina refunds de torneo. Solo
--    son retirables premios ganados + refunds de solicitudes de retiro.
-- ────────────────────────────────────────────────────────────────

-- 1) TABLA FLOW_REFUND_ATTEMPTS ──────────────────────────────────

create table if not exists flow_refund_attempts (
  id                       uuid primary key default gen_random_uuid(),
  tournament_id            uuid not null references tournaments(id),
  user_id                  uuid not null references profiles(id),
  flow_payment_attempt_id  uuid references flow_payment_attempts(id),
  refund_commerce_order    text not null unique,
  flow_refund_token        text,
  flow_refund_order        text,
  amount_cents             bigint not null,
  amount_pesos             int not null,
  receiver_email           text not null,
  status                   text not null default 'pending'
    check (status in ('pending', 'completed', 'rejected', 'cancelled')),
  error_message            text,
  created_at               timestamptz not null default now(),
  settled_at               timestamptz
);

create index if not exists flow_refund_attempts_tournament_id_idx
  on flow_refund_attempts(tournament_id);

create index if not exists flow_refund_attempts_user_id_idx
  on flow_refund_attempts(user_id);

create index if not exists flow_refund_attempts_flow_refund_token_idx
  on flow_refund_attempts(flow_refund_token);

-- RLS: los usuarios solo ven sus propios reembolsos
alter table flow_refund_attempts enable row level security;

create policy "Usuario ve sus reembolsos"
  on flow_refund_attempts for select
  using (user_id = auth.uid());

-- 2) CANCEL_TOURNAMENT: eliminar wallet_insert_transaction ────────
-- El reembolso ahora es una reversa Flow gestionada desde TypeScript.
-- La función solo cancela el torneo y retorna cuántas inscripciones
-- tienen pago acreditado para que el caller inicie las reversas.

create or replace function cancel_tournament(p_tournament_id uuid)
returns jsonb as $$
declare
  v_tournament  tournaments%rowtype;
  v_paid_cnt    int;
begin
  select * into v_tournament
  from tournaments
  where id = p_tournament_id
  for update;

  if not found then
    raise exception 'Torneo no encontrado: %', p_tournament_id;
  end if;

  if v_tournament.status not in ('scheduled', 'open') then
    raise exception 'No se puede cancelar torneo en estado: %', v_tournament.status;
  end if;

  -- Contar inscriptos con pago acreditado que requieren reversa Flow
  select count(*) into v_paid_cnt
  from flow_payment_attempts
  where tournament_id = p_tournament_id
    and intent = 'tournament_registration'
    and status = 'credited';

  update tournaments set status = 'cancelled' where id = p_tournament_id;

  return jsonb_build_object(
    'refunds_to_issue', v_paid_cnt,
    'entry_fee_cents',  v_tournament.entry_fee_cents
  );
end;
$$ language plpgsql security definer;

-- 3) WALLET_WITHDRAWABLE_BALANCE: solo premios ganados ────────────
-- Eliminar 'refund' + 'tournament': los reembolsos de torneos
-- cancelados vuelven a la tarjeta original via Flow, no al saldo.
-- Nota: refunds de solicitudes de retiro fallidas siguen siendo
-- retirables (reference_type = 'withdrawal').

create or replace function wallet_withdrawable_balance(p_user_id uuid)
  returns bigint
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(sum(
    case
      when type = 'prize_credit'                              then amount_cents
      when type = 'withdrawal'                                then amount_cents
      when type = 'refund' and reference_type = 'withdrawal' then amount_cents
      else 0
    end
  ), 0)
  from wallet_transactions
  where user_id = p_user_id;
$$;

-- Permisos (consistente con migraciones anteriores)
revoke execute on function cancel_tournament(uuid) from public, anon, authenticated;
grant  execute on function cancel_tournament(uuid) to service_role;

revoke execute on function wallet_withdrawable_balance(uuid) from public, anon, authenticated;
grant  execute on function wallet_withdrawable_balance(uuid) to service_role;
