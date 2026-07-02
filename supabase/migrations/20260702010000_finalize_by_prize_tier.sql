-- ============================================================
-- finalize_tournament paga por el TRAMO aplicable de la escalera.
--
-- Selecciona de tournament_prize_tiers el mayor umbral <= inscritos
-- (registered_count) y paga 70/20/10 de ESA bolsa. Si el torneo no tiene
-- tramos (caso defensivo), cae a las columnas prize_*_cents (tramo base),
-- preservando exactamente el comportamiento previo.
--
-- Solvencia: el tramo se paga solo si inscritos >= su umbral, y
-- fondo = 70% × entry × umbral <= entry × inscritos = recaudado. Siempre
-- cubierto. Todo lo demás (guard de estado 'finalizing', idempotencia,
-- timeout de partidas activas, ranking, premios no adjudicados) se conserva.
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
  -- Tramo aplicable de la escalera.
  v_tier_threshold int;
  v_p1 bigint;
  v_p2 bigint;
  v_p3 bigint;
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

  -- Tramo aplicable: mayor umbral <= inscritos. Fallback a columnas base.
  SELECT min_players_threshold, prize_1st_cents, prize_2nd_cents, prize_3rd_cents
  INTO v_tier_threshold, v_p1, v_p2, v_p3
  FROM public.tournament_prize_tiers
  WHERE tournament_id = p_tournament_id
    AND min_players_threshold <= v_registered_cnt
  ORDER BY min_players_threshold DESC
  LIMIT 1;

  IF NOT FOUND THEN
    v_tier_threshold := NULL;
    v_p1 := v_tournament.prize_1st_cents;
    v_p2 := v_tournament.prize_2nd_cents;
    v_p3 := v_tournament.prize_3rd_cents;
  END IF;

  v_published_prize_fund_cents := v_p1 + v_p2 + v_p3;

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
      WHEN 1 THEN v_p1
      WHEN 2 THEN v_p2
      WHEN 3 THEN v_p3
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
          'applied_tier_threshold', v_tier_threshold,
          'registered_players', v_registered_cnt,
          'published_prize_fund_cents', v_published_prize_fund_cents,
          'prize_fund_collected_cents', v_prize_fund_collected_cents
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
    'applied_tier_threshold', v_tier_threshold,
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

COMMIT;
