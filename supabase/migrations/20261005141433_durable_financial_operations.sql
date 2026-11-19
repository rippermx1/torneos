BEGIN;

-- Expiry describes the checkout, never evidence that money was not received.
ALTER TABLE public.flow_payment_attempts ADD COLUMN checkout_expires_at timestamptz;
ALTER TABLE public.flow_payment_attempts ADD COLUMN last_reconciled_at timestamptz;
UPDATE public.flow_payment_attempts SET checkout_expires_at = created_at + interval '30 minutes';
ALTER TABLE public.flow_payment_attempts ALTER COLUMN checkout_expires_at SET DEFAULT (now() + interval '30 minutes');
ALTER TABLE public.flow_payment_attempts DROP CONSTRAINT flow_payment_attempts_status_check;
ALTER TABLE public.flow_payment_attempts ADD CONSTRAINT flow_payment_attempts_status_check
  CHECK (status IN ('pending','unknown','paid','credited','rejected','cancelled','expired'));
DROP INDEX public.idx_flow_attempts_one_active_tournament_checkout;
CREATE UNIQUE INDEX idx_flow_attempts_one_active_tournament_checkout
  ON public.flow_payment_attempts(user_id,tournament_id)
  WHERE intent = 'tournament_registration' AND tournament_id IS NOT NULL
    AND status IN ('pending','unknown','paid');

-- Reuse the existing refund ledger. Historical attempts remain intact.
ALTER TABLE public.flow_refund_attempts
  ADD COLUMN operation_key text,
  ADD COLUMN dispatch_nonce uuid,
  ADD COLUMN dispatched_at timestamptz,
  ADD COLUMN last_reconciled_at timestamptz,
  ALTER COLUMN tournament_id DROP NOT NULL;
ALTER TABLE public.flow_refund_attempts DROP CONSTRAINT flow_refund_attempts_status_check;
ALTER TABLE public.flow_refund_attempts ADD CONSTRAINT flow_refund_attempts_status_check
  CHECK (status IN ('queued','dispatching','unknown','manual','pending','completed','rejected','cancelled'));
CREATE UNIQUE INDEX flow_refunds_operation_key ON public.flow_refund_attempts(operation_key)
  WHERE operation_key IS NOT NULL;
-- Old transport errors called "rejected" are not proof of provider rejection.
UPDATE public.flow_refund_attempts SET status = 'unknown',
  error_message = concat_ws(E'\n',error_message,'Legacy operation: reconcile with Flow before sending anything')
  WHERE status = 'rejected' OR (status = 'pending' AND flow_refund_token IS NULL);

CREATE OR REPLACE FUNCTION private.queue_payment_refund(p_payment_id uuid, p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.flow_payment_attempts%ROWTYPE; r uuid; email text;
BEGIN
  SELECT * INTO a FROM public.flow_payment_attempts WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND OR a.flow_status_code IS DISTINCT FROM 2 OR a.status NOT IN ('paid','cancelled') THEN
    RAISE EXCEPTION 'Refund requires verified received payment';
  END IF;
  SELECT id INTO r FROM public.flow_refund_attempts WHERE flow_payment_attempt_id = a.id
    ORDER BY (status = 'completed') DESC, created_at DESC, id LIMIT 1;
  IF FOUND THEN RETURN r; END IF;
  IF a.charged_amount_cents <= 0 OR a.charged_amount_cents % 100 <> 0 THEN
    RAISE EXCEPTION 'Refund amount must be positive integer CLP';
  END IF;
  email := NULLIF(btrim(a.payer_email),'');
  IF email IS NULL THEN SELECT u.email INTO email FROM auth.users u WHERE u.id = a.user_id; END IF;
  INSERT INTO public.flow_refund_attempts(tournament_id,user_id,flow_payment_attempt_id,
    refund_commerce_order,operation_key,amount_cents,amount_pesos,receiver_email,status,error_message)
  VALUES(a.tournament_id,a.user_id,a.id,'ref-' || a.id,'refund-payment:' || a.id,
    a.charged_amount_cents,a.charged_amount_cents / 100,COALESCE(email,''),
    CASE WHEN a.intent <> 'tournament_registration' OR email IS NULL OR position('@' in email) = 0 THEN 'manual' ELSE 'queued' END,p_reason)
  RETURNING id INTO r;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION private.queue_cancelled_tournament_refunds()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    FOR a IN SELECT id FROM public.flow_payment_attempts
      WHERE tournament_id = NEW.id AND intent = 'tournament_registration'
        AND status IN ('paid','cancelled') AND flow_status_code = 2 ORDER BY id
    LOOP PERFORM private.queue_payment_refund(a.id,'Tournament cancelled'); END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER queue_cancelled_tournament_refunds AFTER UPDATE OF status ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION private.queue_cancelled_tournament_refunds();

CREATE OR REPLACE FUNCTION public.queue_tournament_refunds(p_tournament_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a record; n integer := 0;
BEGIN
  PERFORM 1 FROM public.tournaments WHERE id = p_tournament_id AND status = 'cancelled' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refund sweep requires cancelled tournament'; END IF;
  FOR a IN SELECT id FROM public.flow_payment_attempts WHERE tournament_id = p_tournament_id
    AND intent = 'tournament_registration' AND status IN ('paid','cancelled') AND flow_status_code = 2 ORDER BY id
  LOOP PERFORM private.queue_payment_refund(a.id,'Cancelled tournament recovery'); n := n + 1; END LOOP;
  RETURN n;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_flow_refund(p_refund_id uuid,p_nonce uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.flow_refund_attempts%ROWTYPE; a public.flow_payment_attempts%ROWTYPE;
BEGIN
  IF p_nonce IS NULL THEN RAISE EXCEPTION 'Dispatch nonce required'; END IF;
  UPDATE public.flow_refund_attempts SET status = 'dispatching',dispatch_nonce = p_nonce,
    dispatched_at = clock_timestamp() WHERE id = p_refund_id AND status = 'queued' RETURNING * INTO r;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO a FROM public.flow_payment_attempts WHERE id = r.flow_payment_attempt_id;
  RETURN to_jsonb(r) || jsonb_build_object('commerce_trx_id',a.commerce_order,'flow_trx_id',a.flow_order,
    'tournament_name',(SELECT name FROM public.tournaments WHERE id = r.tournament_id),
    'tournament_status',(SELECT status FROM public.tournaments WHERE id = r.tournament_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.record_flow_refund_dispatch(
  p_refund_id uuid,p_nonce uuid,p_token text,p_flow_order text,p_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  UPDATE public.flow_refund_attempts SET flow_refund_token = NULLIF(p_token,''),
    flow_refund_order = NULLIF(p_flow_order,''),
    status = CASE WHEN NULLIF(p_token,'') IS NOT NULL AND NULLIF(p_flow_order,'') IS NOT NULL THEN 'pending' ELSE 'unknown' END,
    error_message = p_error
    WHERE id = p_refund_id AND dispatch_nonce = p_nonce AND status IN ('dispatching','unknown');
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_verified_refund(
  p_refund_id uuid,p_token text,p_flow_order text,p_amount_pesos bigint,p_status text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE r public.flow_refund_attempts%ROWTYPE;
BEGIN
  SELECT * INTO r FROM public.flow_refund_attempts WHERE id = p_refund_id FOR UPDATE;
  IF NOT FOUND OR r.flow_refund_token IS DISTINCT FROM p_token
    OR r.flow_refund_order IS DISTINCT FROM p_flow_order OR r.amount_pesos IS DISTINCT FROM p_amount_pesos THEN
    RAISE EXCEPTION 'Refund provider identity or amount mismatch';
  END IF;
  IF p_status NOT IN ('pending','completed','rejected','cancelled') THEN RAISE EXCEPTION 'Unknown provider status'; END IF;
  IF r.status = 'completed' OR r.status = p_status THEN RETURN false; END IF;
  IF p_status = 'pending' AND r.status IN ('rejected','cancelled') THEN RETURN false; END IF;
  UPDATE public.flow_refund_attempts SET status = p_status,
    settled_at = CASE WHEN p_status <> 'pending' THEN clock_timestamp() ELSE NULL END WHERE id = r.id;
  RETURN true;
END;
$$;

-- A confirmed charge either enrols or creates its durable refund in this transaction.
CREATE OR REPLACE FUNCTION public.settle_tournament_registration(
  p_commerce_order text,p_flow_token text,p_flow_order bigint,p_amount_cents bigint,
  p_payment_method text,p_payer_email text,p_raw jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.flow_payment_attempts%ROWTYPE; registration_id uuid; reason text;
BEGIN
  -- Same order as registration/cancellation: tournament, then payment.
  PERFORM 1 FROM public.tournaments WHERE id =
    (SELECT tournament_id FROM public.flow_payment_attempts WHERE commerce_order = p_commerce_order) FOR UPDATE;
  SELECT * INTO a FROM public.flow_payment_attempts WHERE commerce_order = p_commerce_order FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt no encontrado: %',p_commerce_order; END IF;
  IF a.intent <> 'tournament_registration' THEN RAISE EXCEPTION 'Intent invalido'; END IF;
  IF a.charged_amount_cents IS DISTINCT FROM p_amount_cents THEN RAISE EXCEPTION 'Monto inconsistente'; END IF;
  IF p_flow_order IS NULL OR p_flow_order <= 0
    OR (a.flow_order IS NOT NULL AND a.flow_order <> p_flow_order)
    OR (a.flow_token IS NOT NULL AND p_flow_token IS NOT NULL AND a.flow_token <> p_flow_token) THEN
    RAISE EXCEPTION 'Identidad Flow inconsistente';
  END IF;
  IF a.status = 'paid' THEN
    SELECT id INTO registration_id FROM public.registrations WHERE tournament_id = a.tournament_id AND user_id = a.user_id;
    IF FOUND THEN RETURN jsonb_build_object('idempotent',true,'registration_id',registration_id,'attempt_id',a.id); END IF;
    UPDATE public.flow_payment_attempts SET status = 'cancelled',flow_status_code = 2,
      flow_token = COALESCE(flow_token,p_flow_token),flow_order = COALESCE(flow_order,p_flow_order),
      payer_email = COALESCE(p_payer_email,payer_email),raw_response = p_raw WHERE id = a.id;
    RETURN jsonb_build_object('idempotent',true,'attempt_id',a.id,'refund_id',private.queue_payment_refund(a.id,'Legacy paid attempt without registration'));
  END IF;
  IF a.status = 'cancelled' AND a.flow_status_code = 2 THEN
    RETURN jsonb_build_object('idempotent',true,'attempt_id',a.id,'refund_id',private.queue_payment_refund(a.id,'Confirmed charge awaiting refund'));
  END IF;
  UPDATE public.flow_payment_attempts SET status = 'cancelled',flow_token = COALESCE(flow_token,p_flow_token),
    flow_order = COALESCE(flow_order,p_flow_order),flow_status_code = 2,payment_method = p_payment_method,
    payer_email = p_payer_email,raw_response = p_raw,settled_at = clock_timestamp() WHERE id = a.id;
  BEGIN
    UPDATE public.flow_payment_attempts SET status = 'paid' WHERE id = a.id;
    registration_id := public.register_for_tournament(a.user_id,a.tournament_id,a.net_amount_cents);
  EXCEPTION
    WHEN SQLSTATE 'PT402' OR SQLSTATE 'PT403' OR SQLSTATE 'PT409' OR unique_violation THEN
      reason := SQLERRM;
    WHEN raise_exception THEN
      IF SQLERRM LIKE '%Torneo lleno%' OR SQLERRM LIKE '%Inscripciones cerradas%' OR SQLERRM LIKE '%Cuota inconsistente%' THEN
        reason := SQLERRM;
      ELSE RAISE; END IF;
  END;
  IF reason IS NOT NULL THEN
    UPDATE public.flow_payment_attempts SET status = 'cancelled' WHERE id = a.id;
    RETURN jsonb_build_object('idempotent',false,'attempt_id',a.id,'refund_id',private.queue_payment_refund(a.id,reason));
  END IF;
  RETURN jsonb_build_object('idempotent',false,'registration_id',registration_id,'attempt_id',a.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.queue_unsupported_flow_payment_refund(
  p_commerce_order text,p_flow_token text,p_flow_order bigint,p_amount_cents bigint,p_payer_email text,p_raw jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.flow_payment_attempts%ROWTYPE;
BEGIN
  SELECT * INTO a FROM public.flow_payment_attempts WHERE commerce_order = p_commerce_order FOR UPDATE;
  IF NOT FOUND OR a.intent <> 'wallet_deposit' OR a.charged_amount_cents IS DISTINCT FROM p_amount_cents
    OR p_flow_order IS NULL OR p_flow_order <= 0 OR (a.flow_order IS NOT NULL AND a.flow_order <> p_flow_order)
    OR (a.flow_token IS NOT NULL AND p_flow_token IS NOT NULL AND a.flow_token <> p_flow_token) THEN
    RAISE EXCEPTION 'Unsupported payment identity or amount mismatch';
  END IF;
  UPDATE public.flow_payment_attempts SET status = 'cancelled',flow_status_code = 2,
    flow_token = COALESCE(flow_token,p_flow_token),flow_order = COALESCE(flow_order,p_flow_order),
    payer_email = p_payer_email,raw_response = p_raw,settled_at = clock_timestamp() WHERE id = a.id;
  RETURN private.queue_payment_refund(a.id,'Unsupported legacy deposit; no wallet credit');
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_mark_flow_attempt_failed(
  p_commerce_order text,p_flow_token text,p_flow_status_code smallint,p_raw jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_flow_status_code NOT IN (3,4) THEN RAISE EXCEPTION 'Provider did not confirm failure'; END IF;
  UPDATE public.flow_payment_attempts SET status = CASE WHEN p_flow_status_code = 3 THEN 'rejected' ELSE 'cancelled' END,
    flow_token = COALESCE(flow_token,p_flow_token),flow_status_code = p_flow_status_code,raw_response = p_raw,settled_at = clock_timestamp()
    WHERE commerce_order = p_commerce_order AND status IN ('pending','unknown','expired')
      AND (flow_token IS NULL OR p_flow_token IS NULL OR flow_token = p_flow_token)
      AND flow_status_code IS DISTINCT FROM 2;
END;
$$;

-- Serialize all wallet mutations with the existing lock; use ledger sum rather
-- than ordering UUIDs created at the same timestamp to determine the balance.
CREATE OR REPLACE FUNCTION public.wallet_insert_transaction(
  p_user_id uuid,p_type text,p_amount_cents bigint,p_reference_type text DEFAULT NULL,
  p_reference_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}')
RETURNS public.wallet_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE balance bigint; result public.wallet_transactions%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);
  SELECT COALESCE(sum(amount_cents),0) INTO balance FROM public.wallet_transactions WHERE user_id = p_user_id;
  IF balance + p_amount_cents < 0 THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;
  INSERT INTO public.wallet_transactions(user_id,type,amount_cents,balance_after_cents,reference_type,reference_id,metadata)
    VALUES(p_user_id,p_type,p_amount_cents,balance + p_amount_cents,p_reference_type,p_reference_id,p_metadata) RETURNING * INTO result;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_request_id uuid,p_user_id uuid,p_amount_cents bigint,p_bank_name text,p_bank_account text,
  p_account_rut text,p_account_holder text,p_verified_full_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.withdrawal_requests%ROWTYPE; profile public.profiles%ROWTYPE; tx public.wallet_transactions%ROWTYPE;
BEGIN
  IF p_request_id IS NULL OR p_user_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Identificador requerido'; END IF;
  SELECT * INTO profile FROM public.profiles WHERE id = p_user_id FOR SHARE;
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text)::bigint);
  SELECT * INTO existing FROM public.withdrawal_requests WHERE id = p_request_id;
  IF FOUND THEN
    IF existing.user_id IS DISTINCT FROM p_user_id OR existing.amount_cents IS DISTINCT FROM p_amount_cents
      OR existing.bank_name IS DISTINCT FROM btrim(p_bank_name) OR existing.bank_account IS DISTINCT FROM btrim(p_bank_account)
      OR existing.account_rut IS DISTINCT FROM btrim(p_account_rut) OR existing.account_holder IS DISTINCT FROM btrim(p_account_holder) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Identificador usado con otros datos';
    END IF;
    RETURN existing.id;
  END IF;
  IF profile.id IS NULL OR profile.is_banned IS DISTINCT FROM false OR profile.kyc_status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Identidad no habilitada para retiro';
  END IF;
  PERFORM 1 FROM public.profile_roles WHERE profile_id = p_user_id AND role = 'user' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Rol no habilitado'; END IF;
  IF p_amount_cents IS NULL OR p_amount_cents < 500000 OR p_amount_cents > 50000000 OR p_amount_cents % 100 <> 0
    OR COALESCE(length(btrim(p_bank_name)),0) = 0 OR COALESCE(length(btrim(p_bank_account)),0) = 0
    OR COALESCE(length(btrim(p_account_rut)),0) = 0 OR COALESCE(length(btrim(p_account_holder)),0) = 0 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Monto o datos bancarios invalidos';
  END IF;
  -- Route performs checksum/name validation; compare against the locked verified
  -- profile again so concurrent KYC edits cannot change the beneficiary.
  IF upper(regexp_replace(profile.rut,'[^0-9kK]','','g')) IS DISTINCT FROM upper(regexp_replace(p_account_rut,'[^0-9kK]','','g'))
    OR profile.rut IS NULL OR profile.full_name IS NULL OR profile.full_name IS DISTINCT FROM p_verified_full_name THEN
    RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Titularidad bancaria inconsistente';
  END IF;
  IF EXISTS(SELECT 1 FROM public.withdrawal_requests WHERE user_id = p_user_id AND status IN ('pending','approved')) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Ya tienes una solicitud de retiro pendiente';
  END IF;
  IF (SELECT COALESCE(sum(amount_cents),0) FROM public.wallet_transactions WHERE user_id=p_user_id) < p_amount_cents THEN
    RAISE EXCEPTION USING ERRCODE='PT402',MESSAGE='Saldo insuficiente';
  END IF;
  IF public.wallet_withdrawable_balance(p_user_id) < p_amount_cents THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Saldo no retirable';
  END IF;
  IF public.wallet_withdrawn_in_window(p_user_id,interval '1 day') + p_amount_cents > 50000000
    OR public.wallet_withdrawn_in_window(p_user_id,interval '30 days') + p_amount_cents > 200000000 THEN
    RAISE EXCEPTION USING ERRCODE='PT429',MESSAGE='Excede el limite de retiros';
  END IF;
  tx := public.wallet_insert_transaction(p_user_id,'withdrawal',-p_amount_cents,'withdrawal_request',p_request_id,
    jsonb_build_object('status','pending','withdrawal_request_id',p_request_id));
  INSERT INTO public.withdrawal_requests(id,user_id,amount_cents,bank_name,bank_account,account_rut,account_holder,wallet_transaction_id)
    VALUES(p_request_id,p_user_id,p_amount_cents,btrim(p_bank_name),btrim(p_bank_account),btrim(p_account_rut),btrim(p_account_holder),tx.id);
  RETURN p_request_id;
END;
$$;

-- Default function execute grants must never expose service-only mutations.
DO $$ DECLARE f regprocedure;
BEGIN
  FOR f IN SELECT oid::regprocedure FROM pg_proc WHERE proname IN (
    'queue_payment_refund','queue_cancelled_tournament_refunds','queue_tournament_refunds','claim_flow_refund',
    'record_flow_refund_dispatch','record_verified_refund','settle_tournament_registration','queue_unsupported_flow_payment_refund',
    'wallet_mark_flow_attempt_failed','wallet_insert_transaction','request_withdrawal')
    AND pronamespace IN ('public'::regnamespace,'private'::regnamespace)
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f);
    IF f::text NOT LIKE 'private.%' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f); END IF;
  END LOOP;
END $$;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.flow_refund_attempts,public.withdrawal_requests FROM PUBLIC,anon,authenticated;
DO $$ DECLARE tab text; cols text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['flow_refund_attempts','withdrawal_requests'] LOOP
    SELECT string_agg(quote_ident(attname),',') INTO cols FROM pg_attribute
      WHERE attrelid = ('public.' || tab)::regclass AND attnum > 0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated',cols,cols,cols,tab);
  END LOOP;
END $$;
-- No age-limited recovery: enqueue historical cancellations too. No external call.
DO $$ DECLARE t record;
BEGIN
  FOR t IN SELECT id FROM public.tournaments WHERE status = 'cancelled' ORDER BY id
  LOOP PERFORM public.queue_tournament_refunds(t.id); END LOOP;
END $$;
COMMIT;
