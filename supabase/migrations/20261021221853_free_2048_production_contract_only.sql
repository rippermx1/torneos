-- Apply AFTER the four original migrations; no duplicate retention/community/Storage DDL.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $dependencies$
BEGIN
  IF to_regprocedure('public.record_2048_player_activity(uuid,text)') IS NULL
    OR to_regprocedure('public.report_2048_player_retention(date,date)') IS NULL
    OR to_regprocedure('private.guard_community_free_game_start()') IS NULL
    OR to_regprocedure('private.guard_community_free_registration_clock()') IS NULL
    OR NOT EXISTS(SELECT 1 FROM public.platform_business_rules WHERE version=4)
    OR (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN('free_2048_kyc_no_client_insert','free_2048_kyc_no_client_update'))<>2 THEN
    RAISE EXCEPTION 'FREE_2048_ORIGINAL_MIGRATIONS_REQUIRED';
  END IF;
END;
$dependencies$;

-- Web stores terms 1.4; keep the database predicate aligned. Never backdate acceptance.
CREATE OR REPLACE FUNCTION public.user_has_accepted_terms(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $terms$
  SELECT COALESCE((SELECT p.terms_accepted_at IS NOT NULL AND p.terms_version='1.4'
    FROM public.profiles p WHERE p.id=p_user_id), false);
$terms$;
REVOKE ALL ON FUNCTION public.user_has_accepted_terms(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.user_has_accepted_terms(uuid) TO authenticated,service_role;

-- A direct Data API call must not bypass the source-level free release guard.
-- Service callers retain existing privileges; ordinary clients use the checked web API.
DO $acl$
DECLARE item record; columns text;
BEGIN
  FOR item IN
    SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND (p.proname LIKE 'wallet\_%' ESCAPE '\' OR p.proname IN (
      'register_for_tournament','register_with_credit','settle_tournament_registration',
      'approve_withdrawal','reject_withdrawal','complete_withdrawal','finalize_tournament',
      'cancel_tournament','record_game_move','record_admin_action','accounting_operate',
      'accounting_workspace','rate_limit_consume','inspect_2048_integrity',
      'resolve_2048_integrity','set_2048_account_sanction'))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC,anon,authenticated',item.signature);
  END LOOP;

  FOR item IN
    SELECT c.oid,c.oid::regclass AS relation FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND c.relname IN (
      'profiles','profile_roles','registrations','games','game_moves','tournaments',
      'wallet_transactions','withdrawal_requests','flow_payment_attempts','flow_refund_attempts',
      'kyc_submissions','kyc_audit_events','tournament_results','player_ratings',
      'platform_business_rules','tournament_prize_tiers','admin_actions')
  LOOP
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON TABLE %s FROM PUBLIC,anon,authenticated',item.relation);
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columns
      FROM pg_attribute WHERE attrelid=item.oid AND attnum>0 AND NOT attisdropped;
    IF columns IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),REFERENCES (%s) ON TABLE %s FROM PUBLIC,anon,authenticated',
        columns,columns,columns,item.relation);
    END IF;
  END LOOP;
END;
$acl$;

-- Even trusted callers cannot create participation in a historical monetary event
-- while this free release is active. Existing rows stay intact and readable.
CREATE FUNCTION private.guard_free_2048_participation_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $guard$
DECLARE t public.tournaments%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id=NEW.tournament_id FOR SHARE;
  IF NOT FOUND OR t.preset_key IS DISTINCT FROM 'community_free_v1'
    OR t.business_rule_version IS DISTINCT FROM 4 OR t.entry_fee_cents IS DISTINCT FROM 0
    OR t.prize_1st_cents IS DISTINCT FROM 0 OR t.prize_2nd_cents IS DISTINCT FROM 0
    OR t.prize_3rd_cents IS DISTINCT FROM 0 OR t.game_type IS DISTINCT FROM '2048_score'
    OR t.is_test IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='MONEY_DISABLED_FREE_RELEASE';
  END IF;
  RETURN NEW;
END;
$guard$;
REVOKE ALL ON FUNCTION private.guard_free_2048_participation_write() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER free_2048_participation_registration
  BEFORE INSERT OR UPDATE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION private.guard_free_2048_participation_write();
CREATE TRIGGER free_2048_participation_game
  BEFORE INSERT OR UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION private.guard_free_2048_participation_write();

NOTIFY pgrst, 'reload schema';
COMMIT;
