-- RM-02 / OP-01: browser rows are never authority for commercial participation.
-- RM-03's seed migration is a prerequisite of the release, kept separately.
BEGIN;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.registrations, public.games, public.game_moves, public.flow_payment_attempts FROM PUBLIC, anon, authenticated;
-- Table revocation does not remove independently granted column privileges.
DO $$
DECLARE relation_name text; columns_list text;
BEGIN
  FOREACH relation_name IN ARRAY ARRAY['registrations', 'games', 'game_moves', 'flow_payment_attempts'] LOOP
    SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_list
    FROM pg_catalog.pg_attribute
    WHERE attrelid = format('public.%I', relation_name)::regclass
      AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC, anon, authenticated',
      columns_list, columns_list, columns_list, relation_name);
  END LOOP;
END;
$$;
DROP POLICY IF EXISTS "Usuario se inscribe" ON public.registrations;

-- Shared authorization for trusted settlement and competitive mutations.
-- Locks keep eligibility/payment revocation from racing a successful write.
-- Terms version must advance with lib/legal/terms.ts (covered by verification).
CREATE OR REPLACE FUNCTION private.assert_commercial_entry(
  p_user_id uuid, p_tournament_id uuid, p_require_registration boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tournaments%ROWTYPE; p public.profiles%ROWTYPE; r public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.tournaments WHERE id = p_tournament_id FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'ENTRY_TOURNAMENT_MISSING';
  END IF;
  SELECT * INTO p FROM public.profiles WHERE id = p_user_id FOR SHARE;
  IF NOT FOUND OR p.is_banned IS DISTINCT FROM false THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_ACCOUNT_INELIGIBLE';
  END IF;
  PERFORM profile_id FROM public.profile_roles
    WHERE profile_id = p_user_id AND role = 'user'::public.app_role FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_ROLE_REQUIRED';
  END IF;
  IF p.birth_date IS NULL OR p.birth_date >
    ((clock_timestamp() AT TIME ZONE 'America/Santiago')::date - interval '18 years')::date THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_ADULT_REQUIRED';
  END IF;
  IF p.terms_accepted_at IS NULL OR p.terms_accepted_at > clock_timestamp()
    OR p.terms_version IS DISTINCT FROM '1.3' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_TERMS_REQUIRED';
  END IF;
  IF t.entry_fee_cents IS NULL OR t.entry_fee_cents < 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_FEE_INVALID';
  END IF;
  IF t.entry_fee_cents > 0 THEN
    IF p.kyc_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_KYC_REQUIRED';
    END IF;
    PERFORM id FROM public.flow_payment_attempts
      WHERE user_id = p_user_id AND tournament_id = p_tournament_id
        AND intent = 'tournament_registration' AND status = 'paid' AND flow_status_code = 2
        AND flow_order > 0 AND net_amount_cents = t.entry_fee_cents
        AND charged_amount_cents = t.entry_fee_cents FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'PT402', MESSAGE = 'ENTRY_PAYMENT_REQUIRED';
    END IF;
  END IF;
  IF p_require_registration THEN
    SELECT * INTO r FROM public.registrations
      WHERE tournament_id = p_tournament_id AND user_id = p_user_id FOR SHARE;
    IF NOT FOUND OR r.entry_fee_cents IS DISTINCT FROM t.entry_fee_cents THEN
      RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_REGISTRATION_UNCONFIRMED';
    END IF;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.assert_commercial_entry(uuid, uuid, boolean) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_commercial_registration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tournaments%ROWTYPE;
BEGIN
  -- Same serialization as register_for_tournament, including trusted direct INSERTs.
  SELECT * INTO t FROM public.tournaments WHERE id = NEW.tournament_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'ENTRY_TOURNAMENT_MISSING';
  END IF;
  PERFORM private.assert_commercial_entry(NEW.user_id, NEW.tournament_id, false);
  IF NEW.entry_fee_cents IS DISTINCT FROM t.entry_fee_cents THEN
    RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_FEE_INVALID';
  END IF;
  IF t.status NOT IN ('scheduled', 'open') OR t.registration_opens_at IS NULL
    OR t.play_window_start IS NULL OR clock_timestamp() < t.registration_opens_at
    OR clock_timestamp() >= t.play_window_start THEN
    RAISE EXCEPTION 'Inscripciones cerradas';
  END IF;
  IF (SELECT count(*) FROM public.registrations WHERE tournament_id = NEW.tournament_id) >= t.max_players THEN
    RAISE EXCEPTION 'Torneo lleno';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_commercial_registration() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_commercial_registration BEFORE INSERT ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION private.guard_commercial_registration();

-- Settlement and registration still commit together. Mark the verified payment
-- within this transaction BEFORE the INSERT's proof check; any failure rolls back both.
CREATE OR REPLACE FUNCTION public.settle_tournament_registration(
  p_commerce_order text, p_flow_token text, p_flow_order bigint, p_amount_cents bigint,
  p_payment_method text, p_payer_email text, p_raw jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.flow_payment_attempts%ROWTYPE; registration_id uuid;
BEGIN
  SELECT * INTO a FROM public.flow_payment_attempts WHERE commerce_order = p_commerce_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt no encontrado: %', p_commerce_order; END IF;
  IF a.intent <> 'tournament_registration' THEN RAISE EXCEPTION 'Intent invalido para settlement de torneo: %', a.intent; END IF;
  IF a.charged_amount_cents IS DISTINCT FROM p_amount_cents THEN
    RAISE EXCEPTION 'Monto inconsistente: esperado=%, recibido=%', a.charged_amount_cents, p_amount_cents;
  END IF;
  IF p_flow_order IS NULL OR p_flow_order <= 0 OR p_flow_token IS NULL OR p_flow_token = ''
    OR (a.flow_order IS NOT NULL AND a.flow_order <> p_flow_order)
    OR (a.flow_token IS NOT NULL AND a.flow_token <> p_flow_token) THEN
    RAISE EXCEPTION 'Identidad Flow inconsistente';
  END IF;
  IF a.status = 'paid' THEN
    SELECT id INTO registration_id FROM public.registrations
      WHERE tournament_id = a.tournament_id AND user_id = a.user_id;
    RETURN jsonb_build_object('idempotent', true, 'registration_id', registration_id, 'attempt_id', a.id);
  END IF;
  IF a.status <> 'pending' THEN RAISE EXCEPTION 'Attempt en estado no acreditable: %', a.status; END IF;
  UPDATE public.flow_payment_attempts SET status = 'paid', flow_token = COALESCE(flow_token, p_flow_token),
    flow_order = COALESCE(flow_order, p_flow_order), flow_status_code = 2, payment_method = p_payment_method,
    payer_email = p_payer_email, raw_response = p_raw, settled_at = clock_timestamp() WHERE id = a.id;
  registration_id := public.register_for_tournament(a.user_id, a.tournament_id, a.net_amount_cents);
  RETURN jsonb_build_object('idempotent', false, 'registration_id', registration_id, 'attempt_id', a.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.authorize_competitive_entry(p_user_id uuid, p_tournament_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.assert_commercial_entry(p_user_id, p_tournament_id, true);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.authorize_competitive_entry(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.authorize_competitive_entry(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.settle_tournament_registration(text, text, bigint, bigint, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_tournament_registration(text, text, bigint, bigint, text, text, jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.register_for_tournament(uuid, uuid, bigint), public.register_with_credit(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.guard_competitive_game_entry()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.tournaments%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.tournament_id IS DISTINCT FROM OLD.tournament_id THEN
      RAISE EXCEPTION USING ERRCODE = 'PT403', MESSAGE = 'ENTRY_IDENTITY_IMMUTABLE';
    END IF;
    IF NEW.current_board IS NOT DISTINCT FROM OLD.current_board AND NEW.final_score IS NOT DISTINCT FROM OLD.final_score
      AND NEW.highest_tile IS NOT DISTINCT FROM OLD.highest_tile AND NEW.move_count IS NOT DISTINCT FROM OLD.move_count THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM private.assert_commercial_entry(NEW.user_id, NEW.tournament_id, true);
  SELECT * INTO t FROM public.tournaments WHERE id = NEW.tournament_id;
  IF t.status <> 'live' OR t.play_window_start IS NULL OR t.play_window_end IS NULL
    OR clock_timestamp() < t.play_window_start OR clock_timestamp() >= t.play_window_end THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'ENTRY_PLAY_WINDOW_CLOSED';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.guard_competitive_game_entry() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER guard_competitive_game_entry BEFORE INSERT OR UPDATE OF
  user_id, tournament_id, current_board, final_score, highest_tile, move_count ON public.games
  FOR EACH ROW EXECUTE FUNCTION private.guard_competitive_game_entry();
COMMIT;
