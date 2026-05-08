-- ============================================================
-- Premios fijos publicados + hardening de auditoria de partidas
--
-- Producto:
-- - La ficha del torneo publica premios fijos antes de la inscripcion.
-- - La plataforma contabiliza una reserva de premios y un fee bruto.
-- - Al finalizar no se recalculan premios segun jugadores reales.
-- ============================================================

BEGIN;

ALTER TABLE public.tournaments
  ALTER COLUMN prize_fund_bps SET DEFAULT 7500,
  ALTER COLUMN platform_fee_bps SET DEFAULT 2500;

COMMENT ON COLUMN public.tournaments.prize_1st_cents IS
  'Premio fijo publicado para el primer lugar. No se recalcula al finalizar.';
COMMENT ON COLUMN public.tournaments.prize_2nd_cents IS
  'Premio fijo publicado para el segundo lugar. No se recalcula al finalizar.';
COMMENT ON COLUMN public.tournaments.prize_3rd_cents IS
  'Premio fijo publicado para el tercer lugar. No se recalcula al finalizar.';
COMMENT ON COLUMN public.tournaments.prize_fund_bps IS
  'Porcentaje contable de cada inscripcion reservado para cubrir premios publicados; default MVP 75%.';
COMMENT ON COLUMN public.tournaments.platform_fee_bps IS
  'Fee bruto de plataforma incluido en la inscripcion; default MVP 25%.';

CREATE INDEX IF NOT EXISTS idx_game_moves_game_server_time
  ON public.game_moves(game_id, server_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_games_tournament_completed_rank
  ON public.games(tournament_id, status, final_score DESC, highest_tile DESC, move_count ASC);

DROP INDEX IF EXISTS public.idx_wallet_unique_mp_payment;

CREATE OR REPLACE FUNCTION public.finalize_tournament(p_tournament_id uuid)
RETURNS jsonb AS $$
DECLARE
  v_tournament public.tournaments%ROWTYPE;
  v_game record;
  v_rank int := 0;
  v_prize bigint;
  v_timed_out_cnt int;
  v_results_cnt int := 0;
  v_registered_cnt int := 0;
  v_published_prize_fund_cents bigint := 0;
  v_prize_fund_collected_cents bigint := 0;
  v_platform_fee_gross_cents bigint := 0;
  v_platform_fee_iva_cents bigint := 0;
  v_platform_fee_net_cents bigint := 0;
BEGIN
  SELECT *
  INTO v_tournament
  FROM public.tournaments
  WHERE id = p_tournament_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Torneo no encontrado: %', p_tournament_id;
  END IF;

  IF v_tournament.status != 'finalizing' THEN
    RAISE EXCEPTION 'El torneo % no esta en estado finalizing (estado actual: %)',
      p_tournament_id, v_tournament.status;
  END IF;

  SELECT
    COUNT(*)::int,
    COALESCE(SUM(prize_fund_contribution_cents), 0)::bigint,
    COALESCE(SUM(platform_fee_gross_cents), 0)::bigint,
    COALESCE(SUM(platform_fee_iva_cents), 0)::bigint,
    COALESCE(SUM(platform_fee_net_cents), 0)::bigint
  INTO
    v_registered_cnt,
    v_prize_fund_collected_cents,
    v_platform_fee_gross_cents,
    v_platform_fee_iva_cents,
    v_platform_fee_net_cents
  FROM public.registrations
  WHERE tournament_id = p_tournament_id;

  v_published_prize_fund_cents :=
    v_tournament.prize_1st_cents + v_tournament.prize_2nd_cents + v_tournament.prize_3rd_cents;

  UPDATE public.games
  SET
    status = 'completed',
    end_reason = 'timeout',
    ended_at = now()
  WHERE tournament_id = p_tournament_id
    AND status = 'active';

  GET DIAGNOSTICS v_timed_out_cnt = ROW_COUNT;

  DELETE FROM public.tournament_results WHERE tournament_id = p_tournament_id;

  FOR v_game IN (
    SELECT user_id, final_score, highest_tile, move_count
    FROM public.games
    WHERE tournament_id = p_tournament_id
      AND status = 'completed'
    ORDER BY final_score DESC, highest_tile DESC, move_count ASC
  ) LOOP
    v_rank := v_rank + 1;

    v_prize := CASE v_rank
      WHEN 1 THEN v_tournament.prize_1st_cents
      WHEN 2 THEN v_tournament.prize_2nd_cents
      WHEN 3 THEN v_tournament.prize_3rd_cents
      ELSE 0
    END;

    INSERT INTO public.tournament_results
      (tournament_id, user_id, rank, final_score, prize_awarded_cents)
    VALUES
      (p_tournament_id, v_game.user_id, v_rank, v_game.final_score, v_prize);

    IF v_prize > 0 THEN
      PERFORM public.wallet_insert_transaction(
        v_game.user_id,
        'prize_credit',
        v_prize,
        'tournament',
        p_tournament_id,
        jsonb_build_object(
          'rank', v_rank,
          'final_score', v_game.final_score,
          'prize_model', v_tournament.prize_model,
          'fixed_published_prize', true,
          'published_prize_fund_cents', v_published_prize_fund_cents,
          'prize_fund_collected_cents', v_prize_fund_collected_cents,
          'registered_players', v_registered_cnt
        )
      );
    END IF;

    v_results_cnt := v_results_cnt + 1;
  END LOOP;

  UPDATE public.tournaments
  SET status = 'completed'
  WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'timed_out_games', v_timed_out_cnt,
    'ranked_players', v_results_cnt,
    'registered_players', v_registered_cnt,
    'prizes_awarded', LEAST(v_results_cnt, 3),
    'prize_model', v_tournament.prize_model,
    'fixed_published_prizes', true,
    'published_prize_fund_cents', v_published_prize_fund_cents,
    'prize_fund_collected_cents', v_prize_fund_collected_cents,
    'platform_fee_gross_cents', v_platform_fee_gross_cents,
    'platform_fee_net_cents', v_platform_fee_net_cents,
    'platform_fee_iva_cents', v_platform_fee_iva_cents
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.finalize_tournament(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tournament(uuid)
  TO service_role;

DROP VIEW IF EXISTS public.prize_liability;

CREATE VIEW public.prize_liability AS
WITH registration_finance AS (
  SELECT
    r.tournament_id,
    COALESCE(SUM(r.entry_fee_cents), 0)::bigint AS gross_collected_cents,
    COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint AS prize_fund_collected_cents,
    COALESCE(SUM(r.platform_fee_gross_cents), 0)::bigint AS platform_fee_gross_cents,
    COALESCE(SUM(r.platform_fee_net_cents), 0)::bigint AS platform_fee_net_cents,
    COALESCE(SUM(r.platform_fee_iva_cents), 0)::bigint AS platform_fee_iva_cents
  FROM public.registrations r
  GROUP BY r.tournament_id
),
base AS (
  SELECT
    t.id,
    t.status,
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)::bigint AS published_prize_cents
  FROM public.tournaments t
  WHERE t.status NOT IN ('completed', 'cancelled')
)
SELECT
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS committed_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('scheduled', 'open') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS contingent_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.gross_collected_cents ELSE 0 END), 0)::bigint AS collected_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.prize_fund_collected_cents ELSE 0 END), 0)::bigint AS prize_fund_collected_cents,
  COALESCE(SUM(rf.platform_fee_gross_cents), 0)::bigint AS platform_fee_gross_cents,
  COALESCE(SUM(rf.platform_fee_net_cents), 0)::bigint AS platform_fee_net_cents,
  COALESCE(SUM(rf.platform_fee_iva_cents), 0)::bigint AS platform_fee_iva_cents,
  COUNT(*) FILTER (WHERE b.status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open')) AS pending_count
FROM base b
LEFT JOIN registration_finance rf ON rf.tournament_id = b.id;

REVOKE ALL ON public.prize_liability FROM anon, authenticated;
GRANT SELECT ON public.prize_liability TO service_role;

COMMIT;
