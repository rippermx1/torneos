-- ============================================================
-- Rakeback: créditos de torneo (base — otorgamiento).
--
-- Devuelve un % de cada inscripción como crédito NO retirable, usable solo en
-- futuras inscripciones (sube frecuencia y LTV). Este incremento agrega el tipo
-- de transacción y el saldo de crédito; el CONSUMO en checkout, la contabilidad
-- y la expiración FIFO a 30 días vienen en el siguiente incremento.
-- Ver docs/roadmap-retencion-rentabilidad.md.
--
-- Aditivo: nuevo tipo tournament_credit (grant = +, consumo/expiración = −).
-- NO retirable: wallet_withdrawable_balance solo cuenta prize_credit/withdrawal/
-- refund-de-withdrawal, así que tournament_credit queda fuera automáticamente.
-- ============================================================

BEGIN;

-- Reemplaza el CHECK de tipo para admitir tournament_credit (busca el constraint
-- por su definición, sin depender del nombre autogenerado).
DO $$
DECLARE v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.wallet_transactions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%prize_credit%';
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.wallet_transactions DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE public.wallet_transactions
  ADD CONSTRAINT wallet_transactions_type_check
  CHECK (type IN (
    'deposit', 'withdrawal', 'ticket_debit', 'prize_credit', 'refund', 'adjustment', 'tournament_credit'
  ));

-- Saldo de crédito de torneo (suma simple: grants − consumos − expiraciones).
-- El consumo y la expiración se implementan en el próximo incremento; por ahora
-- solo hay grants, así que este saldo = total otorgado.
CREATE OR REPLACE FUNCTION public.wallet_credit_balance(p_user_id uuid)
  RETURNS bigint
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public
AS $$
  SELECT COALESCE(SUM(amount_cents), 0)::bigint
  FROM public.wallet_transactions
  WHERE user_id = p_user_id AND type = 'tournament_credit';
$$;

REVOKE EXECUTE ON FUNCTION public.wallet_credit_balance(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wallet_credit_balance(uuid) TO service_role;

COMMIT;
