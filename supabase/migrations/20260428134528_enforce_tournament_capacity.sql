-- ============================================================
-- Enforce tournament capacity atomically inside registration RPC
-- ============================================================

DROP FUNCTION IF EXISTS wallet_insert_transaction(text, text, bigint, text, uuid, jsonb);
DROP FUNCTION IF EXISTS register_for_tournament(text, uuid, bigint);

CREATE OR REPLACE FUNCTION register_for_tournament(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS void AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_registration_count bigint;
BEGIN
  SELECT *
  INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  SELECT COUNT(*)
  INTO v_registration_count
  FROM registrations
  WHERE tournament_id = p_tournament_id;

  IF v_registration_count >= v_tournament.max_players THEN
    RAISE EXCEPTION 'Torneo lleno';
  END IF;

  INSERT INTO registrations (tournament_id, user_id)
  VALUES (p_tournament_id, p_user_id);

  IF p_entry_fee_cents > 0 THEN
    PERFORM wallet_insert_transaction(
      p_user_id,
      'ticket_debit',
      -p_entry_fee_cents,
      'tournament_registration',
      p_tournament_id,
      jsonb_build_object('tournament_id', p_tournament_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
