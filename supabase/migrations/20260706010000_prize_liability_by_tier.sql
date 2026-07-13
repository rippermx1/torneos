-- ============================================================
-- prize_liability por TRAMO VIGENTE de la escalera.
--
-- La vista usaba las columnas prize_*_cents (tramo base), por lo que
-- SUBESTIMABA el pasivo comprometido/contingente en torneos que cruzaron
-- tramos de la bolsa garantizada escalonada. Ahora el premio publicado por
-- torneo = el tramo aplicable según inscritos actuales (mayor umbral
-- alcanzado), con fallback a las columnas base si no hay tramos.
-- Solo monitoreo de solvencia: no toca pagos.
-- ============================================================

BEGIN;

DROP VIEW IF EXISTS public.prize_liability;

CREATE VIEW public.prize_liability AS
WITH registration_finance AS (
  SELECT
    r.tournament_id,
    COUNT(*)::int AS registered_count,
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
    -- Tramo aplicable de la escalera (mayor umbral <= inscritos actuales),
    -- con fallback al premio base del torneo si no hay tramos publicados.
    COALESCE(
      (
        SELECT tp.prize_fund_cents
        FROM public.tournament_prize_tiers tp
        WHERE tp.tournament_id = t.id
          AND tp.min_players_threshold <= COALESCE(rf.registered_count, 0)
        ORDER BY tp.min_players_threshold DESC
        LIMIT 1
      ),
      (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)::bigint
    ) AS published_prize_cents,
    rf.gross_collected_cents,
    rf.prize_fund_collected_cents,
    rf.platform_fee_gross_cents,
    rf.platform_fee_net_cents,
    rf.platform_fee_iva_cents
  FROM public.tournaments t
  LEFT JOIN registration_finance rf ON rf.tournament_id = t.id
  WHERE t.status NOT IN ('completed', 'cancelled')
    AND NOT t.is_test
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
  WHERE t.status = 'completed'
    AND NOT t.is_test
)
SELECT
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS committed_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('scheduled', 'open') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS contingent_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.gross_collected_cents ELSE 0 END), 0)::bigint AS collected_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.prize_fund_collected_cents ELSE 0 END), 0)::bigint AS prize_fund_collected_cents,
  COALESCE(SUM(b.platform_fee_gross_cents), 0)::bigint AS platform_fee_gross_cents,
  COALESCE(SUM(b.platform_fee_net_cents), 0)::bigint AS platform_fee_net_cents,
  COALESCE(SUM(b.platform_fee_iva_cents), 0)::bigint AS platform_fee_iva_cents,
  COUNT(*) FILTER (WHERE b.status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open')) AS pending_count,
  (SELECT unclaimed_prize_cents FROM unclaimed_history) AS unclaimed_prize_cents_total
FROM base b;

REVOKE ALL ON public.prize_liability FROM anon, authenticated;
GRANT SELECT ON public.prize_liability TO service_role;

COMMIT;
