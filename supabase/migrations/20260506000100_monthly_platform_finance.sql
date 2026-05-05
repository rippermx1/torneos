-- ============================================================
-- Vista contable mensual para reportes administrativos y SII (F29).
--
-- Por qué:
-- - La declaración mensual de IVA del SII chileno requiere conocer
--   base imponible (fee neto) e IVA débito (19%) por periodo.
-- - El modelo entry_pool persiste platform_fee_gross/net/iva por
--   inscripción (registrations.*); aquí los agrupamos por mes de
--   inscripción en zona horaria Chile.
-- - Solo entry_pool: los torneos de premio fijo no tienen split
--   contable por inscripción; su resultado se conoce al finalizar
--   y se reporta vía tournament_results / business reports.
-- ============================================================

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
  COALESCE(SUM(r.prize_pool_contribution_cents), 0)::bigint       AS prize_pool_cents,
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
