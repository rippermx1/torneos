-- ============================================================
-- Renombrado de columnas/funciones/vistas: prize_pool_* -> prize_fund_*
--
-- Por que: el termino "pozo" tiene connotacion de juego de azar/casino.
-- La plataforma es de torneos de habilidad; legal y comercialmente
-- usamos "fondo de premios" / "premios del torneo".
--
-- Esta migracion no cambia logica ni montos: solo renombra.
-- Tambien se actualizan las claves jsonb en accounting_metadata y en
-- los metadata de wallet_transactions futuros.
-- ============================================================

BEGIN;

-- 1) RENOMBRE DE COLUMNAS ────────────────────────────────────
ALTER TABLE tournaments
  RENAME COLUMN prize_pool_bps TO prize_fund_bps;

ALTER TABLE registrations
  RENAME COLUMN prize_pool_contribution_cents TO prize_fund_contribution_cents;

-- 2) RECREAR CONSTRAINTS QUE REFERENCIAN COLUMNAS RENOMBRADAS ─
ALTER TABLE tournaments
  DROP CONSTRAINT IF EXISTS tournaments_accounting_bps_valid;

ALTER TABLE tournaments
  ADD CONSTRAINT tournaments_accounting_bps_valid
  CHECK (
    prize_fund_bps + platform_fee_bps = 10000
    AND prize_1st_bps + prize_2nd_bps + prize_3rd_bps = 10000
  );

ALTER TABLE registrations
  DROP CONSTRAINT IF EXISTS registrations_accounting_amounts_valid;

ALTER TABLE registrations
  ADD CONSTRAINT registrations_accounting_amounts_valid
  CHECK (
    (entry_fee_cents IS NULL OR entry_fee_cents >= 0)
    AND (prize_fund_contribution_cents IS NULL OR prize_fund_contribution_cents >= 0)
    AND (platform_fee_gross_cents IS NULL OR platform_fee_gross_cents >= 0)
    AND (platform_fee_net_cents IS NULL OR platform_fee_net_cents >= 0)
    AND (platform_fee_iva_cents IS NULL OR platform_fee_iva_cents >= 0)
    AND (prize_model IS NULL OR prize_model IN ('fixed', 'entry_pool'))
  );

-- 3) NORMALIZAR CLAVES jsonb EN HISTORIAL ────────────────────
-- registrations.accounting_metadata: prize_pool_* -> prize_fund_*
UPDATE registrations
SET accounting_metadata = (
  accounting_metadata
    - 'prize_pool_bps'
    - 'prize_pool_contribution_cents'
)
|| jsonb_strip_nulls(jsonb_build_object(
  'prize_fund_bps', accounting_metadata->'prize_pool_bps',
  'prize_fund_contribution_cents', accounting_metadata->'prize_pool_contribution_cents'
))
WHERE accounting_metadata ? 'prize_pool_bps'
   OR accounting_metadata ? 'prize_pool_contribution_cents';

-- wallet_transactions.metadata: prize_pool_* -> prize_fund_*
UPDATE wallet_transactions
SET metadata = (
  metadata
    - 'prize_pool_bps'
    - 'prize_pool_contribution_cents'
    - 'prize_pool_cents'
)
|| jsonb_strip_nulls(jsonb_build_object(
  'prize_fund_bps', metadata->'prize_pool_bps',
  'prize_fund_contribution_cents', metadata->'prize_pool_contribution_cents',
  'prize_fund_cents', metadata->'prize_pool_cents'
))
WHERE metadata ? 'prize_pool_bps'
   OR metadata ? 'prize_pool_contribution_cents'
   OR metadata ? 'prize_pool_cents';

-- 4) RECREAR FUNCION register_for_tournament ─────────────────
CREATE OR REPLACE FUNCTION register_for_tournament(
  p_user_id uuid,
  p_tournament_id uuid,
  p_entry_fee_cents bigint
) RETURNS void AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_registration_count bigint;
  v_prize_fund_contribution bigint;
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
    v_prize_fund_contribution :=
      ROUND((p_entry_fee_cents * v_tournament.prize_fund_bps)::numeric / 10000)::bigint;
    v_platform_fee_gross := p_entry_fee_cents - v_prize_fund_contribution;
    v_platform_fee_iva :=
      ROUND((v_platform_fee_gross * 1900)::numeric / 11900)::bigint;
    v_platform_fee_net := v_platform_fee_gross - v_platform_fee_iva;
  ELSE
    v_prize_fund_contribution := NULL;
    v_platform_fee_gross := NULL;
    v_platform_fee_iva := NULL;
    v_platform_fee_net := NULL;
  END IF;

  v_accounting_metadata := jsonb_strip_nulls(jsonb_build_object(
    'prize_model', v_tournament.prize_model,
    'entry_fee_cents', p_entry_fee_cents,
    'prize_fund_bps', v_tournament.prize_fund_bps,
    'platform_fee_bps', v_tournament.platform_fee_bps,
    'prize_fund_contribution_cents', v_prize_fund_contribution,
    'platform_fee_gross_cents', v_platform_fee_gross,
    'platform_fee_net_cents', v_platform_fee_net,
    'platform_fee_iva_cents', v_platform_fee_iva
  ));

  INSERT INTO registrations (
    tournament_id,
    user_id,
    entry_fee_cents,
    prize_fund_contribution_cents,
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
    v_prize_fund_contribution,
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

-- 5) RECREAR FUNCION finalize_tournament ─────────────────────
CREATE OR REPLACE FUNCTION finalize_tournament(p_tournament_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_tournament tournaments%ROWTYPE;
  v_game record;
  v_rank int := 0;
  v_prize bigint;
  v_timed_out_cnt int;
  v_results_cnt int := 0;
  v_registered_cnt int := 0;
  v_prize_fund_cents bigint := 0;
  v_prize_1st_cents bigint := 0;
  v_prize_2nd_cents bigint := 0;
  v_prize_3rd_cents bigint := 0;
  v_platform_fee_gross_cents bigint := 0;
  v_platform_fee_iva_cents bigint := 0;
  v_platform_fee_net_cents bigint := 0;
BEGIN
  SELECT *
  INTO v_tournament
  FROM tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  IF v_tournament.status != 'finalizing' THEN
    RAISE EXCEPTION 'El torneo % no está en estado finalizing (estado actual: %)',
      p_tournament_id, v_tournament.status;
  END IF;

  SELECT COUNT(*)
  INTO v_registered_cnt
  FROM registrations
  WHERE tournament_id = p_tournament_id;

  IF v_tournament.prize_model = 'entry_pool' AND v_tournament.entry_fee_cents > 0 THEN
    v_prize_fund_cents :=
      ROUND((v_tournament.entry_fee_cents * v_registered_cnt * v_tournament.prize_fund_bps)::numeric / 10000)::bigint;
    v_prize_1st_cents :=
      ROUND((v_prize_fund_cents * v_tournament.prize_1st_bps)::numeric / 10000)::bigint;
    v_prize_2nd_cents :=
      ROUND((v_prize_fund_cents * v_tournament.prize_2nd_bps)::numeric / 10000)::bigint;
    v_prize_3rd_cents := v_prize_fund_cents - v_prize_1st_cents - v_prize_2nd_cents;
    v_platform_fee_gross_cents :=
      (v_tournament.entry_fee_cents * v_registered_cnt) - v_prize_fund_cents;
    v_platform_fee_iva_cents :=
      ROUND((v_platform_fee_gross_cents * 1900)::numeric / 11900)::bigint;
    v_platform_fee_net_cents := v_platform_fee_gross_cents - v_platform_fee_iva_cents;
  ELSE
    v_prize_1st_cents := v_tournament.prize_1st_cents;
    v_prize_2nd_cents := v_tournament.prize_2nd_cents;
    v_prize_3rd_cents := v_tournament.prize_3rd_cents;
    v_prize_fund_cents := v_prize_1st_cents + v_prize_2nd_cents + v_prize_3rd_cents;
  END IF;

  UPDATE games
  SET
    status = 'completed',
    end_reason = 'timeout',
    ended_at = now()
  WHERE tournament_id = p_tournament_id
    AND status = 'active';

  GET DIAGNOSTICS v_timed_out_cnt = ROW_COUNT;

  DELETE FROM tournament_results WHERE tournament_id = p_tournament_id;

  FOR v_game IN (
    SELECT user_id, final_score, highest_tile, move_count
    FROM games
    WHERE tournament_id = p_tournament_id
      AND status = 'completed'
    ORDER BY final_score DESC, highest_tile DESC, move_count ASC
  ) LOOP
    v_rank := v_rank + 1;

    v_prize := CASE v_rank
      WHEN 1 THEN v_prize_1st_cents
      WHEN 2 THEN v_prize_2nd_cents
      WHEN 3 THEN v_prize_3rd_cents
      ELSE 0
    END;

    INSERT INTO tournament_results
      (tournament_id, user_id, rank, final_score, prize_awarded_cents)
    VALUES
      (p_tournament_id, v_game.user_id, v_rank, v_game.final_score, v_prize);

    IF v_prize > 0 THEN
      PERFORM wallet_insert_transaction(
        v_game.user_id,
        'prize_credit',
        v_prize,
        'tournament',
        p_tournament_id,
        jsonb_build_object(
          'rank', v_rank,
          'final_score', v_game.final_score,
          'prize_model', v_tournament.prize_model,
          'prize_fund_cents', v_prize_fund_cents,
          'registered_players', v_registered_cnt
        )
      );
    END IF;

    v_results_cnt := v_results_cnt + 1;
  END LOOP;

  UPDATE tournaments
  SET
    status = 'completed',
    prize_1st_cents = v_prize_1st_cents,
    prize_2nd_cents = v_prize_2nd_cents,
    prize_3rd_cents = v_prize_3rd_cents
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'timed_out_games', v_timed_out_cnt,
    'ranked_players', v_results_cnt,
    'registered_players', v_registered_cnt,
    'prizes_awarded', LEAST(v_results_cnt, 3),
    'prize_model', v_tournament.prize_model,
    'prize_fund_cents', v_prize_fund_cents,
    'platform_fee_gross_cents', v_platform_fee_gross_cents,
    'platform_fee_net_cents', v_platform_fee_net_cents,
    'platform_fee_iva_cents', v_platform_fee_iva_cents
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION finalize_tournament(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finalize_tournament(uuid)
  TO service_role;

-- 6) RECREAR VISTA prize_liability ───────────────────────────
DROP VIEW IF EXISTS prize_liability;

CREATE VIEW prize_liability AS
WITH reg_counts AS (
  SELECT tournament_id, COUNT(*)::bigint AS registered_count
  FROM registrations
  GROUP BY tournament_id
),
base AS (
  SELECT
    t.*,
    COALESCE(rc.registered_count, 0) AS registered_count,
    CASE
      WHEN t.prize_model = 'entry_pool' AND t.entry_fee_cents > 0 THEN
        ROUND((
          t.entry_fee_cents
          * GREATEST(COALESCE(rc.registered_count, 0), t.min_players)
          * t.prize_fund_bps
        )::numeric / 10000)::bigint
      ELSE t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
    END AS contingent_prize_cents,
    CASE
      WHEN t.prize_model = 'entry_pool' AND t.entry_fee_cents > 0 THEN
        ROUND((
          t.entry_fee_cents
          * COALESCE(rc.registered_count, 0)
          * t.prize_fund_bps
        )::numeric / 10000)::bigint
      ELSE t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents
    END AS committed_prize_cents
  FROM tournaments t
  LEFT JOIN reg_counts rc ON rc.tournament_id = t.id
  WHERE t.status NOT IN ('completed', 'cancelled')
),
registration_finance AS (
  SELECT
    r.tournament_id,
    COALESCE(SUM(r.entry_fee_cents), 0)::bigint AS gross_collected_cents,
    COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint AS prize_fund_collected_cents,
    COALESCE(SUM(r.platform_fee_gross_cents), 0)::bigint AS platform_fee_gross_cents,
    COALESCE(SUM(r.platform_fee_net_cents), 0)::bigint AS platform_fee_net_cents,
    COALESCE(SUM(r.platform_fee_iva_cents), 0)::bigint AS platform_fee_iva_cents
  FROM registrations r
  GROUP BY r.tournament_id
)
SELECT
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.committed_prize_cents ELSE 0 END), 0)::bigint AS committed_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('scheduled', 'open') THEN b.contingent_prize_cents ELSE 0 END), 0)::bigint AS contingent_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.gross_collected_cents ELSE 0 END), 0)::bigint AS collected_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.prize_fund_collected_cents ELSE 0 END), 0)::bigint AS prize_fund_collected_cents,
  COALESCE(SUM(rf.platform_fee_gross_cents), 0)::bigint AS platform_fee_gross_cents,
  COALESCE(SUM(rf.platform_fee_net_cents), 0)::bigint AS platform_fee_net_cents,
  COALESCE(SUM(rf.platform_fee_iva_cents), 0)::bigint AS platform_fee_iva_cents,
  COUNT(*) FILTER (WHERE b.status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open')) AS pending_count
FROM base b
LEFT JOIN registration_finance rf ON rf.tournament_id = b.id;

REVOKE ALL ON prize_liability FROM anon, authenticated;
GRANT SELECT ON prize_liability TO service_role;

-- 7) RECREAR VISTA monthly_platform_finance ──────────────────
DROP VIEW IF EXISTS monthly_platform_finance;

CREATE VIEW monthly_platform_finance AS
SELECT
  to_char(
    date_trunc('month', (r.registered_at AT TIME ZONE 'America/Santiago')),
    'YYYY-MM'
  ) AS period,
  COUNT(*)::bigint                                                AS registrations_count,
  COUNT(DISTINCT r.user_id)::bigint                               AS unique_users,
  COUNT(DISTINCT r.tournament_id)::bigint                         AS tournaments_with_revenue,
  COALESCE(SUM(r.entry_fee_cents), 0)::bigint                     AS gross_revenue_cents,
  COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint       AS prize_fund_cents,
  COALESCE(SUM(r.platform_fee_gross_cents), 0)::bigint            AS platform_fee_gross_cents,
  COALESCE(SUM(r.platform_fee_net_cents), 0)::bigint              AS platform_fee_net_cents,
  COALESCE(SUM(r.platform_fee_iva_cents), 0)::bigint              AS platform_fee_iva_cents
FROM registrations r
WHERE r.prize_model = 'entry_pool'
  AND r.entry_fee_cents IS NOT NULL
  AND r.entry_fee_cents > 0
GROUP BY 1;

REVOKE ALL ON monthly_platform_finance FROM anon, authenticated;
GRANT SELECT ON monthly_platform_finance TO service_role;

COMMIT;
