BEGIN;
-- RM-08. Obligations survive review; pending prizes are not spendable money.
-- Pilot operations serialize decisions with current account/role/dispute changes.
CREATE TABLE public.prize_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','held','approved')),
  reason text NOT NULL DEFAULT 'Revisión obligatoria del ganador',
  reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz,
  evidence jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tournament_id,user_id)
);
CREATE TABLE public.financial_holds (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES public.profiles(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 2000),
  created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(),
  released_by uuid REFERENCES public.profiles(id), released_at timestamptz, release_reason text,
  CHECK ((released_at IS NULL AND released_by IS NULL AND release_reason IS NULL)
    OR (released_at IS NOT NULL AND released_by IS NOT NULL AND length(btrim(release_reason)) BETWEEN 10 AND 2000))
);
CREATE INDEX financial_holds_active_user ON public.financial_holds(user_id) WHERE released_at IS NULL;
CREATE TABLE public.financial_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_id uuid NOT NULL,
  action text NOT NULL, actor_id uuid REFERENCES public.profiles(id),
  reason text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prize_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_review_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.prize_reviews,public.financial_holds,public.financial_review_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT(id,tournament_id,user_id,amount_cents,status,created_at) ON public.prize_reviews TO authenticated;
CREATE POLICY prize_review_owner_read ON public.prize_reviews FOR SELECT TO authenticated USING (user_id=(SELECT auth.uid()));
GRANT SELECT ON public.prize_reviews,public.financial_holds,public.financial_review_events TO service_role;
-- Writes occur through definer functions and triggers, not PostgREST table updates.

CREATE FUNCTION private.financial_review_lock() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT pg_catalog.pg_advisory_xact_lock(81008,8);
$$;
CREATE FUNCTION private.lock_financial_review_changes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM private.financial_review_lock(); RETURN NULL; END;
$$;
CREATE TRIGGER lock_financial_profile BEFORE UPDATE OF is_banned,kyc_status,full_name,rut ON public.profiles
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_financial_review_changes();
CREATE TRIGGER lock_financial_roles BEFORE INSERT OR UPDATE OR DELETE ON public.profile_roles
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_financial_review_changes();
CREATE TRIGGER lock_financial_disputes BEFORE INSERT OR UPDATE OR DELETE ON public.disputes
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_financial_review_changes();
CREATE TRIGGER lock_financial_withdrawals BEFORE INSERT OR UPDATE OR DELETE ON public.withdrawal_requests
  FOR EACH STATEMENT EXECUTE FUNCTION private.lock_financial_review_changes();

CREATE FUNCTION private.assert_review_operator(p_actor uuid,p_beneficiary uuid DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_actor IS NULL OR p_actor=p_beneficiary OR NOT EXISTS (
    SELECT 1 FROM public.profiles p JOIN public.profile_roles r ON r.profile_id=p.id
    WHERE p.id=p_actor AND NOT p.is_banned AND r.role IN ('admin','owner')
  ) THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Operador vigente e independiente requerido'; END IF;
END;
$$;
CREATE FUNCTION private.assert_financial_clearance(p_user uuid,p_reviewing boolean DEFAULT false) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p JOIN public.profile_roles r ON r.profile_id=p.id
    WHERE p.id=p_user AND NOT p.is_banned AND p.kyc_status='approved' AND r.role='user') THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Pago retenido: cuenta, rol o KYC no habilitado'; END IF;
  IF EXISTS (SELECT 1 FROM public.financial_holds WHERE user_id=p_user AND released_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.disputes d WHERE d.status='open' AND (d.user_id=p_user OR
      (d.type='tournament_result' AND EXISTS (SELECT 1 FROM public.prize_reviews pr WHERE pr.user_id=p_user AND pr.tournament_id=d.tournament_id)))) THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Pago retenido: retención o disputa abierta'; END IF;
  IF NOT p_reviewing AND EXISTS (SELECT 1 FROM public.prize_reviews WHERE user_id=p_user AND status<>'approved') THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Pago retenido: premios pendientes de revisión'; END IF;
END;
$$;

CREATE FUNCTION private.capture_prize_review() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NEW.prize_awarded_cents>0 AND EXISTS (SELECT 1 FROM public.tournaments WHERE id=NEW.tournament_id AND NOT is_test) THEN
    INSERT INTO public.prize_reviews(tournament_id,user_id,amount_cents,created_at)
      VALUES(NEW.tournament_id,NEW.user_id,NEW.prize_awarded_cents,NEW.created_at);
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_prize_review AFTER INSERT ON public.tournament_results FOR EACH ROW EXECUTE FUNCTION private.capture_prize_review();
-- Historical credits remain in the ledger; all require a fresh human decision.
INSERT INTO public.prize_reviews(tournament_id,user_id,amount_cents,created_at)
SELECT r.tournament_id,r.user_id,r.prize_awarded_cents,r.created_at FROM public.tournament_results r
JOIN public.tournaments t ON t.id=r.tournament_id WHERE r.prize_awarded_cents>0 AND NOT t.is_test;

CREATE FUNCTION private.retain_account_prizes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF ROW(NEW.is_banned,NEW.kyc_status,NEW.full_name,NEW.rut) IS DISTINCT FROM ROW(OLD.is_banned,OLD.kyc_status,OLD.full_name,OLD.rut) THEN
    WITH changed AS (UPDATE public.prize_reviews SET status='held',reason='Cambio en identidad, KYC o estado de cuenta',reviewed_by=NULL,reviewed_at=NULL
      WHERE user_id=NEW.id AND status='approved' RETURNING id)
    INSERT INTO public.financial_review_events(target_id,action,reason) SELECT id,'prize.account_hold','Cambio en identidad, KYC o estado de cuenta' FROM changed;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_account_prizes AFTER UPDATE OF is_banned,kyc_status,full_name,rut ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.retain_account_prizes();
CREATE FUNCTION private.retain_disputed_prizes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP='INSERT' AND (NEW.status<>'open' OR NEW.resolved_by IS NOT NULL OR NEW.resolved_at IS NOT NULL
    OR (NEW.type='tournament_result' AND NEW.tournament_id IS NULL)
    OR (NEW.tournament_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.registrations WHERE user_id=NEW.user_id AND tournament_id=NEW.tournament_id))) THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Disputa inválida o torneo ajeno'; END IF;
  IF NEW.status='open' THEN
    WITH changed AS (UPDATE public.prize_reviews SET status='held',reason='Disputa abierta',reviewed_by=NULL,reviewed_at=NULL
      WHERE user_id=NEW.user_id OR (NEW.type='tournament_result' AND tournament_id=NEW.tournament_id) RETURNING id)
    INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details)
      SELECT id,'prize.dispute_hold',NEW.user_id,'Disputa abierta',jsonb_build_object('dispute_id',NEW.id) FROM changed;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER retain_disputed_prizes BEFORE INSERT OR UPDATE ON public.disputes FOR EACH ROW EXECUTE FUNCTION private.retain_disputed_prizes();

ALTER FUNCTION public.wallet_insert_transaction(uuid,text,bigint,text,uuid,jsonb) SET SCHEMA private;
ALTER FUNCTION private.wallet_insert_transaction(uuid,text,bigint,text,uuid,jsonb) RENAME TO wallet_insert_transaction_rm07;
REVOKE ALL ON FUNCTION private.wallet_insert_transaction_rm07(uuid,text,bigint,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.wallet_insert_transaction(p_user_id uuid,p_type text,p_amount_cents bigint,p_reference_type text DEFAULT NULL,p_reference_id uuid DEFAULT NULL,p_metadata jsonb DEFAULT '{}')
RETURNS public.wallet_transactions LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_type='prize_credit' AND NOT EXISTS(SELECT 1 FROM public.tournaments WHERE id=p_reference_id AND is_test) THEN
    PERFORM private.financial_review_lock();
    IF NOT EXISTS (SELECT 1 FROM public.prize_reviews WHERE user_id=p_user_id AND tournament_id=p_reference_id AND status='approved' AND amount_cents=p_amount_cents)
      OR p_reference_type IS DISTINCT FROM 'tournament' OR p_amount_cents<=0
      OR EXISTS (SELECT 1 FROM public.wallet_transactions WHERE user_id=p_user_id AND type='prize_credit' AND reference_id=p_reference_id) THEN
      RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Crédito de premio sin revisión o duplicado'; END IF;
  END IF;
  RETURN private.wallet_insert_transaction_rm07(p_user_id,p_type,p_amount_cents,p_reference_type,p_reference_id,p_metadata);
END;
$$;

CREATE OR REPLACE FUNCTION public.wallet_withdrawable_balance(p_user_id uuid) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
SELECT greatest(0,coalesce(sum(CASE
  WHEN wt.type='prize_credit' AND wt.reference_type='tournament' AND EXISTS (
    SELECT 1 FROM public.prize_reviews pr WHERE pr.user_id=wt.user_id AND pr.tournament_id=wt.reference_id AND pr.status='approved'
      AND pr.amount_cents=(SELECT sum(w.amount_cents) FROM public.wallet_transactions w WHERE w.user_id=wt.user_id AND w.type='prize_credit' AND w.reference_id=wt.reference_id)) THEN wt.amount_cents
  WHEN wt.type='withdrawal' THEN wt.amount_cents
  WHEN wt.type='refund' AND wt.reference_type='withdrawal_request' THEN wt.amount_cents
  WHEN wt.type='refund' AND wt.reference_type='tournament' AND EXISTS (SELECT 1 FROM public.tournaments WHERE id=wt.reference_id AND NOT is_test) THEN wt.amount_cents
  ELSE 0 END),0))::bigint FROM public.wallet_transactions wt WHERE wt.user_id=p_user_id;
$$;

CREATE FUNCTION public.review_prize(p_review_id uuid,p_admin_id uuid,p_decision text,p_reason text,p_evidence jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.prize_reviews; credited bigint;
BEGIN
  PERFORM private.financial_review_lock();
  SELECT * INTO r FROM public.prize_reviews WHERE id=p_review_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Premio no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id);
  IF p_decision NOT IN ('approved','held') OR p_decision IS NULL OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Decisión y justificación de 10 a 2000 caracteres requeridas'; END IF;
  IF p_decision='approved' THEN
    PERFORM private.assert_financial_clearance(r.user_id,true);
    IF p_evidence IS NULL OR jsonb_typeof(p_evidence->'games') IS DISTINCT FROM 'array' OR jsonb_typeof(p_evidence->'flags') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Evidencia de partidas requerida'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.tournaments t JOIN public.tournament_results tr ON tr.tournament_id=t.id
      WHERE t.id=r.tournament_id AND t.status='completed' AND NOT t.is_test AND tr.user_id=r.user_id AND tr.prize_awarded_cents=r.amount_cents) THEN
      RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Resultado no liquidado o premio inconsistente'; END IF;
    SELECT coalesce(sum(amount_cents),0) INTO credited FROM public.wallet_transactions
      WHERE user_id=r.user_id AND type='prize_credit' AND reference_id=r.tournament_id;
    IF credited<>0 AND credited<>r.amount_cents THEN RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Créditos históricos inconsistentes: conciliar'; END IF;
  END IF;
  UPDATE public.prize_reviews SET status=p_decision,reason=btrim(p_reason),reviewed_by=p_admin_id,reviewed_at=now(),evidence=coalesce(p_evidence,'{}') WHERE id=r.id;
  IF p_decision='approved' AND credited=0 THEN
    PERFORM public.wallet_insert_transaction(r.user_id,'prize_credit',r.amount_cents,'tournament',r.tournament_id,jsonb_build_object('prize_review_id',r.id));
  END IF;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details)
    VALUES(r.id,'prize.'||p_decision,p_admin_id,btrim(p_reason),jsonb_build_object('previous_status',r.status,'evidence',p_evidence));
END;
$$;

CREATE FUNCTION public.set_financial_hold(p_hold_id uuid,p_user_id uuid,p_admin_id uuid,p_release boolean,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE h public.financial_holds;
BEGIN
  PERFORM private.financial_review_lock(); PERFORM private.assert_review_operator(p_admin_id,p_user_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 OR p_release IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Justificación requerida'; END IF;
  SELECT * INTO h FROM public.financial_holds WHERE id=p_hold_id FOR UPDATE;
  IF p_release THEN
    IF NOT FOUND OR h.user_id<>p_user_id THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Retención no encontrada'; END IF;
    IF h.released_at IS NOT NULL THEN RETURN; END IF;
    UPDATE public.financial_holds SET released_by=p_admin_id,released_at=now(),release_reason=btrim(p_reason) WHERE id=p_hold_id;
  ELSE
    IF FOUND THEN
      IF h.user_id=p_user_id AND h.reason=btrim(p_reason) AND h.created_by=p_admin_id AND h.released_at IS NULL THEN RETURN; END IF;
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Identificador de retención ya utilizado'; END IF;
    INSERT INTO public.financial_holds(id,user_id,reason,created_by) VALUES(p_hold_id,p_user_id,btrim(p_reason),p_admin_id);
    UPDATE public.prize_reviews SET status='held',reason=btrim(p_reason),reviewed_by=p_admin_id,reviewed_at=now() WHERE user_id=p_user_id;
  END IF;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details)
    VALUES(p_hold_id,CASE WHEN p_release THEN 'hold.released' ELSE 'hold.created' END,p_admin_id,btrim(p_reason),jsonb_build_object('user_id',p_user_id));
END;
$$;

ALTER TABLE public.withdrawal_requests DROP CONSTRAINT withdrawal_requests_status_check;
ALTER TABLE public.withdrawal_requests ADD CONSTRAINT withdrawal_requests_status_check CHECK(status IN ('pending','claimed','approved','transferring','reconciling','paid','rejected'));
ALTER TABLE public.withdrawal_requests ADD COLUMN claimed_by uuid REFERENCES public.profiles(id), ADD COLUMN claimed_at timestamptz,
  ADD COLUMN transfer_started_at timestamptz, ADD COLUMN identity_snapshot jsonb;
-- Previously approved requests require the new two-operator check.
INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details)
SELECT id,'payout.migration_review',reviewed_by,'Aprobación anterior requiere nuevo circuito de operadores',
  jsonb_build_object('previous_status',status,'previous_reviewed_at',reviewed_at,'previous_notes',admin_notes)
FROM public.withdrawal_requests WHERE status='approved';
UPDATE public.withdrawal_requests SET status='pending',reviewed_by=NULL,reviewed_at=NULL WHERE status='approved';
DROP INDEX public.idx_withdrawals_one_open_per_user;
CREATE UNIQUE INDEX idx_withdrawals_one_open_per_user ON public.withdrawal_requests(user_id) WHERE status IN ('pending','claimed','approved','transferring','reconciling');
-- Fail migration on duplicate historical bank references; never discard proof.
CREATE UNIQUE INDEX withdrawals_unique_bank_reference ON public.withdrawal_requests(upper(btrim(bank_transfer_reference))) WHERE bank_transfer_reference IS NOT NULL;
CREATE FUNCTION private.guard_withdrawal_identity() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF ROW(NEW.user_id,NEW.amount_cents,NEW.bank_name,NEW.bank_account,NEW.account_rut,NEW.account_holder,NEW.wallet_transaction_id)
    IS DISTINCT FROM ROW(OLD.user_id,OLD.amount_cents,OLD.bank_name,OLD.bank_account,OLD.account_rut,OLD.account_holder,OLD.wallet_transaction_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Importe y destino de cobro son inmutables'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_withdrawal_identity BEFORE UPDATE ON public.withdrawal_requests FOR EACH ROW EXECUTE FUNCTION private.guard_withdrawal_identity();
ALTER FUNCTION public.request_withdrawal(uuid,uuid,bigint,text,text,text,text,text) SET SCHEMA private;
ALTER FUNCTION private.request_withdrawal(uuid,uuid,bigint,text,text,text,text,text) RENAME TO request_withdrawal_rm07;
REVOKE ALL ON FUNCTION private.request_withdrawal_rm07(uuid,uuid,bigint,text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.request_withdrawal(p_request_id uuid,p_user_id uuid,p_amount_cents bigint,p_bank_name text,p_bank_account text,p_account_rut text,p_account_holder text,p_verified_full_name text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.financial_review_lock(); PERFORM private.assert_financial_clearance(p_user_id);
  IF EXISTS (SELECT 1 FROM public.withdrawal_requests WHERE user_id=p_user_id AND id<>p_request_id AND status IN ('pending','claimed','approved','transferring','reconciling')) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Ya existe un cobro en curso'; END IF;
  RETURN private.request_withdrawal_rm07(p_request_id,p_user_id,p_amount_cents,p_bank_name,p_bank_account,p_account_rut,p_account_holder,p_verified_full_name);
END;
$$;

CREATE FUNCTION private.assert_payout_clearance(r public.withdrawal_requests) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p public.profiles;
BEGIN
  PERFORM private.assert_financial_clearance(r.user_id);
  SELECT * INTO p FROM public.profiles WHERE id=r.user_id;
  IF r.identity_snapshot IS DISTINCT FROM jsonb_build_object('full_name',p.full_name,'rut',p.rut)
    OR regexp_replace(upper(r.account_rut),'[^0-9K]','','g') IS DISTINCT FROM regexp_replace(upper(p.rut),'[^0-9K]','','g')
    OR lower(regexp_replace(btrim(r.account_holder),'\s+',' ','g')) IS DISTINCT FROM lower(regexp_replace(btrim(p.full_name),'\s+',' ','g')) THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Identidad bancaria cambió o no coincide: revisar'; END IF;
  PERFORM private.assert_review_operator(r.claimed_by,r.user_id);
END;
$$;
CREATE FUNCTION public.claim_withdrawal(p_request_id uuid,p_admin_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id); PERFORM private.assert_financial_clearance(r.user_id);
  IF r.status='claimed' AND r.claimed_by=p_admin_id THEN RETURN; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Cobro ya reclamado'; END IF;
  UPDATE public.withdrawal_requests SET status='claimed',claimed_by=p_admin_id,claimed_at=now(),identity_snapshot=(SELECT jsonb_build_object('full_name',full_name,'rut',rut) FROM public.profiles WHERE id=r.user_id) WHERE id=r.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason) VALUES(r.id,'payout.claim',p_admin_id,'Operador responsable asignado');
END;
$$;
CREATE OR REPLACE FUNCTION public.approve_withdrawal(p_request_id uuid,p_admin_id uuid,p_notes text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id); PERFORM private.assert_payout_clearance(r);
  IF r.claimed_by=p_admin_id OR r.status<>'claimed' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Segundo operador distinto del responsable requerido'; END IF;
  IF p_notes IS NULL OR length(btrim(p_notes)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Documenta la verificación de importe y destino'; END IF;
  UPDATE public.withdrawal_requests SET status='approved',reviewed_by=p_admin_id,reviewed_at=now(),admin_notes=btrim(p_notes) WHERE id=r.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason) VALUES(r.id,'payout.approve',p_admin_id,btrim(p_notes));
END;
$$;
CREATE FUNCTION public.begin_withdrawal_transfer(p_request_id uuid,p_admin_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id); PERFORM private.assert_payout_clearance(r);
  PERFORM private.assert_review_operator(r.reviewed_by,r.user_id);
  IF r.status<>'approved' OR r.claimed_by<>p_admin_id OR r.reviewed_by=p_admin_id THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='No iniciar ni repetir: revisar responsable o conciliar transferencia'; END IF;
  UPDATE public.withdrawal_requests SET status='transferring',transfer_started_at=now() WHERE id=r.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason) VALUES(r.id,'payout.begin',p_admin_id,'Una única autorización de transferencia manual');
  RETURN jsonb_build_object('request_id',r.id,'amount_cents',r.amount_cents,'bank_name',r.bank_name,'bank_account',r.bank_account,'account_holder',r.account_holder,'account_rut',r.account_rut);
END;
$$;
CREATE OR REPLACE FUNCTION public.reject_withdrawal(p_request_id uuid,p_admin_id uuid,p_notes text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id);
  IF p_notes IS NULL OR length(btrim(p_notes)) NOT BETWEEN 10 AND 2000 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Motivo de rechazo requerido'; END IF;
  IF r.status='rejected' THEN RETURN; END IF;
  IF r.status NOT IN ('pending','claimed','approved') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Transferencia iniciada: conciliar antes de devolver fondos'; END IF;
  PERFORM public.wallet_insert_transaction(r.user_id,'refund',r.amount_cents,'withdrawal',r.id,jsonb_build_object('original_transaction_id',r.wallet_transaction_id));
  UPDATE public.withdrawal_requests SET status='rejected',admin_notes=btrim(p_notes),reviewed_by=p_admin_id,reviewed_at=now() WHERE id=r.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason) VALUES(r.id,'payout.reject',p_admin_id,btrim(p_notes));
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_withdrawal(p_request_id uuid,p_admin_id uuid,p_bank_transfer_reference text,p_proof_storage_path text,p_notes text DEFAULT NULL) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests; receipt text;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id);
  IF r.status='paid' AND upper(btrim(r.bank_transfer_reference))=upper(btrim(p_bank_transfer_reference)) AND r.proof_storage_path=p_proof_storage_path THEN RETURN r.receipt_number; END IF;
  PERFORM private.assert_payout_clearance(r); PERFORM private.assert_review_operator(r.reviewed_by,r.user_id);
  IF r.status<>'transferring' OR r.claimed_by<>p_admin_id THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Conciliar o consultar el pago existente; no repetir transferencia'; END IF;
  IF p_bank_transfer_reference IS NULL OR length(btrim(p_bank_transfer_reference)) NOT BETWEEN 3 AND 120
    OR p_proof_storage_path IS NULL OR p_proof_storage_path NOT LIKE r.id::text||'/%' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Referencia y comprobante privado requeridos'; END IF;
  receipt:='TP-PREM-'||to_char(now() AT TIME ZONE 'America/Santiago','YYYYMMDD')||'-'||upper(substr(replace(r.id::text,'-',''),1,12));
  UPDATE public.withdrawal_requests SET status='paid',paid_by=p_admin_id,paid_at=now(),bank_transfer_reference=btrim(p_bank_transfer_reference),proof_storage_path=p_proof_storage_path,receipt_number=receipt,payment_notes=p_notes WHERE id=r.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details) VALUES(r.id,'payout.paid',p_admin_id,coalesce(p_notes,'Transferencia confirmada'),jsonb_build_object('bank_reference',p_bank_transfer_reference,'proof',p_proof_storage_path));
  RETURN receipt;
END;
$$;
CREATE FUNCTION public.reconcile_withdrawal(p_request_id uuid,p_admin_id uuid,p_outcome text,p_bank_reference text,p_proof_path text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.withdrawal_requests;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO r FROM public.withdrawal_requests WHERE id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Cobro no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,r.user_id);
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 OR p_outcome IS NULL OR p_outcome NOT IN ('unknown','paid','not_sent') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Resultado y justificación requeridos'; END IF;
  IF r.status NOT IN ('transferring','reconciling') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Pago no pendiente de conciliación'; END IF;
  IF p_outcome='unknown' THEN UPDATE public.withdrawal_requests SET status='reconciling',payment_notes=btrim(p_reason) WHERE id=r.id;
  ELSE
    IF r.claimed_by=p_admin_id OR p_proof_path IS NULL OR p_proof_path NOT LIKE r.id::text||'/%'
      OR p_bank_reference IS NULL OR length(btrim(p_bank_reference)) NOT BETWEEN 3 AND 120 THEN
      RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Segundo operador y evidencia bancaria requeridos para conciliar'; END IF;
    -- Record a bank fact even if the account was subsequently banned/held. No new transfer is authorized.
    IF p_outcome='paid' THEN
      UPDATE public.withdrawal_requests SET status='paid',paid_by=p_admin_id,paid_at=now(),bank_transfer_reference=btrim(p_bank_reference),proof_storage_path=p_proof_path,
        receipt_number='TP-PREM-'||to_char(now() AT TIME ZONE 'America/Santiago','YYYYMMDD')||'-'||upper(substr(replace(r.id::text,'-',''),1,12)),payment_notes=btrim(p_reason) WHERE id=r.id;
    ELSE
      PERFORM public.wallet_insert_transaction(r.user_id,'refund',r.amount_cents,'withdrawal',r.id,jsonb_build_object('bank_verified_not_sent',true));
      UPDATE public.withdrawal_requests SET status='rejected',proof_storage_path=p_proof_path,payment_notes=btrim(p_reason),admin_notes=btrim(p_reason),reviewed_by=p_admin_id,reviewed_at=now() WHERE id=r.id;
    END IF;
  END IF;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason,details) VALUES(r.id,'payout.reconcile.'||p_outcome,p_admin_id,btrim(p_reason),jsonb_build_object('bank_reference',p_bank_reference,'proof',p_proof_path));
END;
$$;

-- Explicit allowlist; private helpers and the previous RPC implementations are not callable by service clients.
DO $$ DECLARE f record; BEGIN
  FOR f IN SELECT p.oid::regprocedure AS signature,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE (n.nspname='private' AND p.proname IN ('financial_review_lock','lock_financial_review_changes','assert_review_operator','assert_financial_clearance','capture_prize_review','retain_account_prizes','retain_disputed_prizes','guard_withdrawal_identity','assert_payout_clearance'))
       OR (n.nspname='public' AND p.proname IN ('wallet_insert_transaction','wallet_withdrawable_balance','review_prize','set_financial_hold','request_withdrawal','claim_withdrawal','approve_withdrawal','begin_withdrawal_transfer','reject_withdrawal','complete_withdrawal','reconcile_withdrawal'))
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.nspname='public' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
    END IF;
  END LOOP;
END $$;

-- Keep ranking, fixed obligations and accounting; credit only test tournaments here.
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
  PERFORM private.financial_review_lock();
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
      IF v_tournament.is_test THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.finalize_tournament(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_tournament(uuid) TO service_role;


CREATE FUNCTION public.resolve_financial_dispute(p_dispute_id uuid,p_admin_id uuid,p_resolution text,p_reason text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.disputes;
BEGIN
  PERFORM private.financial_review_lock(); SELECT * INTO d FROM public.disputes WHERE id=p_dispute_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Disputa no encontrada'; END IF;
  PERFORM private.assert_review_operator(p_admin_id,d.user_id);
  IF p_resolution IS NULL OR p_resolution NOT IN ('resolved','rejected') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Resolución y justificación requeridas'; END IF;
  IF d.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Disputa ya resuelta'; END IF;
  UPDATE public.disputes SET status=p_resolution,admin_notes=btrim(p_reason),resolved_by=p_admin_id,resolved_at=now() WHERE id=d.id;
  INSERT INTO public.financial_review_events(target_id,action,actor_id,reason) VALUES(d.id,'dispute.'||p_resolution,p_admin_id,btrim(p_reason));
  -- Retained prizes require another decision. Resolution is not approval.
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_financial_dispute(uuid,uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_financial_dispute(uuid,uuid,text,text) TO service_role;
REVOKE UPDATE,DELETE ON public.disputes FROM PUBLIC,anon,authenticated,service_role;
REVOKE INSERT,UPDATE,DELETE ON public.withdrawal_requests FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.disputes'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE UPDATE(%I) ON public.disputes FROM PUBLIC,anon,authenticated,service_role',c.attname);
  END LOOP;
  FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.withdrawal_requests'::regclass AND attnum>0 AND NOT attisdropped LOOP
    EXECUTE format('REVOKE INSERT(%I),UPDATE(%I) ON public.withdrawal_requests FROM PUBLIC,anon,authenticated,service_role',c.attname,c.attname);
  END LOOP;
END $$;
COMMIT;
