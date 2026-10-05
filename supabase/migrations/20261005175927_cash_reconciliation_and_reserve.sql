-- RM-10 candidate only. No external banking, tax declaration or money transfer.
BEGIN;
CREATE TABLE public.cash_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), paused boolean NOT NULL DEFAULT true,
  max_exposure_cents bigint CHECK(max_exposure_cents BETWEEN 0 AND 900000000000000),
  additional_reserve_cents bigint CHECK(additional_reserve_cents BETWEEN 0 AND 900000000000000),
  updated_by uuid REFERENCES public.profiles(id), updated_at timestamptz NOT NULL DEFAULT now(), reason text
);
INSERT INTO public.cash_policy(singleton) VALUES(true);
CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY, kind text NOT NULL CHECK(kind IN ('funding','flow_settlement','tax_payment','operating_expense','chargeback')),
  amount_cents bigint NOT NULL CHECK(amount_cents>0 AND amount_cents<=900000000000000 AND amount_cents%100=0),
  bank_reference text NOT NULL UNIQUE, occurred_at timestamptz NOT NULL, proof_path text NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), note text NOT NULL,
  approved_by uuid REFERENCES public.profiles(id), approved_at timestamptz, rejected_by uuid REFERENCES public.profiles(id), rejected_at timestamptz, rejection_note text, journal_id bigint REFERENCES public.accounting_journal_entries(id)
);
CREATE TABLE public.cash_reconciliations (
  id uuid PRIMARY KEY, observed_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES public.profiles(id), bank_total_cents bigint NOT NULL CHECK(bank_total_cents>=0),
  bank_held_cents bigint NOT NULL CHECK(bank_held_cents>=0 AND bank_held_cents<=bank_total_cents),
  flow_total_cents bigint NOT NULL CHECK(flow_total_cents>=0), flow_held_cents bigint NOT NULL CHECK(flow_held_cents>=0 AND flow_held_cents<=flow_total_cents),
  bank_proof_path text NOT NULL, flow_proof_path text NOT NULL, snapshot jsonb NOT NULL, note text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, review_note text
);
CREATE TABLE public.cash_differences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reconciliation_id uuid NOT NULL REFERENCES public.cash_reconciliations(id),
  source text NOT NULL CHECK(source IN ('bank','flow')), difference_cents bigint NOT NULL CHECK(difference_cents<>0),
  assigned_to uuid NOT NULL REFERENCES public.profiles(id), due_at timestamptz NOT NULL,
  reason text NOT NULL, resolved_by uuid REFERENCES public.profiles(id), resolved_at timestamptz,
  replacement_id uuid REFERENCES public.cash_reconciliations(id), resolution_note text,
  UNIQUE(reconciliation_id,source)
);
CREATE TABLE public.cash_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), target_id uuid NOT NULL, action text NOT NULL,
  actor_id uuid NOT NULL REFERENCES public.profiles(id), note text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cash_reconciliations_approved_recent ON public.cash_reconciliations(observed_at DESC,created_at DESC,id) WHERE status='approved';
CREATE INDEX cash_movements_pending ON public.cash_movements(created_at) WHERE approved_at IS NULL;
CREATE INDEX cash_differences_open_due ON public.cash_differences(due_at) WHERE resolved_at IS NULL;
ALTER TABLE public.cash_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_differences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_policy,public.cash_movements,public.cash_reconciliations,public.cash_differences,public.cash_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.cash_policy,public.cash_movements,public.cash_reconciliations,public.cash_differences,public.cash_events TO service_role;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  VALUES('cash-proofs','cash-proofs',false,6291456,ARRAY['application/pdf','image/png','image/jpeg','image/webp'])
  ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='cash-proofs' AND public) THEN RAISE EXCEPTION 'cash-proofs must be private'; END IF; END; $$;

CREATE FUNCTION private.cash_operator(p_actor uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.financial_review_lock(); PERFORM private.assert_review_operator(p_actor);
  PERFORM pg_advisory_xact_lock(81010,10);
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Justificación de 10 a 2000 caracteres requerida'; END IF;
END;
$$;
CREATE FUNCTION private.assert_cash_proof(p_id uuid,p_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_path IS NULL OR p_path !~ ('^'||p_id||'/[a-f0-9]{64}\.(pdf|png|jpg|webp)$') OR NOT EXISTS(
    SELECT 1 FROM storage.objects WHERE bucket_id='cash-proofs' AND name=p_path AND (metadata->>'size')::bigint>0
  ) THEN RAISE EXCEPTION USING ERRCODE='PT422',MESSAGE='Evidencia privada existente requerida'; END IF;
END;
$$;

CREATE FUNCTION private.cash_components() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH real_wallet AS (
  SELECT w.user_id, sum(w.amount_cents) balance FROM public.wallet_transactions w
    LEFT JOIN public.tournaments t ON w.reference_type='tournament' AND t.id=w.reference_id
    WHERE w.type NOT IN ('tournament_credit','ticket_debit') AND (w.reference_type IS DISTINCT FROM 'tournament' OR t.is_test IS DISTINCT FROM true)
    GROUP BY w.user_id
), uncredited AS (
  SELECT COALESCE(sum(greatest(0,r.amount_cents-COALESCE((SELECT sum(w.amount_cents) FROM public.wallet_transactions w
    WHERE w.type='prize_credit' AND w.user_id=r.user_id AND w.reference_type='tournament' AND w.reference_id=r.tournament_id),0))),0)::bigint amount
    FROM public.prize_reviews r JOIN public.tournaments t ON t.id=r.tournament_id WHERE NOT t.is_test
), books AS (
  SELECT COALESCE(sum(debit_cents-credit_cents) FILTER(WHERE account_code='110100'),0)::bigint bank,
    COALESCE(sum(debit_cents-credit_cents) FILTER(WHERE account_code='110200'),0)::bigint flow,
    greatest(0,COALESCE(sum(credit_cents-debit_cents) FILTER(WHERE account_code='210100'),0))::bigint taxes FROM public.accounting_postings
)
SELECT jsonb_build_object('wallet_cents',COALESCE((SELECT sum(greatest(0,balance)) FROM real_wallet),0)::bigint,
  'uncredited_prizes_cents',(SELECT amount FROM uncredited),
  'reserved_withdrawals_cents',(SELECT COALESCE(sum(amount_cents),0)::bigint FROM public.withdrawal_requests WHERE status IN ('pending','claimed','approved','transferring','reconciling')),
  'promised_prizes_cents',(SELECT COALESCE(sum(prize_1st_cents+prize_2nd_cents+prize_3rd_cents),0)::bigint FROM public.tournaments WHERE NOT is_test AND status IN ('scheduled','open','live','finalizing')),
  'refunds_cents',(SELECT COALESCE(sum(amount_cents),0)::bigint FROM public.flow_refund_attempts WHERE status<>'completed'),
  'unsettled_payments_cents',(SELECT COALESCE(sum(a.charged_amount_cents),0)::bigint FROM public.flow_payment_attempts a JOIN public.tournaments t ON t.id=a.tournament_id WHERE a.intent='tournament_registration' AND NOT t.is_test AND a.status IN ('pending','unknown','expired')),
  'tax_reserve_cents',taxes,'bank_book_cents',bank,'flow_book_cents',flow,
  'negative_wallets',(SELECT count(*) FROM real_wallet WHERE balance<0),
  'integrity_failures',(SELECT COALESCE(sum((c->>'count')::bigint),0) FROM jsonb_array_elements(public.operational_snapshot()->'checks') c)) FROM books;
$$;

CREATE FUNCTION public.cash_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; p public.cash_policy; r public.cash_reconciliations; exposure bigint; required bigint; available bigint; reasons jsonb:='[]';
BEGIN
  s:=private.cash_components(); SELECT * INTO STRICT p FROM public.cash_policy WHERE singleton;
  SELECT * INTO r FROM public.cash_reconciliations WHERE status='approved' ORDER BY observed_at DESC,created_at DESC,id LIMIT 1;
  exposure:=(s->>'wallet_cents')::bigint+(s->>'uncredited_prizes_cents')::bigint+(s->>'reserved_withdrawals_cents')::bigint+
    (s->>'promised_prizes_cents')::bigint+(s->>'refunds_cents')::bigint+(s->>'unsettled_payments_cents')::bigint;
  required:=exposure+(s->>'tax_reserve_cents')::bigint+COALESCE(p.additional_reserve_cents,0);
  IF r.id IS NOT NULL THEN available:=r.bank_total_cents-r.bank_held_cents+(s->>'bank_book_cents')::bigint-(r.snapshot->>'bank_book_cents')::bigint; END IF;
  IF p.paused THEN reasons:=reasons||jsonb_build_array('Cobros nuevos pausados por el propietario'); END IF;
  IF p.max_exposure_cents IS NULL OR p.additional_reserve_cents IS NULL THEN reasons:=reasons||jsonb_build_array('Reserva adicional y límite de exposición sin definir'); END IF;
  IF r.id IS NULL OR r.observed_at<=now()-interval '24 hours' THEN reasons:=reasons||jsonb_build_array('Conciliación bancaria/Flow aprobada ausente o vencida'); END IF;
  IF EXISTS(SELECT 1 FROM public.cash_differences WHERE resolved_at IS NULL) THEN reasons:=reasons||jsonb_build_array('Diferencias de caja sin resolver'); END IF;
  IF (s->>'integrity_failures')::bigint>0 OR (s->>'negative_wallets')::bigint>0 OR (s->>'bank_book_cents')::bigint<0 OR (s->>'flow_book_cents')::bigint<0 THEN reasons:=reasons||jsonb_build_array('Subledger o contabilidad inconsistente'); END IF;
  IF available IS NULL OR available<required THEN reasons:=reasons||jsonb_build_array('Caja bancaria insuficiente para cubrir la reserva'); END IF;
  IF exposure>p.max_exposure_cents THEN reasons:=reasons||jsonb_build_array('Exposición superior al límite aprobado'); END IF;
  RETURN s||jsonb_build_object('observed_at',now(),'exposure_cents',exposure,'required_reserve_cents',required,
    'available_bank_cents',available,'shortfall_cents',CASE WHEN available IS NOT NULL THEN greatest(0,required-available) END,
    'reconciliation_id',r.id,'reconciliation_at',r.observed_at,'additional_reserve_cents',p.additional_reserve_cents,
    'max_exposure_cents',p.max_exposure_cents,'paused',p.paused,'admissions_allowed',jsonb_array_length(reasons)=0,'blocking_reasons',reasons,
    'open_differences',(SELECT count(*) FROM public.cash_differences WHERE resolved_at IS NULL));
END;
$$;

CREATE FUNCTION public.set_cash_policy(p_actor uuid,p_paused boolean,p_max_exposure bigint,p_additional_reserve bigint,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM private.cash_operator(p_actor,p_note);
  IF NOT EXISTS(SELECT 1 FROM public.profile_roles WHERE profile_id=p_actor AND role='owner') THEN
    RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Política de caja requiere propietario vigente'; END IF;
  IF p_paused IS NULL OR p_max_exposure IS NULL OR p_additional_reserve IS NULL OR p_max_exposure NOT BETWEEN 0 AND 900000000000000 OR p_additional_reserve NOT BETWEEN 0 AND 900000000000000
    OR p_max_exposure%100<>0 OR p_additional_reserve%100<>0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Política monetaria inválida'; END IF;
  UPDATE public.cash_policy SET paused=p_paused,max_exposure_cents=p_max_exposure,additional_reserve_cents=p_additional_reserve,updated_by=p_actor,updated_at=now(),reason=btrim(p_note) WHERE singleton;
  INSERT INTO public.cash_events(target_id,action,actor_id,note,details) VALUES(p_actor,'policy',p_actor,btrim(p_note),jsonb_build_object('paused',p_paused,'max_exposure_cents',p_max_exposure,'additional_reserve_cents',p_additional_reserve));
END;
$$;

CREATE FUNCTION public.record_cash_movement(p_id uuid,p_actor uuid,p_kind text,p_amount bigint,p_reference text,p_occurred_at timestamptz,p_proof text,p_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE existing public.cash_movements;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); PERFORM private.assert_cash_proof(p_id,p_proof);
  IF p_kind IS NULL OR p_kind NOT IN ('funding','flow_settlement','tax_payment','operating_expense','chargeback') OR p_amount IS NULL OR p_amount<=0 OR p_amount>900000000000000 OR p_amount%100<>0
    OR p_reference IS NULL OR length(btrim(p_reference)) NOT BETWEEN 3 AND 120 OR p_occurred_at IS NULL OR p_occurred_at>now() THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Movimiento, monto, referencia y fecha válidos requeridos'; END IF;
  SELECT * INTO existing FROM public.cash_movements WHERE id=p_id;
  IF FOUND THEN
    IF ROW(existing.created_by,existing.kind,existing.amount_cents,existing.bank_reference,existing.occurred_at,existing.proof_path)
      IS DISTINCT FROM ROW(p_actor,p_kind,p_amount,upper(btrim(p_reference)),p_occurred_at,p_proof) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Identificador de movimiento usado con otros datos'; END IF;
    RETURN existing.id;
  END IF;
  INSERT INTO public.cash_movements(id,kind,amount_cents,bank_reference,occurred_at,proof_path,created_by,note)
    VALUES(p_id,p_kind,p_amount,upper(btrim(p_reference)),p_occurred_at,p_proof,p_actor,btrim(p_note));
  INSERT INTO public.cash_events(target_id,action,actor_id,note) VALUES(p_id,'movement.recorded',p_actor,btrim(p_note)); RETURN p_id;
END;
$$;
CREATE FUNCTION public.approve_cash_movement(p_id uuid,p_actor uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cash_movements; debit text; credit text; journal bigint;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); SELECT * INTO m FROM public.cash_movements WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Movimiento no encontrado'; END IF;
  IF p_actor=m.created_by THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Revisor independiente requerido'; END IF;
  IF m.rejected_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Movimiento rechazado'; END IF;
  IF m.approved_at IS NOT NULL THEN RETURN; END IF;
  PERFORM private.assert_cash_proof(m.id,m.proof_path);
  debit:=CASE m.kind WHEN 'funding' THEN '110100' WHEN 'flow_settlement' THEN '110100' WHEN 'tax_payment' THEN '210100' WHEN 'operating_expense' THEN '520400' ELSE '520500' END;
  credit:=CASE m.kind WHEN 'funding' THEN '310100' WHEN 'flow_settlement' THEN '110200' ELSE '110100' END;
  journal:=private.post_accounting_entry('cash.movement:'||m.id,'cash_'||m.kind,'cash_movements',m.id,NULL,NULL,m.occurred_at,m.note,
    jsonb_build_array(jsonb_build_object('account_code',debit,'debit_cents',m.amount_cents,'credit_cents',0),jsonb_build_object('account_code',credit,'debit_cents',0,'credit_cents',m.amount_cents)),false,jsonb_build_object('bank_reference',m.bank_reference,'proof_path',m.proof_path));
  UPDATE public.cash_movements SET approved_by=p_actor,approved_at=now(),journal_id=journal WHERE id=m.id;
  INSERT INTO public.cash_events(target_id,action,actor_id,note) VALUES(m.id,'movement.approved',p_actor,btrim(p_note));
END;
$$;
INSERT INTO public.accounting_accounts(code,name,category,normal_balance) VALUES('520400','Gastos operativos conciliados','expense','debit'),('520500','Contracargos conciliados','expense','debit') ON CONFLICT(code) DO NOTHING;

CREATE FUNCTION public.capture_cash_reconciliation(p_id uuid,p_actor uuid,p_observed_at timestamptz,p_bank bigint,p_bank_held bigint,p_flow bigint,p_flow_held bigint,p_bank_proof text,p_flow_proof text,p_note text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; existing public.cash_reconciliations; k text; difference bigint;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); PERFORM private.assert_cash_proof(p_id,p_bank_proof); PERFORM private.assert_cash_proof(p_id,p_flow_proof);
  IF p_observed_at IS NULL OR p_observed_at>now() OR p_observed_at<=now()-interval '24 hours' OR p_bank IS NULL OR p_flow IS NULL OR p_bank_held IS NULL OR p_flow_held IS NULL
    OR p_bank NOT BETWEEN 0 AND 900000000000000 OR p_flow NOT BETWEEN 0 AND 900000000000000 OR p_bank_held NOT BETWEEN 0 AND p_bank OR p_flow_held NOT BETWEEN 0 AND p_flow
    OR p_bank%100<>0 OR p_flow%100<>0 OR p_bank_held%100<>0 OR p_flow_held%100<>0 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Saldos, retenciones y corte reciente válidos requeridos'; END IF;
  SELECT * INTO existing FROM public.cash_reconciliations WHERE id=p_id;
  IF FOUND THEN
    IF ROW(existing.created_by,existing.observed_at,existing.bank_total_cents,existing.bank_held_cents,existing.flow_total_cents,existing.flow_held_cents,existing.bank_proof_path,existing.flow_proof_path)
      IS DISTINCT FROM ROW(p_actor,p_observed_at,p_bank,p_bank_held,p_flow,p_flow_held,p_bank_proof,p_flow_proof) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Identificador de corte usado con otros datos'; END IF;
    RETURN existing.id;
  END IF;
  s:=private.cash_components();
  INSERT INTO public.cash_reconciliations(id,observed_at,created_by,bank_total_cents,bank_held_cents,flow_total_cents,flow_held_cents,bank_proof_path,flow_proof_path,snapshot,note)
    VALUES(p_id,p_observed_at,p_actor,p_bank,p_bank_held,p_flow,p_flow_held,p_bank_proof,p_flow_proof,s,btrim(p_note));
  FOREACH k IN ARRAY ARRAY['bank','flow'] LOOP
    difference:=CASE k WHEN 'bank' THEN p_bank ELSE p_flow END-(s->>(k||'_book_cents'))::bigint;
    IF difference<>0 THEN INSERT INTO public.cash_differences(reconciliation_id,source,difference_cents,assigned_to,due_at,reason)
      VALUES(p_id,k,difference,p_actor,now()+interval '24 hours','Saldo observado diferente del libro: requiere conciliación'); END IF;
  END LOOP;
  INSERT INTO public.cash_events(target_id,action,actor_id,note,details) VALUES(p_id,'reconciliation.captured',p_actor,btrim(p_note),s); RETURN p_id;
END;
$$;
CREATE FUNCTION public.review_cash_reconciliation(p_id uuid,p_actor uuid,p_decision text,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.cash_reconciliations; s jsonb;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); SELECT * INTO r FROM public.cash_reconciliations WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Conciliación no encontrada'; END IF;
  IF p_actor=r.created_by THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Revisor independiente requerido'; END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('approved','rejected') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Decisión inválida'; END IF;
  IF r.status=p_decision THEN RETURN; END IF;
  IF r.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Conciliación ya revisada'; END IF;
  IF p_decision='approved' THEN
    PERFORM private.assert_cash_proof(r.id,r.bank_proof_path); PERFORM private.assert_cash_proof(r.id,r.flow_proof_path); s:=private.cash_components();
    IF r.observed_at<=now()-interval '24 hours' OR EXISTS(SELECT 1 FROM public.cash_differences WHERE reconciliation_id=r.id)
      OR (s->>'bank_book_cents') IS DISTINCT FROM (r.snapshot->>'bank_book_cents') OR (s->>'flow_book_cents') IS DISTINCT FROM (r.snapshot->>'flow_book_cents')
      OR (s->>'integrity_failures')::bigint>0 OR (s->>'negative_wallets')::bigint>0 THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Corte vencido, con diferencias o desactualizado: preparar otra conciliación'; END IF;
  END IF;
  UPDATE public.cash_reconciliations SET status=p_decision,reviewed_by=p_actor,reviewed_at=now(),review_note=btrim(p_note) WHERE id=r.id;
  INSERT INTO public.cash_events(target_id,action,actor_id,note) VALUES(r.id,'reconciliation.'||p_decision,p_actor,btrim(p_note));
END;
$$;
CREATE FUNCTION public.manage_cash_difference(p_id uuid,p_actor uuid,p_assignee uuid,p_due_at timestamptz,p_replacement uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.cash_differences; original public.cash_reconciliations; replacement public.cash_reconciliations;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); SELECT * INTO d FROM public.cash_differences WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Diferencia no encontrada'; END IF;
  IF d.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Diferencia ya resuelta'; END IF;
  IF p_replacement IS NULL THEN
    PERFORM private.assert_review_operator(p_assignee);
    IF p_due_at IS NULL OR p_due_at<=now() OR p_due_at>now()+interval '7 days' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Vencimiento entre ahora y siete días requerido'; END IF;
    UPDATE public.cash_differences SET assigned_to=p_assignee,due_at=p_due_at,reason=btrim(p_note) WHERE id=d.id;
  ELSE
    SELECT * INTO original FROM public.cash_reconciliations WHERE id=d.reconciliation_id;
    SELECT * INTO replacement FROM public.cash_reconciliations WHERE id=p_replacement;
    IF p_actor=original.created_by OR replacement.id IS NULL OR replacement.status<>'approved' OR replacement.created_at<=original.created_at OR replacement.observed_at<original.observed_at
      OR replacement.observed_at<=now()-interval '24 hours' OR EXISTS(SELECT 1 FROM public.cash_differences WHERE reconciliation_id=replacement.id) THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Revisor independiente y nueva conciliación aprobada sin diferencias requeridos'; END IF;
    UPDATE public.cash_differences SET resolved_by=p_actor,resolved_at=now(),replacement_id=p_replacement,resolution_note=btrim(p_note) WHERE id=d.id;
  END IF;
  INSERT INTO public.cash_events(target_id,action,actor_id,note,details) VALUES(d.id,CASE WHEN p_replacement IS NULL THEN 'difference.assigned' ELSE 'difference.resolved' END,p_actor,btrim(p_note),jsonb_build_object('replacement_id',p_replacement,'assigned_to',p_assignee,'due_at',p_due_at));
END;
$$;

CREATE FUNCTION private.guard_cash_checkout() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
  IF NEW.intent='tournament_registration' AND EXISTS(SELECT 1 FROM public.tournaments WHERE id=NEW.tournament_id AND entry_fee_cents>0 AND NOT is_test) THEN
    PERFORM pg_advisory_xact_lock(81010,10); s:=public.cash_status();
    IF NEW.charged_amount_cents IS NULL OR NEW.charged_amount_cents<=0 OR NOT (s->>'admissions_allowed')::boolean
      OR (s->>'exposure_cents')::bigint+NEW.charged_amount_cents>(s->>'max_exposure_cents')::bigint
      OR (s->>'required_reserve_cents')::bigint+NEW.charged_amount_cents>(s->>'available_bank_cents')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Cobros temporalmente pausados: reserva o conciliación pendiente'; END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_cash_checkout BEFORE INSERT ON public.flow_payment_attempts FOR EACH ROW EXECUTE FUNCTION private.guard_cash_checkout();
-- No cash gate on callbacks, refunds, existing registrations, withdrawals or practice.
-- Already-issued provider URLs remain externally payable and must still reconcile.
REVOKE ALL ON FUNCTION private.cash_operator(uuid,text),private.assert_cash_proof(uuid,text),private.cash_components(),private.guard_cash_checkout() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cash_status(),public.set_cash_policy(uuid,boolean,bigint,bigint,text),
  public.record_cash_movement(uuid,uuid,text,bigint,text,timestamptz,text,text),public.approve_cash_movement(uuid,uuid,text),
  public.capture_cash_reconciliation(uuid,uuid,timestamptz,bigint,bigint,bigint,bigint,text,text,text),public.review_cash_reconciliation(uuid,uuid,text,text),
  public.manage_cash_difference(uuid,uuid,uuid,timestamptz,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.cash_status(),public.set_cash_policy(uuid,boolean,bigint,bigint,text),
  public.record_cash_movement(uuid,uuid,text,bigint,text,timestamptz,text,text),public.approve_cash_movement(uuid,uuid,text),
  public.capture_cash_reconciliation(uuid,uuid,timestamptz,bigint,bigint,bigint,bigint,text,text,text),public.review_cash_reconciliation(uuid,uuid,text,text),
  public.manage_cash_difference(uuid,uuid,uuid,timestamptz,uuid,text) TO service_role;

CREATE FUNCTION public.read_cash_proof(p_actor uuid,p_path text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target uuid;
BEGIN
  PERFORM private.cash_operator(p_actor,'Consulta de evidencia de conciliación');
  SELECT id INTO target FROM public.cash_movements WHERE proof_path=p_path
    UNION ALL SELECT id FROM public.cash_reconciliations WHERE bank_proof_path=p_path OR flow_proof_path=p_path LIMIT 1;
  IF target IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Evidencia no encontrada'; END IF;
  PERFORM private.assert_cash_proof(target,p_path);
  INSERT INTO public.cash_events(target_id,action,actor_id,note) VALUES(target,'proof.read',p_actor,'Consulta de evidencia de conciliación');
  RETURN p_path;
END;
$$;
REVOKE ALL ON FUNCTION public.read_cash_proof(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_cash_proof(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.observe_operations(p_recipient text DEFAULT NULL,p_escalation_recipient text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cash jsonb; snapshot jsonb; conditions jsonb:='[]'; item jsonb; k text; level text; current_incident public.ops_incidents;
  heartbeat public.cron_heartbeats; active_keys text[]:='{}';
BEGIN
  -- Serialize observation, recovery and acknowledgement. Read financial sources INSIDE the lock.
  PERFORM pg_advisory_xact_lock(81009,9);
  -- A previously absent recipient may be configured later; no provider request was possible for these rows.
  UPDATE public.ops_notifications SET recipient=CASE WHEN stage='escalated' THEN p_escalation_recipient ELSE p_recipient END,
    state='pending',first_attempt_at=NULL,next_attempt_at=now(),last_error=NULL
    WHERE recipient IS NULL AND state='blocked' AND nullif(btrim(CASE WHEN stage='escalated' THEN p_escalation_recipient ELSE p_recipient END),'') IS NOT NULL;
  snapshot:=public.operational_snapshot();
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'queues') LOOP
    level:=NULL;
    IF (item->>'count')::bigint>0 THEN
      IF item->>'key'='failed-refunds' THEN level:='critical';
      ELSIF (item->>'oldest_at')::timestamptz<=now()-interval '30 minutes' THEN
        level:=CASE WHEN item->>'key' IN ('unknown-payments','pending-refunds','uncertain-withdrawals') THEN 'critical' ELSE 'attention' END;
      END IF;
    END IF;
    IF level IS NOT NULL THEN conditions:=conditions||jsonb_build_array(item||jsonb_build_object('severity',level)); END IF;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(snapshot->'checks') LOOP
    IF (item->>'count')::bigint>0 THEN conditions:=conditions||jsonb_build_array(item||jsonb_build_object('severity','critical')); END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['process-tournaments','flow-reconcile','reconcile-refunds'] LOOP
    SELECT * INTO heartbeat FROM public.cron_heartbeats WHERE job_name=k;
    IF NOT FOUND OR heartbeat.last_success_at IS NULL OR heartbeat.last_success_at<=now()-interval '15 minutes' OR heartbeat.consecutive_failures>=2 OR heartbeat.consecutive_dispatch_failures>=2 THEN
      conditions:=conditions||jsonb_build_array(jsonb_build_object('key','job:'||k,'title','Procesamiento sin éxito: '||k,
        'severity','critical','last_success_at',heartbeat.last_success_at,'last_run_at',heartbeat.last_run_at,
        'consecutive_failures',heartbeat.consecutive_failures,'dispatch_failures',heartbeat.consecutive_dispatch_failures,'href','/admin/operations'));
    END IF;
  END LOOP;
  -- A broken notification channel remains visible even if the financial condition recovered.
  IF EXISTS(SELECT 1 FROM public.ops_notifications WHERE state='blocked' OR
    (state IN ('pending','sending') AND created_at<=now()-interval '30 minutes')) THEN
    conditions:=conditions||jsonb_build_array(jsonb_build_object('key','notification-channel','title','Avisos operativos sin aceptación del proveedor',
      'severity','critical','href','/admin/operations'));
  END IF;
  cash:=public.cash_status();
  IF (cash->>'open_differences')::bigint>0 THEN
    conditions:=conditions||jsonb_build_array(jsonb_build_object('key','cash-differences','title','Diferencias de caja sin resolver','severity','critical','href','/admin/cash','count',cash->'open_differences'));
  END IF;
  IF (cash->>'shortfall_cents')::bigint>0 THEN
    conditions:=conditions||jsonb_build_array(jsonb_build_object('key','cash-deficit','title','Reserva bancaria insuficiente','severity','critical','href','/admin/cash','amount_cents',cash->'shortfall_cents'));
  END IF;
  IF NOT (cash->>'paused')::boolean AND (cash->>'reconciliation_at' IS NULL OR (cash->>'reconciliation_at')::timestamptz<=now()-interval '24 hours') THEN
    conditions:=conditions||jsonb_build_array(jsonb_build_object('key','cash-stale','title','Conciliación diaria ausente o vencida','severity','critical','href','/admin/cash'));
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(conditions) LOOP
    k:=item->>'key'; active_keys:=array_append(active_keys,k);
    SELECT * INTO current_incident FROM public.ops_incidents WHERE condition_key=k AND resolved_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO public.ops_incidents(condition_key,title,severity,details,critical_since)
        VALUES(k,item->>'title',item->>'severity',item,CASE WHEN item->>'severity'='critical' THEN now() END) RETURNING * INTO current_incident;
      INSERT INTO public.ops_incident_events(incident_id,action) VALUES(current_incident.id,'opened');
      PERFORM private.enqueue_ops_notification(current_incident.id,'opened',p_recipient);
    ELSE
      UPDATE public.ops_incidents SET last_seen_at=now(),details=item,
        severity=CASE WHEN current_incident.severity='critical' THEN 'critical' ELSE item->>'severity' END WHERE id=current_incident.id;
      IF current_incident.severity='attention' AND item->>'severity'='critical' THEN
        UPDATE public.ops_incidents SET acknowledged_by=NULL,acknowledged_at=NULL,acknowledgement_note=NULL,critical_since=now(),escalated_at=NULL WHERE id=current_incident.id;
        INSERT INTO public.ops_incident_events(incident_id,action) VALUES(current_incident.id,'critical');
        PERFORM private.enqueue_ops_notification(current_incident.id,'critical',p_recipient);
        SELECT * INTO current_incident FROM public.ops_incidents WHERE id=current_incident.id;
      END IF;
    END IF;
    IF current_incident.severity='critical' AND current_incident.acknowledged_at IS NULL AND current_incident.escalated_at IS NULL
      AND COALESCE(current_incident.critical_since,current_incident.first_seen_at)<=now()-interval '30 minutes' THEN
      UPDATE public.ops_incidents SET escalated_at=now() WHERE id=current_incident.id;
      INSERT INTO public.ops_incident_events(incident_id,action) VALUES(current_incident.id,'escalated');
      PERFORM private.enqueue_ops_notification(current_incident.id,'escalated',p_escalation_recipient);
    END IF;
  END LOOP;
  FOR current_incident IN SELECT * FROM public.ops_incidents WHERE resolved_at IS NULL AND NOT(condition_key=ANY(active_keys)) FOR UPDATE LOOP
    UPDATE public.ops_incidents SET resolved_at=now(),last_seen_at=now() WHERE id=current_incident.id;
    INSERT INTO public.ops_incident_events(incident_id,action) VALUES(current_incident.id,'recovered');
    PERFORM private.enqueue_ops_notification(current_incident.id,'recovered',p_recipient);
  END LOOP;
  RETURN snapshot||jsonb_build_object('active_incidents',(SELECT count(*) FROM public.ops_incidents WHERE resolved_at IS NULL));
END;
$$;
-- Explicit accounting correction, never inferred from an unexplained difference.
-- A later clean independently approved cut is still required to resolve the incident.
CREATE FUNCTION public.correct_flow_fee_difference(p_id uuid,p_actor uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.cash_differences; r public.cash_reconciliations; current_book bigint; journal bigint; amount bigint;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note);
  SELECT * INTO d FROM public.cash_differences WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR d.source<>'flow' OR d.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Diferencia Flow abierta requerida'; END IF;
  SELECT * INTO r FROM public.cash_reconciliations WHERE id=d.reconciliation_id;
  IF p_actor=r.created_by THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Otro operador debe comprobar las comisiones reales'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries WHERE event_key='cash.flow-fee-correction:'||d.id) THEN RETURN; END IF;
  PERFORM private.assert_cash_proof(r.id,r.flow_proof_path);
  current_book:=(private.cash_components()->>'flow_book_cents')::bigint;
  IF r.observed_at<=now()-interval '24 hours' OR current_book IS DISTINCT FROM (r.snapshot->>'flow_book_cents')::bigint THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Saldo Flow cambió: preparar un nuevo corte'; END IF;
  amount:=abs(d.difference_cents);
  journal:=private.post_accounting_entry('cash.flow-fee-correction:'||d.id,'flow_fee_reconciliation','cash_differences',d.id,NULL,NULL,now(),p_note,
    jsonb_build_array(jsonb_build_object('account_code','110200','debit_cents',CASE WHEN d.difference_cents>0 THEN amount ELSE 0 END,'credit_cents',CASE WHEN d.difference_cents<0 THEN amount ELSE 0 END),
      jsonb_build_object('account_code','520100','debit_cents',CASE WHEN d.difference_cents<0 THEN amount ELSE 0 END,'credit_cents',CASE WHEN d.difference_cents>0 THEN amount ELSE 0 END)),
    false,jsonb_build_object('reconciliation_id',r.id,'proof_path',r.flow_proof_path,'difference_cents',d.difference_cents,'reviewed_by',p_actor));
  INSERT INTO public.cash_events(target_id,action,actor_id,note,details) VALUES(d.id,'flow.fees.corrected',p_actor,p_note,jsonb_build_object('journal_id',journal,'difference_cents',d.difference_cents));
END;
$$;
REVOKE ALL ON FUNCTION public.correct_flow_fee_difference(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.correct_flow_fee_difference(uuid,uuid,text) TO service_role;

CREATE FUNCTION private.guard_cash_publication() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb; added bigint; previous bigint:=0;
BEGIN
  IF NEW.is_test OR (NEW.entry_fee_cents<=0 AND NEW.prize_1st_cents+NEW.prize_2nd_cents+NEW.prize_3rd_cents<=0) OR NEW.status NOT IN ('scheduled','open','live','finalizing') THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND NOT OLD.is_test AND OLD.status IN ('scheduled','open','live','finalizing') THEN
    previous:=OLD.prize_1st_cents+OLD.prize_2nd_cents+OLD.prize_3rd_cents;
  END IF;
  added:=NEW.prize_1st_cents+NEW.prize_2nd_cents+NEW.prize_3rd_cents-previous;
  IF TG_OP='UPDATE' AND NOT OLD.is_test AND OLD.status IN ('scheduled','open','live','finalizing') AND added<=0 AND (OLD.entry_fee_cents>0 OR NEW.entry_fee_cents<=0) THEN RETURN NEW; END IF;
  PERFORM pg_advisory_xact_lock(81010,10); s:=public.cash_status();
  IF NOT (s->>'admissions_allowed')::boolean OR (s->>'exposure_cents')::bigint+greatest(0,added)>(s->>'max_exposure_cents')::bigint
    OR (s->>'required_reserve_cents')::bigint+greatest(0,added)>(s->>'available_bank_cents')::bigint THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Publicación pagada pausada: conciliar y financiar reserva';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER guard_cash_publication BEFORE INSERT OR UPDATE OF status,is_test,entry_fee_cents,prize_1st_cents,prize_2nd_cents,prize_3rd_cents ON public.tournaments
  FOR EACH ROW EXECUTE FUNCTION private.guard_cash_publication();
REVOKE ALL ON FUNCTION private.guard_cash_publication() FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.reject_cash_movement(p_id uuid,p_actor uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE m public.cash_movements;
BEGIN
  PERFORM private.cash_operator(p_actor,p_note); SELECT * INTO m FROM public.cash_movements WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Movimiento no encontrado'; END IF;
  IF p_actor=m.created_by THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Revisor independiente requerido'; END IF;
  IF m.approved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Movimiento aprobado: requiere reversión contable respaldada'; END IF;
  IF m.rejected_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.cash_movements SET rejected_at=now(),rejected_by=p_actor,rejection_note=p_note WHERE id=m.id;
  INSERT INTO public.cash_events(target_id,action,actor_id,note) VALUES(m.id,'movement.rejected',p_actor,p_note);
END;
$$;
REVOKE ALL ON FUNCTION public.reject_cash_movement(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reject_cash_movement(uuid,uuid,text) TO service_role;

COMMIT;
