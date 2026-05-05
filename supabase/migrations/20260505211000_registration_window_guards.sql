-- Defense-in-depth guards for tournament creation and registration.

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS registration_strictly_before_play;

ALTER TABLE tournaments
  ADD CONSTRAINT registration_strictly_before_play
  CHECK (registration_opens_at < play_window_start) NOT VALID;

ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS max_game_duration_within_play_window;

ALTER TABLE tournaments
  ADD CONSTRAINT max_game_duration_within_play_window
  CHECK (
    max_game_duration_seconds > 0
    AND play_window_end >= play_window_start + make_interval(secs => max_game_duration_seconds)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION register_for_tournament(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS void AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_registration_count bigint;
  v_prize_pool_contribution bigint;
  v_platform_fee_gross bigint;
  v_platform_fee_iva bigint;
  v_platform_fee_net bigint;
  v_accounting_metadata jsonb;
BEGIN
  SELECT *
  INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  IF v_tournament.status NOT IN ('scheduled', 'open') THEN
    RAISE EXCEPTION 'Inscripciones cerradas';
  END IF;

  IF now() < v_tournament.registration_opens_at OR now() >= v_tournament.play_window_start THEN
    RAISE EXCEPTION 'Inscripciones cerradas';
  END IF;

  IF p_entry_fee_cents <> v_tournament.entry_fee_cents THEN
    RAISE EXCEPTION 'Cuota inconsistente: esperado=%, recibido=%',
      v_tournament.entry_fee_cents, p_entry_fee_cents;
  END IF;

  SELECT COUNT(*)
  INTO v_registration_count
  FROM registrations
  WHERE tournament_id = p_tournament_id;

  IF v_registration_count >= v_tournament.max_players THEN
    RAISE EXCEPTION 'Torneo lleno';
  END IF;

  IF v_tournament.prize_model = 'entry_pool' AND p_entry_fee_cents > 0 THEN
    v_prize_pool_contribution :=
      ROUND((p_entry_fee_cents * v_tournament.prize_pool_bps)::numeric / 10000)::bigint;
    v_platform_fee_gross := p_entry_fee_cents - v_prize_pool_contribution;
    v_platform_fee_iva :=
      ROUND((v_platform_fee_gross * 1900)::numeric / 11900)::bigint;
    v_platform_fee_net := v_platform_fee_gross - v_platform_fee_iva;
  ELSE
    v_prize_pool_contribution := NULL;
    v_platform_fee_gross := NULL;
    v_platform_fee_iva := NULL;
    v_platform_fee_net := NULL;
  END IF;

  v_accounting_metadata := jsonb_strip_nulls(jsonb_build_object(
    'prize_model', v_tournament.prize_model,
    'entry_fee_cents', p_entry_fee_cents,
    'prize_pool_bps', v_tournament.prize_pool_bps,
    'platform_fee_bps', v_tournament.platform_fee_bps,
    'prize_pool_contribution_cents', v_prize_pool_contribution,
    'platform_fee_gross_cents', v_platform_fee_gross,
    'platform_fee_net_cents', v_platform_fee_net,
    'platform_fee_iva_cents', v_platform_fee_iva
  ));

  INSERT INTO registrations (
    tournament_id,
    user_id,
    entry_fee_cents,
    prize_pool_contribution_cents,
    platform_fee_gross_cents,
    platform_fee_net_cents,
    platform_fee_iva_cents,
    prize_model,
    accounting_metadata
  )
  VALUES (
    p_tournament_id,
    p_user_id,
    p_entry_fee_cents,
    v_prize_pool_contribution,
    v_platform_fee_gross,
    v_platform_fee_net,
    v_platform_fee_iva,
    v_tournament.prize_model,
    v_accounting_metadata
  );

  IF p_entry_fee_cents > 0 THEN
    PERFORM wallet_insert_transaction(
      p_user_id,
      'ticket_debit',
      -p_entry_fee_cents,
      'tournament_registration',
      p_tournament_id,
      v_accounting_metadata || jsonb_build_object('tournament_id', p_tournament_id)
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION register_for_tournament(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION register_for_tournament(uuid, uuid, bigint)
  TO service_role;
