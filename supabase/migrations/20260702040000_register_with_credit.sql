-- ============================================================
-- Rakeback incremento 2 (parte 1): inscripción con crédito.
--
-- Redención "todo-o-nada": el crédito de torneo cubre una inscripción
-- COMPLETA (crédito disponible ≥ cuota). Simple y seguro — no toca el
-- esquema de flow_payment_attempts ni el settlement. La aplicación parcial
-- (crédito + Flow por el resto) queda como mejora futura.
--
-- register_with_credit es atómico: bajo advisory lock del usuario, verifica
-- crédito suficiente, crea la inscripción (register_for_tournament valida
-- ventana/cupo/cuota) y consume el crédito. Si algo falla, todo revierte.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION register_with_credit(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS uuid AS $$
DECLARE
  v_credit bigint;
  v_registration_id uuid;
BEGIN
  IF p_entry_fee_cents <= 0 THEN
    RAISE EXCEPTION 'Solo torneos pagados admiten crédito';
  END IF;

  -- Serializa con las demás mutaciones de la billetera de este usuario
  -- (re-entrante con wallet_insert_transaction, que toma el mismo lock).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);

  SELECT COALESCE(SUM(amount_cents), 0)::bigint INTO v_credit
  FROM wallet_transactions
  WHERE user_id = p_user_id AND type = 'tournament_credit';

  IF v_credit < p_entry_fee_cents THEN
    RAISE EXCEPTION 'Crédito insuficiente: disponible=%, requerido=%', v_credit, p_entry_fee_cents;
  END IF;

  -- Crea la inscripción (valida estado/ventana/cupo/cuota; aborta si falla).
  v_registration_id := register_for_tournament(p_user_id, p_tournament_id, p_entry_fee_cents);

  -- Consume el crédito por la cuota completa.
  PERFORM wallet_insert_transaction(
    p_user_id,
    'tournament_credit',
    -p_entry_fee_cents,
    'tournament',
    p_tournament_id,
    jsonb_build_object('kind', 'redeem', 'entry_cents', p_entry_fee_cents)
  );

  RETURN v_registration_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION register_with_credit(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_with_credit(uuid, uuid, bigint) TO service_role;

COMMIT;
