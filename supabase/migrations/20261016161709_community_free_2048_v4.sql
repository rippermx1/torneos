BEGIN;

-- V4 identifies only this nonmonetary format. V1-V3, the paid default and all
-- existing cash/entry/integrity/finalization functions retain their contracts.
LOCK TABLE public.tournaments IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO public.platform_business_rules (
  version,effective_from,vat_bps,prize_budget_bps,max_total_prize_cents,max_first_prize_cents,
  rewards_enabled,flow_fee_net_bps,flow_refund_fee_net_cents,min_paid_entry_fee_cents,
  max_capacity_ratio_bps,min_contribution_margin_bps,monthly_fixed_cost_target_cents,notes
)
SELECT 4,clock_timestamp(),vat_bps,prize_budget_bps,max_total_prize_cents,max_first_prize_cents,
  rewards_enabled,flow_fee_net_bps,flow_refund_fee_net_cents,min_paid_entry_fee_cents,
  max_capacity_ratio_bps,min_contribution_margin_bps,monthly_fixed_cost_target_cents,
  'V4 exclusiva de community_free_v1: entrada y premios cero, 2-15 inscritos, 300 segundos, ventana de 24 horas, sin división ni efecto sobre rating pagado. Parámetros monetarios heredados sólo por compatibilidad; los torneos pagados conservan V3.'
FROM public.platform_business_rules WHERE version=3;

ALTER TABLE public.tournaments
  DROP CONSTRAINT prizes_positive,
  DROP CONSTRAINT tournaments_preset_key_check,
  DROP CONSTRAINT tournaments_v3_governed_preset_check;

ALTER TABLE public.tournaments
  ADD CONSTRAINT tournaments_preset_key_check CHECK (
    preset_key IN ('legacy_v2','commercial_v1','freeroll_v1','internal_test_v1','community_free_v1')
  ),
  ADD CONSTRAINT prizes_positive CHECK (
    (prize_1st_cents>0 AND prize_2nd_cents>=0 AND prize_3rd_cents>=0)
    OR (preset_key='community_free_v1' AND business_rule_version=4
      AND prize_1st_cents=0 AND prize_2nd_cents=0 AND prize_3rd_cents=0)
  ),
  ADD CONSTRAINT tournaments_v3_governed_preset_check CHECK (
    business_rule_version<3
    OR (preset_key='commercial_v1' AND tournament_type='standard' AND game_type='2048_score'
      AND entry_fee_cents=500000 AND prize_1st_cents=2475000 AND prize_2nd_cents=825000 AND prize_3rd_cents=0
      AND prize_fund_bps=5500 AND platform_fee_bps=4500 AND prize_1st_bps=7500 AND prize_2nd_bps=2500 AND prize_3rd_bps=0
      AND min_players=12 AND max_players=15 AND max_game_duration_seconds=600)
    OR (preset_key='freeroll_v1' AND tournament_type='freeroll' AND game_type='2048_score'
      AND entry_fee_cents=0 AND prize_1st_cents=500000 AND prize_2nd_cents=0 AND prize_3rd_cents=0
      AND prize_fund_bps=5500 AND platform_fee_bps=4500 AND prize_1st_bps=7500 AND prize_2nd_bps=2500 AND prize_3rd_bps=0
      AND min_players=2 AND max_players=10 AND max_game_duration_seconds=600)
    OR (is_test AND preset_key='internal_test_v1' AND tournament_type='freeroll' AND game_type='2048_score'
      AND entry_fee_cents=0 AND prize_1st_cents=100 AND prize_2nd_cents=0 AND prize_3rd_cents=0
      AND prize_fund_bps=5500 AND platform_fee_bps=4500 AND prize_1st_bps=7500 AND prize_2nd_bps=2500 AND prize_3rd_bps=0
      AND min_players=1 AND max_players=1 AND max_game_duration_seconds=300)
    OR (preset_key='community_free_v1' AND business_rule_version=4)
  ),
  ADD CONSTRAINT tournaments_community_free_v4_check CHECK (
    CASE WHEN preset_key='community_free_v1' OR business_rule_version=4 THEN
      preset_key='community_free_v1' AND business_rule_version=4
      AND tournament_type='freeroll' AND game_type='2048_score' AND prize_model='fixed'
      AND is_test IS FALSE AND skill_tier IS NULL
      AND entry_fee_cents=0 AND prize_1st_cents=0 AND prize_2nd_cents=0 AND prize_3rd_cents=0
      AND prize_fund_bps=5500 AND platform_fee_bps=4500 AND prize_1st_bps=7500 AND prize_2nd_bps=2500 AND prize_3rd_bps=0
      AND min_players=2 AND max_players=15 AND max_game_duration_seconds=300
      AND registration_opens_at<play_window_start
      AND play_window_end=play_window_start+interval '24 hours'
    ELSE true END
  );

-- An API clock check alone can expire while waiting for an INSERT/row lock.
-- Run under the existing writer's privileges; do not create a new definer RPC.
CREATE FUNCTION private.guard_community_free_game_start()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.tournaments%ROWTYPE; observed_at timestamptz;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id=NEW.tournament_id FOR SHARE;
  IF NOT FOUND OR t.preset_key IS DISTINCT FROM 'community_free_v1' THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' THEN
    IF NEW.started_at IS DISTINCT FROM OLD.started_at THEN
      RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='COMMUNITY_STARTED_AT_IMMUTABLE';
    END IF;
    RETURN NEW;
  END IF;
  observed_at:=clock_timestamp();
  IF t.status IS DISTINCT FROM 'live' OR observed_at<t.play_window_start
    OR observed_at+interval '300 seconds'>t.play_window_end THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='COMMUNITY_LAST_START_PASSED';
  END IF;
  NEW.started_at:=observed_at;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_community_free_game_start() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER guard_community_free_game_start
  BEFORE INSERT OR UPDATE OF started_at ON public.games
  FOR EACH ROW EXECUTE FUNCTION private.guard_community_free_game_start();

COMMENT ON CONSTRAINT tournaments_community_free_v4_check ON public.tournaments IS
  'V4 belongs exclusively to the nonmonetary community preset; paid and historical formats retain their existing versions.';
COMMENT ON FUNCTION private.guard_community_free_game_start() IS
  'Community INSERT uses DB time and reserves all 300 seconds; recovery never resets started_at. Existing RM14 and integrity guards still execute.';

COMMIT;
