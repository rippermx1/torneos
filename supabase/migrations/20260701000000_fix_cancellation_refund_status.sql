-- ============================================================
-- FIX CRÍTICO: reembolsos de torneos cancelados nunca se emitían.
--
-- Causa raíz: settle_tournament_registration marca los pagos
-- acreditados como status='paid' (único valor válido del CHECK de
-- flow_payment_attempts, definido en 009). Pero cancel_tournament
-- contaba los inscritos a reembolsar con status='credited' — un
-- valor que ningún código escribe y que el CHECK ni siquiera permite.
--
-- Efecto: para todo torneo pagado que no alcanza el mínimo, la
-- función retornaba refunds_to_issue=0, el lifecycle no llamaba a
-- issueFlowRefunds, y NINGÚN inscrito recibía la reversa Flow. El
-- dinero quedaba cobrado sin torneo ni devolución.
--
-- Este es el escenario típico de los primeros torneos (cupos chicos
-- que pueden no llenarse), así que era un bloqueador de lanzamiento.
--
-- Fix: contar por status='paid' e intent='tournament_registration',
-- alineado con lo que settle_tournament_registration realmente escribe
-- y con el resto del ecosistema (accounting, anti-duplicado, checkout).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION cancel_tournament(p_tournament_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_tournament  tournaments%ROWTYPE;
  v_paid_cnt    int;
BEGIN
  SELECT * INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  IF v_tournament.status NOT IN ('scheduled', 'open') THEN
    RAISE EXCEPTION 'No se puede cancelar torneo en estado: %', v_tournament.status;
  END IF;

  -- Inscritos con pago acreditado que requieren reversa Flow.
  -- settle_tournament_registration deja estos intentos en status='paid'.
  SELECT count(*) INTO v_paid_cnt
  FROM flow_payment_attempts
  WHERE tournament_id = p_tournament_id
    AND intent = 'tournament_registration'
    AND status = 'paid';

  UPDATE tournaments SET status = 'cancelled' WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'refunds_to_issue', v_paid_cnt,
    'entry_fee_cents',  v_tournament.entry_fee_cents
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION cancel_tournament(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cancel_tournament(uuid) TO service_role;

COMMIT;
