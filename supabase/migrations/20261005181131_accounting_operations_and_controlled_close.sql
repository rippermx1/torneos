-- Contabilidad administrativa. No emite DTE ni importa servicios externos.
BEGIN;
ALTER TABLE public.flow_refund_attempts ADD COLUMN tax_document_evidence text, ADD COLUMN tax_document_verified_by uuid REFERENCES auth.users(id), ADD COLUMN tax_document_verified_at timestamptz;
-- Preserve original adapters; suppress practice sources before they reach the journal.
ALTER FUNCTION private.post_flow_payment(uuid) RENAME TO post_flow_payment_unfiltered;
CREATE FUNCTION private.post_flow_payment(p_attempt_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.flow_payment_attempts a JOIN public.tournaments t ON t.id=a.tournament_id WHERE a.id=p_attempt_id AND t.is_test) THEN RETURN; END IF;
 PERFORM private.post_flow_payment_unfiltered(p_attempt_id);
END $$;
ALTER FUNCTION private.post_flow_refund(uuid) RENAME TO post_flow_refund_unfiltered;
CREATE FUNCTION private.post_flow_refund(p_refund_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.flow_refund_attempts r JOIN public.tournaments t ON t.id=r.tournament_id WHERE r.id=p_refund_id AND t.is_test) THEN RETURN; END IF;
 PERFORM private.post_flow_refund_unfiltered(p_refund_id);
END $$;
REVOKE ALL ON FUNCTION private.post_flow_payment(uuid),private.post_flow_refund(uuid) FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION private.post_refund_credit_note(uuid) RENAME TO post_refund_credit_note_unfiltered;
CREATE FUNCTION private.post_refund_credit_note(p_refund_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.flow_refund_attempts r JOIN public.flow_payment_attempts a ON a.id=r.flow_payment_attempt_id LEFT JOIN public.tournaments t ON t.id=r.tournament_id WHERE r.id=p_refund_id AND a.payment_method IS DISTINCT FROM 'simulation' AND NOT COALESCE(t.is_test,false)) THEN RETURN; END IF;
 PERFORM private.post_refund_credit_note_unfiltered(p_refund_id);
END $$;
REVOKE ALL ON FUNCTION private.post_refund_credit_note(uuid) FROM PUBLIC,anon,authenticated,service_role;
INSERT INTO public.accounting_accounts(code,name,category,normal_balance) VALUES
 ('210400','Proveedores por pagar','liability','credit'),
 ('310200','Aportes del propietario','equity','credit'),
 ('410300','Otros ingresos documentados','revenue','credit'),
 ('530100','Hosting y herramientas','expense','debit'),
 ('530200','Publicidad','expense','debit'),
 ('530300','Servicios profesionales','expense','debit'),
 ('530400','Otros gastos documentados','expense','debit') ON CONFLICT DO NOTHING;

CREATE TABLE public.accounting_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('expense','contribution','settlement','commission','supplier_payment','adjustment','other_revenue')),
 reference text NOT NULL, counterparty text NOT NULL, evidence text NOT NULL,
 tax_verified boolean NOT NULL, occurred_at timestamptz NOT NULL,
 journal_entry_id bigint NOT NULL UNIQUE REFERENCES public.accounting_journal_entries(id),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 payload jsonb NOT NULL, UNIQUE(kind,counterparty,reference)
);
CREATE TABLE public.accounting_bank_movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text NOT NULL, reference text NOT NULL UNIQUE,
 occurred_at timestamptz NOT NULL, amount_cents bigint NOT NULL CHECK(amount_cents <> 0 AND abs(amount_cents)<=1000000000000),
 evidence text NOT NULL, journal_entry_id bigint UNIQUE REFERENCES public.accounting_journal_entries(id),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.accounting_period_closes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), period text NOT NULL CHECK(period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 version integer NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 snapshot jsonb NOT NULL, digest text NOT NULL, reason text NOT NULL,
 reopened_at timestamptz, reopened_by uuid REFERENCES auth.users(id), reopen_reason text,
 UNIQUE(period,version)
);
CREATE TABLE public.accounting_bank_matches (
 bank_id uuid NOT NULL REFERENCES public.accounting_bank_movements(id),
 journal_entry_id bigint PRIMARY KEY REFERENCES public.accounting_journal_entries(id)
);
CREATE UNIQUE INDEX accounting_one_active_close ON public.accounting_period_closes(period) WHERE reopened_at IS NULL;
CREATE TABLE public.accounting_operation_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, action text NOT NULL, actor uuid NOT NULL REFERENCES auth.users(id),
 payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.accounting_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_period_closes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_operation_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounting_bank_matches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.accounting_bank_matches FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.accounting_bank_matches TO service_role;
REVOKE ALL ON public.accounting_documents,public.accounting_bank_movements,public.accounting_period_closes,public.accounting_operation_audit FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.accounting_documents,public.accounting_bank_movements,public.accounting_period_closes,public.accounting_operation_audit TO service_role;
CREATE TRIGGER accounting_documents_immutable BEFORE UPDATE OR DELETE ON public.accounting_documents FOR EACH ROW EXECUTE FUNCTION private.prevent_accounting_mutation();
CREATE TRIGGER accounting_operation_audit_immutable BEFORE UPDATE OR DELETE ON public.accounting_operation_audit FOR EACH ROW EXECUTE FUNCTION private.prevent_accounting_mutation();
CREATE FUNCTION private.protect_accounting_close() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.period IS DISTINCT FROM OLD.period OR NEW.version IS DISTINCT FROM OLD.version OR NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.digest IS DISTINCT FROM OLD.digest OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.reason IS DISTINCT FROM OLD.reason OR OLD.reopened_at IS NOT NULL THEN RAISE EXCEPTION 'Paquete de cierre inmutable'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER accounting_close_immutable BEFORE UPDATE OR DELETE ON public.accounting_period_closes FOR EACH ROW EXECUTE FUNCTION private.protect_accounting_close();
REVOKE ALL ON FUNCTION private.protect_accounting_close() FROM PUBLIC,anon,authenticated,service_role;

-- Shared lock for automatic journal writers; exclusive lock for package/close.
-- Held to transaction end: a snapshot cannot include half a concurrent entry.
CREATE FUNCTION private.guard_accounting_period() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_period text;
BEGIN
 PERFORM pg_advisory_xact_lock_shared(70420261005);
 v_period := NEW.period;
 IF EXISTS(SELECT 1 FROM public.accounting_period_closes WHERE period=v_period AND reopened_at IS NULL) THEN
  RAISE EXCEPTION 'Período % cerrado; reabra con motivo antes de registrar ajustes',v_period;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER accounting_period_guard BEFORE INSERT ON public.accounting_journal_entries FOR EACH ROW EXECUTE FUNCTION private.guard_accounting_period();
CREATE TRIGGER accounting_bank_period_guard BEFORE INSERT OR UPDATE OR DELETE ON public.accounting_bank_movements FOR EACH ROW EXECUTE FUNCTION private.guard_accounting_period();

CREATE FUNCTION private.accounting_package(p_period text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_period IS NOT NULL AND p_period !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'Período inválido'; END IF;
 PERFORM pg_advisory_xact_lock(70420261005);
 WITH balances AS (
  SELECT a.code,a.name,a.category,a.normal_balance,
   COALESCE(sum((p.debit_cents-p.credit_cents)*CASE WHEN a.normal_balance='debit' THEN 1 ELSE -1 END) FILTER(WHERE e.period<p_period),0)::bigint opening_cents,
   COALESCE(sum(p.debit_cents) FILTER(WHERE p_period IS NULL OR e.period=p_period),0)::bigint debit_cents,
   COALESCE(sum(p.credit_cents) FILTER(WHERE p_period IS NULL OR e.period=p_period),0)::bigint credit_cents,
   COALESCE(sum((p.debit_cents-p.credit_cents)*CASE WHEN a.normal_balance='debit' THEN 1 ELSE -1 END) FILTER(WHERE p_period IS NULL OR e.period<=p_period),0)::bigint closing_cents
  FROM public.accounting_accounts a LEFT JOIN public.accounting_postings p ON p.account_code=a.code
  LEFT JOIN public.accounting_journal_entries e ON e.id=p.journal_entry_id
  GROUP BY a.code
 ), lines AS (SELECT * FROM public.accounting_journal_lines WHERE p_period IS NULL OR period=p_period),
 bank_entries AS (
  SELECT e.id,e.period,sum(p.debit_cents-p.credit_cents) amount
  FROM public.accounting_journal_entries e JOIN public.accounting_postings p ON p.journal_entry_id=e.id
  WHERE NOT e.is_estimate AND p.account_code='110100' AND (p_period IS NULL OR e.period=p_period)
  GROUP BY e.id HAVING sum(p.debit_cents-p.credit_cents)<>0
 )
 SELECT jsonb_build_object(
  'period',p_period,'generated_at',clock_timestamp(),
  'lines',COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.occurred_at,l.journal_entry_id,l.posting_id) FROM lines l),'[]'),
  'entries',COALESCE((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.occurred_at,e.id) FROM public.accounting_journal_entries e WHERE p_period IS NULL OR e.period=p_period),'[]'),
  'balances',COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.code) FROM balances b),'[]'),
  'accounts',(SELECT jsonb_agg(jsonb_build_object('code',code,'name',name,'category',category,'normal_balance',normal_balance) ORDER BY code) FROM public.accounting_accounts WHERE is_active),
  'documents',COALESCE((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.occurred_at,d.id) FROM public.accounting_documents d WHERE p_period IS NULL OR d.period=p_period),'[]'),
  'audit',COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM public.accounting_operation_audit a),'[]'),
  'bank',COALESCE((SELECT jsonb_agg(to_jsonb(b)||jsonb_build_object('journal_entry_ids',COALESCE((SELECT jsonb_agg(m.journal_entry_id ORDER BY m.journal_entry_id) FROM public.accounting_bank_matches m WHERE m.bank_id=b.id),'[]')) ORDER BY b.occurred_at,b.id) FROM public.accounting_bank_movements b WHERE p_period IS NULL OR b.period=p_period),'[]'),
  'closes',COALESCE((SELECT jsonb_agg(to_jsonb(c)-'snapshot' ORDER BY c.period DESC,c.version DESC) FROM public.accounting_period_closes c WHERE p_period IS NULL OR c.period=p_period),'[]'),
  'result_cents',COALESCE((SELECT sum(CASE WHEN a.category='revenue' THEN l.credit_cents-l.debit_cents WHEN a.category='expense' THEN l.credit_cents-l.debit_cents ELSE 0 END) FROM lines l JOIN public.accounting_accounts a ON a.code=l.account_code),0),
  'bank_opening_cents',COALESCE((SELECT opening_cents FROM balances WHERE code='110100'),0),
  'bank_closing_cents',COALESCE((SELECT closing_cents FROM balances WHERE code='110100'),0),
  'flow_closing_cents',COALESCE((SELECT closing_cents FROM balances WHERE code='110200'),0),
  'controls',jsonb_build_object(
   'unmatched_bank',(SELECT count(*) FROM public.accounting_bank_movements WHERE journal_entry_id IS NULL AND (p_period IS NULL OR period=p_period)),
   'unmatched_journal',(SELECT count(*) FROM bank_entries e WHERE NOT EXISTS(SELECT 1 FROM public.accounting_bank_matches m WHERE m.journal_entry_id=e.id)),
   'pending_credit_notes',(SELECT count(*) FROM public.flow_refund_attempts r JOIN public.flow_payment_attempts a ON a.id=r.flow_payment_attempt_id LEFT JOIN public.tournaments t ON t.id=r.tournament_id WHERE r.status='completed' AND a.payment_method IS DISTINCT FROM 'simulation' AND NOT COALESCE(t.is_test,false) AND (r.tax_document_status<>'issued' OR r.tax_document_verified_at IS NULL) AND (p_period IS NULL OR to_char(COALESCE(r.settled_at,r.created_at) AT TIME ZONE 'America/Santiago','YYYY-MM')<=p_period)),
   'estimates_cents',(SELECT COALESCE(sum(abs(s.amount)),0) FROM (
    SELECT p.account_code,sum(p.debit_cents-p.credit_cents) amount FROM public.accounting_postings p JOIN public.accounting_journal_entries e ON e.id=p.journal_entry_id
    WHERE e.is_estimate AND (p_period IS NULL OR e.period<=p_period) GROUP BY p.account_code) s)
  )
 ) INTO v_result;
 RETURN v_result;
END $$;

CREATE FUNCTION private.accounting_operate(p_action text,p_payload jsonb,p_actor uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_id uuid; v_entry bigint; v_period text; v_at timestamptz; v_existing public.accounting_documents%ROWTYPE;
 v_kind text; v_reference text; v_party text; v_evidence text; v_lines jsonb; v_result jsonb;
 v_source public.accounting_journal_entries%ROWTYPE; v_close public.accounting_period_closes%ROWTYPE;
 v_snapshot jsonb; v_bank public.accounting_bank_movements%ROWTYPE; v_amount bigint; v_ids bigint[];
BEGIN
 PERFORM pg_advisory_xact_lock(70420261005);
 IF NOT EXISTS(SELECT 1 FROM public.profile_roles WHERE profile_id=p_actor AND role IN ('admin','owner')) THEN RAISE EXCEPTION 'Administrador requerido'; END IF;
 IF jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
 IF p_action='credit_note' THEN
  v_at:=(p_payload->>'issued_at')::timestamptz;
  IF EXISTS(SELECT 1 FROM public.flow_refund_attempts WHERE id=(p_payload->>'id')::uuid AND tax_document_status='issued' AND (tax_document_number IS DISTINCT FROM p_payload->>'number' OR (tax_document_issued_at AT TIME ZONE 'America/Santiago')::date IS DISTINCT FROM (v_at AT TIME ZONE 'America/Santiago')::date)) THEN RAISE EXCEPTION 'La N/C ya asentada conserva su folio y fecha; verifique el original'; END IF;
  SELECT COALESCE((SELECT tax_document_issued_at FROM public.flow_refund_attempts WHERE id=(p_payload->>'id')::uuid AND tax_document_status='issued'),v_at) INTO v_at;
  v_period:=to_char(v_at AT TIME ZONE 'America/Santiago','YYYY-MM');
  IF v_at IS NULL OR v_at>now()+interval '1 day' OR COALESCE(length(trim(p_payload->>'number')),0) NOT BETWEEN 1 AND 80 OR COALESCE(length(trim(p_payload->>'evidence')),0) NOT BETWEEN 3 AND 500 OR NOT COALESCE((p_payload->>'verified')::boolean,false) THEN RAISE EXCEPTION 'Folio, fecha, respaldo y verificación de N/C requeridos'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_period_closes WHERE period=v_period AND reopened_at IS NULL) THEN RAISE EXCEPTION 'Período cerrado; reabra antes de verificar N/C'; END IF;
  UPDATE public.flow_refund_attempts r SET tax_document_status='issued',tax_document_number=p_payload->>'number',tax_document_issued_at=v_at,tax_document_notes=p_payload->>'notes',tax_document_evidence=p_payload->>'evidence',tax_document_verified_by=p_actor,tax_document_verified_at=now()
  WHERE r.id=(p_payload->>'id')::uuid AND r.status='completed' AND r.tax_document_verified_at IS NULL AND EXISTS(SELECT 1 FROM public.flow_payment_attempts a WHERE a.id=r.flow_payment_attempt_id AND a.payment_method IS DISTINCT FROM 'simulation') RETURNING r.id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Devolución no disponible o N/C ya verificada'; END IF;
  v_result:=jsonb_build_object('id',v_id);
 ELSIF p_action='document' THEN
  v_kind:=p_payload->>'kind'; v_reference:=trim(p_payload->>'reference'); v_party:=trim(p_payload->>'counterparty'); v_evidence:=trim(p_payload->>'evidence');
  v_at:=(p_payload->>'occurred_at')::timestamptz; v_lines:=p_payload->'postings';
  IF v_kind IS NULL OR v_kind NOT IN ('expense','contribution','settlement','commission','supplier_payment','adjustment','other_revenue') OR COALESCE(length(v_reference),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(v_party),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(v_evidence),0) NOT BETWEEN 3 AND 500 OR v_at IS NULL OR v_at>now() THEN RAISE EXCEPTION 'Documento incompleto o fecha futura'; END IF;
  SELECT * INTO v_existing FROM public.accounting_documents WHERE kind=v_kind AND counterparty=v_party AND reference=v_reference;
  IF FOUND THEN
   IF v_existing.payload<>p_payload THEN RAISE EXCEPTION 'Referencia ya registrada con otro contenido'; END IF;
   RETURN jsonb_build_object('id',v_existing.id,'journal_entry_id',v_existing.journal_entry_id,'duplicate',true);
  END IF;
  IF jsonb_typeof(v_lines)<>'array' OR jsonb_array_length(v_lines) NOT BETWEEN 2 AND 20 THEN RAISE EXCEPTION 'Partidas inválidas'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(v_lines) x(account_code text,debit_cents numeric,credit_cents numeric) LEFT JOIN public.accounting_accounts a ON a.code=x.account_code WHERE a.code IS NULL OR NOT a.is_active OR x.debit_cents IS NULL OR x.credit_cents IS NULL OR x.debit_cents<>trunc(x.debit_cents) OR x.credit_cents<>trunc(x.credit_cents) OR greatest(x.debit_cents,x.credit_cents)>1000000000000) THEN RAISE EXCEPTION 'Cuenta o monto inválido'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_lines) x WHERE x->>'account_code'='110300') AND NOT COALESCE((p_payload->>'tax_verified')::boolean,false) THEN RAISE EXCEPTION 'Crédito IVA requiere documento verificado contra RCV'; END IF;
  -- Preset semantics are enforced in SQL too; a modified browser cannot label
  -- revenue or capital as an expense. Explicit adjustments remain available.
  IF EXISTS(SELECT 1 FROM jsonb_to_recordset(v_lines) x(account_code text,debit_cents bigint,credit_cents bigint) WHERE
   (v_kind='expense' AND ((x.debit_cents>0 AND x.account_code NOT IN ('530100','530200','530300','530400','110300')) OR (x.credit_cents>0 AND x.account_code NOT IN ('110100','210400')))) OR
   (v_kind='commission' AND ((x.debit_cents>0 AND x.account_code NOT IN ('520100','520200','110300')) OR (x.credit_cents>0 AND x.account_code<>'110200'))) OR
   (v_kind='contribution' AND ((x.debit_cents>0 AND x.account_code<>'110100') OR (x.credit_cents>0 AND x.account_code<>'310200'))) OR
   (v_kind='settlement' AND ((x.debit_cents>0 AND x.account_code<>'110100') OR (x.credit_cents>0 AND x.account_code<>'110200'))) OR
   (v_kind='supplier_payment' AND ((x.debit_cents>0 AND x.account_code<>'210400') OR (x.credit_cents>0 AND x.account_code<>'110100'))) OR
   (v_kind='other_revenue' AND ((x.debit_cents>0 AND x.account_code<>'110100') OR (x.credit_cents>0 AND x.account_code NOT IN ('410300','210100'))))) THEN RAISE EXCEPTION 'Cuentas incompatibles con tipo de documento'; END IF;
  IF v_kind='commission' THEN
   IF NOT COALESCE((p_payload->>'tax_verified')::boolean,false) OR jsonb_typeof(p_payload->'estimate_entry_ids')<>'array' OR jsonb_array_length(p_payload->'estimate_entry_ids')=0 THEN RAISE EXCEPTION 'Factura Flow requiere verificación y estimaciones a reemplazar'; END IF;
   FOR v_source IN SELECT e.* FROM public.accounting_journal_entries e WHERE e.id IN (SELECT value::bigint FROM jsonb_array_elements_text(p_payload->'estimate_entry_ids')) LOOP
    IF NOT v_source.is_estimate OR v_source.event_type NOT IN ('flow_fee_estimate','flow_refund_fee_estimate') OR EXISTS(SELECT 1 FROM public.accounting_journal_entries WHERE event_key='estimate_reversal:'||v_source.id) THEN RAISE EXCEPTION 'Estimación inválida o ya reemplazada: %',v_source.id; END IF;
    SELECT jsonb_agg(jsonb_build_object('account_code',account_code,'debit_cents',credit_cents,'credit_cents',debit_cents)) INTO v_snapshot FROM public.accounting_postings WHERE journal_entry_id=v_source.id;
    PERFORM private.post_accounting_entry('estimate_reversal:'||v_source.id,'estimate_reversal','accounting_journal_entries',null,null,null,v_at,'Reversa de provisión Flow: '||v_reference,v_snapshot,true,jsonb_build_object('reverses_entry',v_source.id,'actor',p_actor));
   END LOOP;
   IF (SELECT count(*) FROM public.accounting_journal_entries WHERE id IN (SELECT value::bigint FROM jsonb_array_elements_text(p_payload->'estimate_entry_ids')))<>jsonb_array_length(p_payload->'estimate_entry_ids') THEN RAISE EXCEPTION 'IDs de estimaciones inexistentes o repetidos'; END IF;
  ELSIF p_payload ? 'estimate_entry_ids' AND jsonb_array_length(p_payload->'estimate_entry_ids')>0 THEN RAISE EXCEPTION 'Sólo una factura Flow reemplaza estimaciones'; END IF;
  v_id:=gen_random_uuid(); v_period:=to_char(v_at AT TIME ZONE 'America/Santiago','YYYY-MM');
  v_entry:=private.post_accounting_entry('document:'||v_id,v_kind,'accounting_documents',v_id,null,p_actor,v_at,v_kind||': '||v_party||' / '||v_reference,v_lines,false,jsonb_build_object('evidence',v_evidence,'tax_verified',COALESCE((p_payload->>'tax_verified')::boolean,false)));
  INSERT INTO public.accounting_documents(id,period,kind,reference,counterparty,evidence,tax_verified,occurred_at,journal_entry_id,created_by,payload) VALUES(v_id,v_period,v_kind,v_reference,v_party,v_evidence,COALESCE((p_payload->>'tax_verified')::boolean,false),v_at,v_entry,p_actor,p_payload);
  v_result:=jsonb_build_object('id',v_id,'journal_entry_id',v_entry);
 ELSIF p_action='bank_import' THEN
  IF jsonb_typeof(p_payload->'rows')<>'array' OR jsonb_array_length(p_payload->'rows') NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Importe entre 1 y 1000 movimientos por archivo'; END IF;
  FOR v_snapshot IN SELECT value FROM jsonb_array_elements(p_payload->'rows') LOOP
   v_at:=(v_snapshot->>'occurred_at')::timestamptz; v_reference:=trim(v_snapshot->>'reference'); v_evidence:=trim(v_snapshot->>'evidence');
   IF COALESCE(v_snapshot->>'amount_cents','') !~ '^-?[0-9]+$' THEN RAISE EXCEPTION 'Monto bancario debe ser centavos enteros'; END IF;
   v_amount:=(v_snapshot->>'amount_cents')::bigint;
   IF v_at IS NULL OR v_at>now() OR COALESCE(length(v_reference),0) NOT BETWEEN 1 AND 160 OR COALESCE(length(v_evidence),0) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Movimiento sin fecha/referencia/respaldo'; END IF;
   SELECT * INTO v_bank FROM public.accounting_bank_movements WHERE reference=v_reference;
   IF FOUND THEN
    IF v_bank.occurred_at<>v_at OR v_bank.amount_cents<>v_amount OR v_bank.evidence<>v_evidence THEN RAISE EXCEPTION 'Referencia bancaria repetida con diferencia'; END IF;
   ELSE
    INSERT INTO public.accounting_bank_movements(period,reference,occurred_at,amount_cents,evidence,created_by) VALUES(to_char(v_at AT TIME ZONE 'America/Santiago','YYYY-MM'),v_reference,v_at,v_amount,v_evidence,p_actor);
   END IF;
  END LOOP;
  v_result:=jsonb_build_object('imported_or_existing',jsonb_array_length(p_payload->'rows'));
 ELSIF p_action='match' THEN
  SELECT * INTO STRICT v_bank FROM public.accounting_bank_movements WHERE id=(p_payload->>'bank_id')::uuid;
  SELECT array_agg(value::bigint) INTO v_ids FROM jsonb_array_elements_text(COALESCE(p_payload->'journal_entry_ids',jsonb_build_array(p_payload->'journal_entry_id')));
  IF COALESCE(array_length(v_ids,1),0) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT x) FROM unnest(v_ids) x)<>array_length(v_ids,1) THEN RAISE EXCEPTION 'Asientos inválidos o repetidos'; END IF;
  IF (SELECT count(*) FROM public.accounting_journal_entries WHERE id=ANY(v_ids) AND NOT is_estimate AND period=v_bank.period)<>array_length(v_ids,1) OR EXISTS(SELECT 1 FROM unnest(v_ids) id WHERE NOT EXISTS(SELECT 1 FROM public.accounting_postings p WHERE p.journal_entry_id=id AND p.account_code='110100')) THEN RAISE EXCEPTION 'Asientos inexistentes, estimados, sin Banco o de otro período'; END IF;
  SELECT COALESCE(sum(debit_cents-credit_cents),0) INTO v_amount FROM public.accounting_postings WHERE journal_entry_id=ANY(v_ids) AND account_code='110100';
  IF v_amount<>v_bank.amount_cents THEN RAISE EXCEPTION 'Importe bancario no coincide con los asientos'; END IF;
  IF v_bank.journal_entry_id IS NOT NULL THEN RAISE EXCEPTION 'Movimiento ya conciliado; deshaga con motivo'; END IF;
  INSERT INTO public.accounting_bank_matches(bank_id,journal_entry_id) SELECT v_bank.id,unnest(v_ids);
  UPDATE public.accounting_bank_movements SET journal_entry_id=v_ids[1] WHERE id=v_bank.id;
  v_result:=jsonb_build_object('bank_id',v_bank.id,'journal_entry_ids',v_ids);
 ELSIF p_action='unmatch' THEN
  IF COALESCE(length(trim(p_payload->>'reason')),0)<10 THEN RAISE EXCEPTION 'Explique el motivo de deshacer la conciliación'; END IF;
  UPDATE public.accounting_bank_movements SET journal_entry_id=null WHERE id=(p_payload->>'bank_id')::uuid RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'Movimiento inexistente'; END IF;
  DELETE FROM public.accounting_bank_matches WHERE bank_id=v_id;
  v_result:=jsonb_build_object('bank_id',v_id);
 ELSIF p_action='reverse' THEN
  IF COALESCE(length(trim(p_payload->>'reason')),0)<10 THEN RAISE EXCEPTION 'Explique la corrección'; END IF;
  SELECT * INTO STRICT v_source FROM public.accounting_journal_entries WHERE id=(p_payload->>'journal_entry_id')::bigint;
  IF v_source.is_estimate OR v_source.source_table<>'accounting_documents' THEN RAISE EXCEPTION 'Corrija eventos operativos en su flujo; sólo documentos manuales admiten reversa aquí'; END IF;
  v_at:=(p_payload->>'occurred_at')::timestamptz;
  IF v_at IS NULL OR v_at>now() THEN RAISE EXCEPTION 'Fecha de corrección inválida'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries WHERE event_key='manual_reversal:'||v_source.id) THEN RAISE EXCEPTION 'Documento ya reversado'; END IF;
  SELECT jsonb_agg(jsonb_build_object('account_code',account_code,'debit_cents',credit_cents,'credit_cents',debit_cents)) INTO v_lines FROM public.accounting_postings WHERE journal_entry_id=v_source.id;
  v_entry:=private.post_accounting_entry('manual_reversal:'||v_source.id,'manual_reversal','accounting_documents',v_source.source_id,null,p_actor,v_at,p_payload->>'reason',v_lines,false,jsonb_build_object('reverses_entry',v_source.id,'actor',p_actor));
  IF v_source.event_type='commission' THEN
   SELECT * INTO STRICT v_existing FROM public.accounting_documents WHERE journal_entry_id=v_source.id;
   FOR v_source IN SELECT e.* FROM public.accounting_journal_entries e WHERE e.id IN(SELECT value::bigint FROM jsonb_array_elements_text(v_existing.payload->'estimate_entry_ids')) LOOP
    SELECT jsonb_agg(jsonb_build_object('account_code',account_code,'debit_cents',debit_cents,'credit_cents',credit_cents)) INTO v_lines FROM public.accounting_postings WHERE journal_entry_id=v_source.id;
    PERFORM private.post_accounting_entry('estimate_restored:'||v_existing.id||':'||v_source.id,v_source.event_type,'accounting_documents',v_existing.id,null,p_actor,v_at,'Provisión restaurada al reversar factura Flow',v_lines,true,jsonb_build_object('restores_entry',v_source.id,'actor',p_actor));
   END LOOP;
  END IF;
  v_result:=jsonb_build_object('journal_entry_id',v_entry);
 ELSIF p_action='close' THEN
  v_period:=p_payload->>'period'; v_snapshot:=private.accounting_package(v_period);
  IF v_period IS NULL OR v_period>=to_char(now() AT TIME ZONE 'America/Santiago','YYYY-MM') THEN RAISE EXCEPTION 'Sólo se cierran meses terminados'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_period_closes WHERE period>=v_period AND reopened_at IS NULL) THEN RAISE EXCEPTION 'Período ya cerrado o existe un cierre posterior'; END IF;
  IF EXISTS(SELECT DISTINCT e.period FROM public.accounting_journal_entries e WHERE e.period<v_period AND NOT EXISTS(SELECT 1 FROM public.accounting_period_closes c WHERE c.period=e.period AND c.reopened_at IS NULL)) THEN RAISE EXCEPTION 'Cierre primero los períodos anteriores con movimientos'; END IF;
  IF (v_snapshot->'controls'->>'unmatched_bank')::bigint<>0 OR (v_snapshot->'controls'->>'unmatched_journal')::bigint<>0 OR (v_snapshot->'controls'->>'pending_credit_notes')::bigint<>0 OR (v_snapshot->'controls'->>'estimates_cents')::bigint<>0 THEN RAISE EXCEPTION 'Cierre bloqueado: banco, notas de crédito o estimaciones pendientes'; END IF;
  IF COALESCE(length(trim(p_payload->>'reason')),0)<10 OR COALESCE(length(trim(p_payload->>'bank_evidence')),0)<3 OR COALESCE(length(trim(p_payload->>'flow_evidence')),0)<3 OR COALESCE(length(trim(p_payload->>'rcv_evidence')),0)<3 OR NOT COALESCE((p_payload->>'reviewed')::boolean,false) THEN RAISE EXCEPTION 'Requiere revisión y referencias a cartola, saldo Flow y RCV (incluso sin actividad)'; END IF;
  IF (p_payload->>'bank_opening_cents')::numeric IS DISTINCT FROM (v_snapshot->>'bank_opening_cents')::numeric OR (p_payload->>'bank_closing_cents')::numeric IS DISTINCT FROM (v_snapshot->>'bank_closing_cents')::numeric OR (p_payload->>'flow_closing_cents')::numeric IS DISTINCT FROM (v_snapshot->>'flow_closing_cents')::numeric THEN RAISE EXCEPTION 'Saldos externos no coinciden con el libro'; END IF;
  -- Verify actual journal totals, including zero-activity months.
  IF EXISTS(SELECT 1 FROM public.accounting_journal_entries e LEFT JOIN public.accounting_postings p ON p.journal_entry_id=e.id WHERE e.period<=v_period GROUP BY e.id HAVING count(p.id)<2 OR sum(p.debit_cents)<>sum(p.credit_cents)) THEN RAISE EXCEPTION 'Asiento incompleto o descuadrado'; END IF;
  v_snapshot:=v_snapshot||jsonb_build_object('approval',p_payload,'approved_by',p_actor);
  INSERT INTO public.accounting_period_closes(period,version,created_by,snapshot,digest,reason) VALUES(v_period,COALESCE((SELECT max(version)+1 FROM public.accounting_period_closes WHERE period=v_period),1),p_actor,v_snapshot,md5(v_snapshot::text),p_payload->>'reason') RETURNING * INTO v_close;
  v_result:=jsonb_build_object('id',v_close.id,'version',v_close.version,'digest',v_close.digest);
 ELSIF p_action='reopen' THEN
  v_period:=p_payload->>'period';
  IF COALESCE(length(trim(p_payload->>'reason')),0)<10 THEN RAISE EXCEPTION 'Explique el motivo de reapertura'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_period_closes WHERE period>v_period AND reopened_at IS NULL) THEN RAISE EXCEPTION 'Reabra primero los cierres posteriores para recalcular saldos'; END IF;
  UPDATE public.accounting_period_closes SET reopened_at=now(),reopened_by=p_actor,reopen_reason=p_payload->>'reason' WHERE period=v_period AND reopened_at IS NULL RETURNING id INTO v_id;
  IF v_id IS NULL THEN RAISE EXCEPTION 'No hay cierre activo'; END IF;
  v_result:=jsonb_build_object('id',v_id);
 ELSIF p_action='closed_package' THEN
  SELECT * INTO STRICT v_close FROM public.accounting_period_closes WHERE id=(p_payload->>'id')::uuid;
  RETURN jsonb_build_object('close',to_jsonb(v_close)-'snapshot','package',v_close.snapshot);
 ELSE RAISE EXCEPTION 'Acción contable inválida';
 END IF;
 INSERT INTO public.accounting_operation_audit(action,actor,payload,result) VALUES(p_action,p_actor,p_payload,v_result);
 RETURN v_result;
END $$;

-- Public wrappers never elevate privileges. Private schema is not exposed.
CREATE FUNCTION public.accounting_workspace(p_period text DEFAULT NULL) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.accounting_package(p_period) $$;
CREATE FUNCTION public.accounting_operate(p_action text,p_payload jsonb,p_actor uuid) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.accounting_operate(p_action,p_payload,p_actor) $$;
REVOKE ALL ON FUNCTION private.guard_accounting_period(),private.accounting_package(text),private.accounting_operate(text,jsonb,uuid),public.accounting_workspace(text),public.accounting_operate(text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.accounting_package(text),private.accounting_operate(text,jsonb,uuid),public.accounting_workspace(text),public.accounting_operate(text,jsonb,uuid) TO service_role;
COMMIT;
