-- ============================================================
-- C5 hardening: documentar premios publicados que NO se otorgan
-- (cuando <3 jugadores terminan la partida).
--
-- Antes: finalize_tournament solo retornaba "prizes_awarded" como
-- LEAST(v_results_cnt, 3). El delta entre fondo publicado y monto
-- realmente acreditado quedaba sumido en la diferencia, sin trazabilidad
-- contable explicita.
--
-- Ahora:
--  - awarded_prize_cents: suma de premios efectivamente acreditados
--    en wallet_transactions (1ro+2do+3ro segun cuantos terminaron).
--  - unclaimed_prize_cents: published_prize_fund - awarded_prize_cents.
--    Este monto queda como ingreso adicional de la plataforma respecto
--    al fee normal y debe reportarse en la conciliacion.
--  - Cada prize_credit pasa esos campos en su metadata para que la
--    contabilidad pueda reconstruir el evento por inscripcion.
--  - prize_liability suma unclaimed_prize_cents historico para
--    monitoreo operativo.
-- ============================================================

BEGIN;

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
  v_awarded_prize_cents bigint := 0;
  v_unclaimed_prize_cents bigint := 0;
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
    ORDER BY final_score DESC, highest_tile DESC, move_count ASC, user_id ASC
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
      v_awarded_prize_cents := v_awarded_prize_cents + v_prize;

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

  v_unclaimed_prize_cents := v_published_prize_fund_cents - v_awarded_prize_cents;

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
    'awarded_prize_cents', v_awarded_prize_cents,
    'unclaimed_prize_cents', v_unclaimed_prize_cents,
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

-- prize_liability ahora expone tambien la suma historica de
-- premios publicados que la plataforma no entrego (por torneos
-- ya completados). Sirve a contabilidad para conciliacion.
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
),
unclaimed_history AS (
  -- Sumamos premios publicados menos premios efectivamente otorgados
  -- a partir de tournament_results de torneos ya completados.
  SELECT COALESCE(SUM(
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)
    - COALESCE((
        SELECT SUM(tr.prize_awarded_cents)
        FROM public.tournament_results tr
        WHERE tr.tournament_id = t.id
      ), 0)
  ), 0)::bigint AS unclaimed_prize_cents
  FROM public.tournaments t
  WHERE t.status = 'completed'
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
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open')) AS pending_count,
  (SELECT unclaimed_prize_cents FROM unclaimed_history) AS unclaimed_prize_cents_total
FROM base b
LEFT JOIN registration_finance rf ON rf.tournament_id = b.id;

REVOKE ALL ON public.prize_liability FROM anon, authenticated;
GRANT SELECT ON public.prize_liability TO service_role;

COMMIT;
