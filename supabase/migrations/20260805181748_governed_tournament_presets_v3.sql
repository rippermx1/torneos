-- ============================================================================
-- ECONOMIA GOBERNADA V3: FORMATOS CERRADOS PARA CREACION ADMINISTRATIVA
--
-- El administrador elige un proposito, no diseña la economia del torneo.
-- Todo torneo comercial nuevo debe coincidir exactamente con uno de estos
-- formatos:
--   * commercial_v1: $5.000, 12-15 cupos, premios fijos $24.750 / $8.250;
--   * freeroll_v1: gratis, 2-10 cupos, premio promocional fijo de $5.000.
-- Los torneos de prueba siguen excluidos de los indicadores comerciales.
-- ============================================================================

BEGIN;

LOCK TABLE public.tournaments IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.platform_business_rules
  ADD COLUMN IF NOT EXISTS monthly_fixed_cost_target_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.platform_business_rules
  DROP CONSTRAINT IF EXISTS platform_business_rules_monthly_fixed_cost_target_check;

ALTER TABLE public.platform_business_rules
  ADD CONSTRAINT platform_business_rules_monthly_fixed_cost_target_check
    CHECK (monthly_fixed_cost_target_cents >= 0);

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
  monthly_fixed_cost_target_cents,
  notes
) VALUES (
  3,
  '2026-08-05T00:00:00-04:00',
  1900,
  5500,
  200000,
  12500,
  2500,
  7000000,
  4900000,
  false,
  319,
  20200,
  25000000, -- $250.000 CLP: meta mensual inicial de costos fijos
  'Formatos gobernados: comercial $5.000 (12-15 cupos, premio $33.000) y freeroll promocional controlado.'
)
ON CONFLICT (version) DO NOTHING;

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS preset_key text NOT NULL DEFAULT 'legacy_v2';

ALTER TABLE public.tournaments
  DROP CONSTRAINT IF EXISTS tournaments_preset_key_check,
  DROP CONSTRAINT IF EXISTS tournaments_v3_governed_preset_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_preset_key_check CHECK (
    preset_key IN ('legacy_v2', 'commercial_v1', 'freeroll_v1', 'internal_test_v1')
  ),
  ADD CONSTRAINT tournaments_v3_governed_preset_check CHECK (
    business_rule_version < 3
    OR (
      preset_key = 'commercial_v1'
      AND tournament_type = 'standard'
      AND game_type = '2048_score'
      AND entry_fee_cents = 500000
      AND prize_1st_cents = 2475000
      AND prize_2nd_cents = 825000
      AND prize_3rd_cents = 0
      AND prize_fund_bps = 5500
      AND platform_fee_bps = 4500
      AND prize_1st_bps = 7500
      AND prize_2nd_bps = 2500
      AND prize_3rd_bps = 0
      AND min_players = 12
      AND max_players = 15
      AND max_game_duration_seconds = 600
    )
    OR (
      preset_key = 'freeroll_v1'
      AND tournament_type = 'freeroll'
      AND game_type = '2048_score'
      AND entry_fee_cents = 0
      AND prize_1st_cents = 500000
      AND prize_2nd_cents = 0
      AND prize_3rd_cents = 0
      AND prize_fund_bps = 5500
      AND platform_fee_bps = 4500
      AND prize_1st_bps = 7500
      AND prize_2nd_bps = 2500
      AND prize_3rd_bps = 0
      AND min_players = 2
      AND max_players = 10
      AND max_game_duration_seconds = 600
    )
    OR (
      is_test
      AND preset_key = 'internal_test_v1'
      AND tournament_type = 'freeroll'
      AND game_type = '2048_score'
      AND entry_fee_cents = 0
      AND prize_1st_cents = 100
      AND prize_2nd_cents = 0
      AND prize_3rd_cents = 0
      AND prize_fund_bps = 5500
      AND platform_fee_bps = 4500
      AND prize_1st_bps = 7500
      AND prize_2nd_bps = 2500
      AND prize_3rd_bps = 0
      AND min_players = 1
      AND max_players = 1
      AND max_game_duration_seconds = 300
    )
  );

ALTER TABLE public.tournaments
  ALTER COLUMN business_rule_version SET DEFAULT 3;

COMMENT ON COLUMN public.tournaments.preset_key IS
  'Formato economico inmutable elegido al publicar. V3 solo acepta combinaciones gobernadas.';

COMMENT ON COLUMN public.platform_business_rules.monthly_fixed_cost_target_cents IS
  'Meta de planificacion para medir cuantos torneos cubren costos fijos; no representa utilidad garantizada.';

COMMIT;
