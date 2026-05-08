-- ============================================================
-- Hardening de wallet:
-- - serialización por usuario para evitar saldos inconsistentes
-- ============================================================

create or replace function wallet_insert_transaction(
  p_user_id text,
  p_type text,
  p_amount_cents bigint,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_metadata jsonb default '{}'::jsonb
) returns wallet_transactions as $$
declare
  v_current_balance bigint;
  v_new_balance bigint;
  v_result wallet_transactions;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id)::bigint);

  select coalesce(
    (select balance_after_cents
     from wallet_transactions
     where user_id = p_user_id
     order by created_at desc, id desc
     limit 1),
    0
  ) into v_current_balance;

  v_new_balance := v_current_balance + p_amount_cents;

  if v_new_balance < 0 then
    raise exception 'Saldo insuficiente: saldo_actual=%, delta=%',
      v_current_balance, p_amount_cents;
  end if;

  insert into wallet_transactions (
    user_id, type, amount_cents, balance_after_cents,
    reference_type, reference_id, metadata
  ) values (
    p_user_id, p_type, p_amount_cents, v_new_balance,
    p_reference_type, p_reference_id, p_metadata
  ) returning * into v_result;

  return v_result;
end;
$$ language plpgsql security definer;
