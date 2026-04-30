-- ============================================================
-- Integración con Flow.cl como pasarela primaria de pagos.
--
-- Diseño:
-- - flow_payment_attempts: bitácora de cada intento de pago iniciado
--   en Flow. Permite reconciliar webhooks perdidos y auditar.
-- - Idempotencia fuerte por flow_token en wallet_transactions.
-- - Saldo retirable: solo lo ganado en torneos (prize_credit + refund
--   de inscripciones) menos lo retirado. Los depósitos NO son retirables
--   directamente; deben pasar por un torneo. Esto evita que un usuario
--   deposite y retire dejándonos absorbiendo la comisión de Flow.
-- - Caps de retiro diarios y mensuales para anti-fraude.
-- ============================================================

-- ── FLOW_PAYMENT_ATTEMPTS ───────────────────────────────────
create table flow_payment_attempts (
  id                 uuid default gen_random_uuid() primary key,
  user_id            uuid references profiles(id) not null,
  commerce_order     text not null unique,
  flow_token         text unique,
  flow_order         bigint,
  -- Monto que el usuario ve acreditado en su billetera (sin fee)
  net_amount_cents   bigint not null check (net_amount_cents > 0),
  -- Monto realmente cobrado por Flow (incluye fee al usuario)
  charged_amount_cents bigint not null check (charged_amount_cents > 0),
  -- Fee cobrado al usuario, calculado como charged - net
  user_fee_cents     bigint not null check (user_fee_cents >= 0),
  status             text not null default 'pending'
                     check (status in ('pending','paid','rejected','cancelled','expired')),
  flow_status_code   smallint, -- 1=pendiente, 2=pagado, 3=rechazado, 4=anulado
  payment_method     text,
  payer_email        text,
  raw_response       jsonb,
  created_at         timestamptz not null default now(),
  settled_at         timestamptz,

  constraint fee_consistent check (charged_amount_cents = net_amount_cents + user_fee_cents)
);

alter table flow_payment_attempts enable row level security;

create index idx_flow_attempts_user_created on flow_payment_attempts(user_id, created_at desc);
create index idx_flow_attempts_status on flow_payment_attempts(status, created_at);

create policy "Usuario ve sus intentos de pago"
  on flow_payment_attempts for select
  using (auth.uid() = user_id);

create policy "Admin ve todos los intentos de pago"
  on flow_payment_attempts for select
  using (
    exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_admin = true
    )
  );

-- ── IDEMPOTENCIA FLOW ───────────────────────────────────────
create unique index if not exists idx_wallet_unique_flow_token
  on wallet_transactions ((metadata->>'flow_token'))
  where metadata ? 'flow_token';

-- ── SALDO RETIRABLE ─────────────────────────────────────────
-- Política anti-fraude: solo el dinero ganado en torneos es retirable.
-- Los depósitos solo pueden gastarse en inscripciones; si no se juega,
-- el dinero queda en la billetera pero no se puede sacar como cash.
--
-- Esto cierra dos vectores:
--  1. Lavado: depositar y retirar dejándonos con el costo de Flow.
--  2. Reembolso de torneo cancelado: no es retirable porque la inscripción
--     pudo haberse pagado con dinero depositado (no podemos saber el origen
--     sin un ledger de "buckets" más complejo).
--
-- Definición:
--   retirable = sum(prize_credit) + sum(withdrawal) + sum(refund de withdrawal)
--
-- Donde withdrawal tiene amount_cents negativo y resta naturalmente.
create or replace function wallet_withdrawable_balance(p_user_id uuid)
  returns bigint
  language sql
  stable
  security definer
as $$
  select coalesce(sum(
    case
      when type = 'prize_credit' then amount_cents
      when type = 'withdrawal' then amount_cents
      when type = 'refund' and reference_type = 'withdrawal' then amount_cents
      else 0
    end
  ), 0)::bigint
  from wallet_transactions
  where user_id = p_user_id;
$$;

-- ── CONSULTAS DE CAP DE RETIROS ─────────────────────────────
-- Total retirado en una ventana móvil (negativos sumados como positivos).
create or replace function wallet_withdrawn_in_window(
  p_user_id uuid,
  p_window interval
) returns bigint
  language sql
  stable
  security definer
as $$
  select coalesce(sum(amount_cents), 0)::bigint * -1
  from wallet_transactions
  where user_id = p_user_id
    and type = 'withdrawal'
    and created_at >= now() - p_window;
$$;

-- ── ACREDITACIÓN ATÓMICA DE PAGO FLOW ───────────────────────
-- Llamado desde el webhook tras validar status=paid contra Flow.
-- Atómicamente:
--  1. Marca el attempt como 'paid'
--  2. Inserta la wallet_transaction con tipo deposit
-- Idempotente: si el attempt ya está paid, no hace nada.
create or replace function wallet_credit_flow_payment(
  p_commerce_order text,
  p_flow_token text,
  p_flow_order bigint,
  p_amount_cents bigint,
  p_payment_method text,
  p_payer_email text,
  p_raw jsonb
) returns wallet_transactions
  language plpgsql
  security definer
as $$
declare
  v_attempt flow_payment_attempts%rowtype;
  v_existing_tx wallet_transactions;
  v_result wallet_transactions;
begin
  select * into v_attempt
  from flow_payment_attempts
  where commerce_order = p_commerce_order
  for update;

  if not found then
    raise exception 'Attempt no encontrado: %', p_commerce_order;
  end if;

  -- Si el monto cobrado no coincide, rechazar
  if v_attempt.charged_amount_cents <> p_amount_cents then
    raise exception 'Monto inconsistente: esperado=%, recibido=%',
      v_attempt.charged_amount_cents, p_amount_cents;
  end if;

  -- Si ya estaba pagado, devolver la transacción existente (idempotencia)
  if v_attempt.status = 'paid' then
    select * into v_existing_tx
    from wallet_transactions
    where metadata->>'flow_token' = p_flow_token
    limit 1;
    return v_existing_tx;
  end if;

  -- Solo aceptamos pasar de pending a paid
  if v_attempt.status <> 'pending' then
    raise exception 'Attempt en estado no acreditable: %', v_attempt.status;
  end if;

  -- Acreditar al usuario el net (sin el fee que él mismo pagó)
  v_result := wallet_insert_transaction(
    v_attempt.user_id,
    'deposit',
    v_attempt.net_amount_cents,
    'flow_payment',
    v_attempt.id,
    jsonb_build_object(
      'flow_token', p_flow_token,
      'flow_order', p_flow_order,
      'commerce_order', p_commerce_order,
      'payment_method', p_payment_method,
      'payer_email', p_payer_email,
      'charged_cents', v_attempt.charged_amount_cents,
      'user_fee_cents', v_attempt.user_fee_cents,
      'source', 'flow'
    )
  );

  update flow_payment_attempts
  set
    status           = 'paid',
    flow_token       = coalesce(flow_token, p_flow_token),
    flow_order       = coalesce(flow_order, p_flow_order),
    flow_status_code = 2,
    payment_method   = p_payment_method,
    payer_email      = p_payer_email,
    raw_response     = p_raw,
    settled_at       = now()
  where id = v_attempt.id;

  return v_result;
end;
$$;

-- ── MARCADO DE ATTEMPT FALLIDO ──────────────────────────────
create or replace function wallet_mark_flow_attempt_failed(
  p_commerce_order text,
  p_flow_token text,
  p_flow_status_code smallint,
  p_raw jsonb
) returns void
  language plpgsql
  security definer
as $$
begin
  update flow_payment_attempts
  set
    status = case p_flow_status_code
               when 3 then 'rejected'
               when 4 then 'cancelled'
               else 'expired'
             end,
    flow_token = coalesce(flow_token, p_flow_token),
    flow_status_code = p_flow_status_code,
    raw_response = p_raw,
    settled_at = now()
  where commerce_order = p_commerce_order
    and status = 'pending';
end;
$$;
