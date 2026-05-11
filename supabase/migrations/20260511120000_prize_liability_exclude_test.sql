-- Exclude is_test tournaments from prize_liability so solvency
-- calculations and the admin financial alert reflect only real
-- tournaments, not simulation test data.
CREATE OR REPLACE VIEW public.prize_liability AS
WITH registration_finance AS (
  SELECT
    r.tournament_id,
    COALESCE(SUM(r.entry_fee_cents), 0)::bigint              AS gross_collected_cents,
    COALESCE(SUM(r.prize_fund_contribution_cents), 0)::bigint AS prize_fund_collected_cents,
    COALESCE(SUM(r.platform_fee_gross_cents), 0)::bigint      AS platform_fee_gross_cents,
    COALESCE(SUM(r.platform_fee_net_cents), 0)::bigint        AS platform_fee_net_cents,
    COALESCE(SUM(r.platform_fee_iva_cents), 0)::bigint        AS platform_fee_iva_cents
  FROM registrations r
  GROUP BY r.tournament_id
),
base AS (
  SELECT
    t.id,
    t.status,
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents) AS published_prize_cents
  FROM tournaments t
  WHERE t.status NOT IN ('completed', 'cancelled')
    AND NOT t.is_test
),
unclaimed_history AS (
  SELECT COALESCE(SUM(
    (t.prize_1st_cents + t.prize_2nd_cents + t.prize_3rd_cents)::numeric
    - COALESCE((
        SELECT SUM(tr.prize_awarded_cents)
        FROM tournament_results tr
        WHERE tr.tournament_id = t.id
      ), 0)
  ), 0)::bigint AS unclaimed_prize_cents
  FROM tournaments t
  WHERE t.status = 'completed'
    AND NOT t.is_test
)
SELECT
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS committed_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('scheduled', 'open')  THEN b.published_prize_cents ELSE 0 END), 0)::bigint AS contingent_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.gross_collected_cents ELSE 0 END), 0)::bigint AS collected_cents,
  COALESCE(SUM(CASE WHEN b.status IN ('live', 'finalizing') THEN rf.prize_fund_collected_cents ELSE 0 END), 0)::bigint AS prize_fund_collected_cents,
  COALESCE(SUM(rf.platform_fee_gross_cents), 0)::bigint      AS platform_fee_gross_cents,
  COALESCE(SUM(rf.platform_fee_net_cents), 0)::bigint        AS platform_fee_net_cents,
  COALESCE(SUM(rf.platform_fee_iva_cents), 0)::bigint        AS platform_fee_iva_cents,
  COUNT(*) FILTER (WHERE b.status IN ('live', 'finalizing')) AS active_count,
  COUNT(*) FILTER (WHERE b.status IN ('scheduled', 'open'))  AS pending_count,
  (SELECT unclaimed_prize_cents FROM unclaimed_history)       AS unclaimed_prize_cents_total
FROM base b
LEFT JOIN registration_finance rf ON rf.tournament_id = b.id;
