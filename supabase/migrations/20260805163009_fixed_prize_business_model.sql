-- ============================================================================
-- MODELO DE NEGOCIO V2: PREMIO FIJO, SIN ESCALAS
--
-- Nuevos torneos pagados:
--   * una venta directa por la inscripcion completa, IVA incluido;
--   * premio inmutable calculado al publicar (maximo 55% del bruto minimo);
--   * max_players <= 1,25 x min_players;
--   * dos posiciones premiadas (75/25) y ticket minimo de $2.000 CLP;
--   * margen de contribucion minimo objetivo de 25% antes de costos fijos.
--
-- Los tramos historicos se archivan en private para conservar evidencia, pero
-- dejan de formar parte del esquema publico y de toda liquidacion futura.
-- ============================================================================

BEGIN;

LOCK TABLE public.tournaments IN SHARE ROW EXCLUSIVE MODE;

-- Los proyectos Supabase nuevos ya no heredan necesariamente permisos CRUD
-- para service_role sobre tablas creadas por migraciones. La aplicacion usa
-- esa credencial exclusivamente en el servidor; RLS sigue habilitado y estos
-- grants no se extienden al ledger ni a las reglas de negocio inmutables.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.admin_actions,
  public.disputes,
  public.flow_payment_attempts,
  public.flow_refund_attempts,
  public.game_moves,
  public.games,
  public.kyc_audit_events,
  public.kyc_submissions,
  public.profiles,
  public.registrations,
  public.tournament_results,
  public.tournaments,
  public.wallet_transactions,
  public.withdrawal_requests
TO service_role;

-- Permisos de tabla que habilitan las politicas RLS ya existentes. Sin el
-- grant, PostgreSQL rechaza la consulta antes de evaluar la politica.
GRANT SELECT ON TABLE
  public.player_ratings,
  public.tournament_results,
  public.tournaments
TO anon, authenticated;

GRANT SELECT ON TABLE
  public.admin_actions,
  public.disputes,
  public.flow_payment_attempts,
  public.flow_refund_attempts,
  public.game_moves,
  public.games,
  public.kyc_audit_events,
  public.kyc_submissions,
  public.profiles,
  public.registrations,
  public.wallet_transactions,
  public.withdrawal_requests
TO authenticated;

GRANT INSERT ON TABLE public.disputes, public.registrations TO authenticated;
GRANT INSERT, UPDATE ON TABLE public.tournaments TO authenticated;

-- No se puede retirar una promesa progresiva de un torneo que aun este abierto.
DO $$
DECLARE
  v_active_ladders integer;
BEGIN
  SELECT COUNT(*)::integer
  INTO v_active_ladders
  FROM (
    SELECT t.id
    FROM public.tournaments t
    JOIN public.tournament_prize_tiers tp ON tp.tournament_id = t.id
    WHERE t.status NOT IN ('completed', 'cancelled')
    GROUP BY t.id
    HAVING COUNT(*) > 1
  ) active;

  IF v_active_ladders > 0 THEN
    RAISE EXCEPTION
      'Hay % torneo(s) vigente(s) con premios progresivos. Finalizarlos o cancelarlos antes de aplicar el modelo fijo.',
      v_active_ladders;
  END IF;
END;
$$;

-- Versionar las reglas sin reescribir la politica aplicada a torneos historicos.
ALTER TABLE public.platform_business_rules
  ADD COLUMN IF NOT EXISTS min_paid_entry_fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_capacity_ratio_bps integer NOT NULL DEFAULT 100000,
  ADD COLUMN IF NOT EXISTS min_contribution_margin_bps integer NOT NULL DEFAULT 1500;

ALTER TABLE public.platform_business_rules
  DROP CONSTRAINT IF EXISTS platform_business_rules_min_paid_entry_check,
  DROP CONSTRAINT IF EXISTS platform_business_rules_capacity_ratio_check,
  DROP CONSTRAINT IF EXISTS platform_business_rules_margin_check;

ALTER TABLE public.platform_business_rules
  ADD CONSTRAINT platform_business_rules_min_paid_entry_check
    CHECK (min_paid_entry_fee_cents >= 0),
  ADD CONSTRAINT platform_business_rules_capacity_ratio_check
    CHECK (max_capacity_ratio_bps >= 10000),
  ADD CONSTRAINT platform_business_rules_margin_check
    CHECK (min_contribution_margin_bps BETWEEN 0 AND 10000);

INSERT INTO public.platform_business_rules (
  version,
  effective_from,
  vat_bps,
  prize_budget_bps,
  min_paid_entry_fee_cents,
  max_capacity_ratio_bps,
  min_contribution_margin_bps,
  max_total_prize_cents,
  max_first_prize_cents,
  rewards_enabled,
  flow_fee_net_bps,
  flow_refund_fee_net_cents,
  notes
) VALUES (
  2,
  '2026-08-05T00:00:00-04:00',
  1900,
  5500,
  200000, -- $2.000 CLP
  12500,  -- 1,25 x el minimo
  2500,
  7000000,
  4900000,
  false,
  319,
  20200,
  'Piloto fijo: una venta afecta a IVA, premio inmutable, dos ganadores y sin escalas.'
)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS business_rule_version integer
    REFERENCES public.platform_business_rules(version) DEFAULT 1;

UPDATE public.tournaments
SET business_rule_version = 1
WHERE business_rule_version IS NULL;

ALTER TABLE public.tournaments
  ALTER COLUMN business_rule_version SET NOT NULL,
  ALTER COLUMN business_rule_version SET DEFAULT 2;

-- El nombre tecnico ahora refleja la sustancia: los premios son montos fijos.
ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_prize_model_check;
ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_accounting_amounts_valid;

UPDATE public.tournaments SET prize_model = 'fixed';
UPDATE public.registrations SET prize_model = 'fixed' WHERE prize_model IS NOT NULL;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_prize_model_check CHECK (prize_model = 'fixed'),
  ALTER COLUMN prize_model SET DEFAULT 'fixed',
  ALTER COLUMN prize_fund_bps SET DEFAULT 5500,
  ALTER COLUMN platform_fee_bps SET DEFAULT 4500,
  ALTER COLUMN prize_1st_bps SET DEFAULT 7500,
  ALTER COLUMN prize_2nd_bps SET DEFAULT 2500,
  ALTER COLUMN prize_3rd_bps SET DEFAULT 0;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_accounting_amounts_valid CHECK (
    (entry_fee_cents IS NULL OR entry_fee_cents >= 0)
    AND (prize_fund_contribution_cents IS NULL OR prize_fund_contribution_cents >= 0)
    AND (platform_fee_gross_cents IS NULL OR platform_fee_gross_cents >= 0)
    AND (platform_fee_net_cents IS NULL OR platform_fee_net_cents >= 0)
    AND (platform_fee_iva_cents IS NULL OR platform_fee_iva_cents >= 0)
    AND (prize_model IS NULL OR prize_model = 'fixed')
  );

-- Reglas duras para todo torneo nuevo de politica v2. Los historicos quedan
-- identificados con version 1 y conservan exactamente sus condiciones.
ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_v2_minimum_paid_entry CHECK (
    business_rule_version < 2
    OR is_test
    OR entry_fee_cents = 0
    OR entry_fee_cents >= 200000
  ),
  ADD CONSTRAINT tournaments_v2_capacity_ratio CHECK (
    business_rule_version < 2
    OR is_test
    OR entry_fee_cents = 0
    OR max_players * 10000 <= min_players * 12500
  ),
  ADD CONSTRAINT tournaments_v2_fixed_prize_budget CHECK (
    business_rule_version < 2
    OR is_test
    OR entry_fee_cents = 0
    OR (
      (prize_1st_cents + prize_2nd_cents + prize_3rd_cents) * 10000
        <= entry_fee_cents * min_players * 5500
      AND prize_3rd_cents = 0
    )
  );

COMMENT ON COLUMN public.tournaments.business_rule_version IS
  'Version inmutable de platform_business_rules usada al publicar el torneo.';

-- Liquidacion: usa exclusivamente los premios fijos persistidos en tournaments.
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
  v_published_prize_cents bigint := 0;
  v_prize_fund_collected_cents bigint := 0;
  v_platform_fee_gross_cents bigint := 0;
  v_platform_fee_iva_cents bigint := 0;
  v_platform_fee_net_cents bigint := 0;
  v_awarded_prize_cents bigint := 0;
  v_prizes_awarded_cnt int := 0;
  v_unclaimed_prize_cents bigint := 0;
BEGIN
  SELECT * INTO v_tournament
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

  v_published_prize_cents :=
    v_tournament.prize_1st_cents
    + v_tournament.prize_2nd_cents
    + v_tournament.prize_3rd_cents;

  UPDATE public.games
  SET status = 'completed', end_reason = 'timeout', ended_at = now()
  WHERE tournament_id = p_tournament_id AND status = 'active';
  GET DIAGNOSTICS v_timed_out_cnt = ROW_COUNT;

  DELETE FROM public.tournament_results WHERE tournament_id = p_tournament_id;

  FOR v_game IN (
    SELECT user_id, final_score, highest_tile, move_count
    FROM public.games
    WHERE tournament_id = p_tournament_id AND status = 'completed'
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
      v_prizes_awarded_cnt := v_prizes_awarded_cnt + 1;
      PERFORM public.wallet_insert_transaction(
        v_game.user_id,
        'prize_credit',
        v_prize,
        'tournament',
        p_tournament_id,
        jsonb_build_object(
          'rank', v_rank,
          'final_score', v_game.final_score,
          'prize_model', 'fixed',
          'fixed_published_prize', true,
          'business_rule_version', v_tournament.business_rule_version,
          'registered_players', v_registered_cnt,
          'published_prize_fund_cents', v_published_prize_cents,
          'prize_fund_collected_cents', v_prize_fund_collected_cents
        )
      );
    END IF;

    v_results_cnt := v_results_cnt + 1;
  END LOOP;

  v_unclaimed_prize_cents := v_published_prize_cents - v_awarded_prize_cents;

  UPDATE public.tournaments SET status = 'completed' WHERE id = p_tournament_id;

  RETURN jsonb_build_object(
    'timed_out_games', v_timed_out_cnt,
    'ranked_players', v_results_cnt,
    'registered_players', v_registered_cnt,
    'prizes_awarded', v_prizes_awarded_cnt,
    'prize_model', 'fixed',
    'fixed_published_prizes', true,
    'business_rule_version', v_tournament.business_rule_version,
    'published_prize_fund_cents', v_published_prize_cents,
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
GRANT EXECUTE ON FUNCTION public.finalize_tournament(uuid) TO service_role;

-- Pasivo y contribucion estimada usan el premio fijo, nunca un tramo.
DROP VIEW IF EXISTS public.prize_liability;

CREATE VIEW public.prize_liability WITH (security_invoker = true) AS
WITH registration_finance AS (
  SELECT
    r.tournament_id,
    COUNT(*)::int AS registered_count,
    COALESCE(SUM(r.entry_fee_cents), 0)::bigint AS gross_collected_cents,
    COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint AS prize_fund_collected_cents,
    COALESCE(SUM(r.entry_fee_cents - ROUND((r.entry_fee_cents * 1900)::numeric / 11900)), 0)::bigint AS sale_net_cents,
    COALESCE(SUM(ROUND((r.entry_fee_cents * 1900)::numeric / 11900)), 0)::bigint AS vat_debit_cents,
    COALESCE(SUM(ROUND((r.entry_fee_cents * 319)::numeric / 10000)), 0)::bigint AS flow_fee_net_cents
  FROM public.registrations r
  GROUP BY r.tournament_id
),
base AS (
  SELECT
    t.id,
    t.status,
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)::bigint AS published_prize_cents,
    COALESCE(rf.gross_collected_cents, 0)::bigint AS gross_collected_cents,
    COALESCE(rf.prize_fund_collected_cents, 0)::bigint AS prize_fund_collected_cents,
    COALESCE(rf.sale_net_cents, 0)::bigint AS sale_net_cents,
    COALESCE(rf.vat_debit_cents, 0)::bigint AS vat_debit_cents,
    COALESCE(rf.flow_fee_net_cents, 0)::bigint AS flow_fee_net_cents
  FROM public.tournaments t
  LEFT JOIN registration_finance rf ON rf.tournament_id = t.id
  WHERE t.status NOT IN ('completed', 'cancelled') AND NOT t.is_test
),
unclaimed_history AS (
  SELECT COALESCE(SUM(
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)
    - COALESCE((
      SELECT SUM(tr.prize_awarded_cents)
      FROM public.tournament_results tr
      WHERE tr.tournament_id = t.id
    ), 0)
  ), 0)::bigint AS unclaimed_prize_cents
  FROM public.tournaments t
  WHERE t.status = 'completed' AND NOT t.is_test
)
SELECT
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS committed_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('scheduled', 'open') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS contingent_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.gross_collected_cents ELSE 0 END), 0)::bigint AS collected_cents,
  COALESCE(SUM(b.prize_fund_collected_cents), 0)::bigint AS prize_fund_collected_cents,
  COALESCE(SUM(b.gross_collected_cents - b.published_prize_cents), 0)::bigint AS platform_fee_gross_cents,
  COALESCE(SUM(b.sale_net_cents - b.flow_fee_net_cents - b.published_prize_cents), 0)::bigint AS platform_fee_net_cents,
  COALESCE(SUM(b.vat_debit_cents), 0)::bigint AS platform_fee_iva_cents,
  COALESCE(SUM(b.sale_net_cents), 0)::bigint AS sale_net_cents,
  COALESCE(SUM(b.flow_fee_net_cents), 0)::bigint AS flow_fee_net_cents,
  COALESCE(SUM(b.sale_net_cents - b.flow_fee_net_cents - b.published_prize_cents), 0)::bigint AS contribution_cents,
  COUNT(*) FILTER (WHERE b.status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open')) AS pending_count,
  (SELECT unclaimed_prize_cents FROM unclaimed_history) AS unclaimed_prize_cents_total
FROM base b;

REVOKE ALL ON public.prize_liability FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prize_liability TO service_role;

-- Retirar la escalera del esquema operativo conservando evidencia historica.
DROP TRIGGER IF EXISTS trg_prize_tier_solvency ON public.tournament_prize_tiers;
REVOKE ALL ON public.tournament_prize_tiers FROM PUBLIC, anon, authenticated, service_role;
ALTER TABLE public.tournament_prize_tiers SET SCHEMA private;
ALTER TABLE private.tournament_prize_tiers RENAME TO archived_tournament_prize_tiers;
GRANT SELECT ON private.archived_tournament_prize_tiers TO service_role;
DROP FUNCTION IF EXISTS public.check_prize_tier_solvency();

COMMENT ON TABLE private.archived_tournament_prize_tiers IS
  'Archivo inmutable de premios progresivos retirados el 2026-08-05; no participa en la aplicacion.';

-- Cambio material: todo participante debe aceptar los terminos de premio fijo.
CREATE OR REPLACE FUNCTION public.user_has_accepted_terms(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.terms_accepted_at IS NOT NULL AND p.terms_version = '1.3'
      FROM public.profiles AS p
      WHERE p.id = p_user_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_accepted_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_accepted_terms(uuid) TO authenticated, service_role;

COMMIT;
