-- RM-09. Local candidate; no scheduling or provider mutations in this migration.
BEGIN;
ALTER TABLE public.cron_heartbeats ADD COLUMN last_started_at timestamptz,
  ADD COLUMN last_success_at timestamptz, ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_failures>=0),
  ADD COLUMN last_dispatch_failure_at timestamptz, ADD COLUMN consecutive_dispatch_failures integer NOT NULL DEFAULT 0 CHECK(consecutive_dispatch_failures>=0);
UPDATE public.cron_heartbeats SET last_success_at=CASE WHEN last_status='ok' THEN last_run_at END,
  consecutive_failures=CASE WHEN last_status='error' THEN 1 ELSE 0 END;

CREATE TABLE public.ops_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), condition_key text NOT NULL,
  title text NOT NULL, severity text NOT NULL CHECK(severity IN ('attention','critical')),
  details jsonb NOT NULL, first_seen_at timestamptz NOT NULL DEFAULT now(), last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES public.profiles(id), acknowledged_at timestamptz, acknowledgement_note text,
  escalated_at timestamptz, critical_since timestamptz, resolved_at timestamptz
);
CREATE UNIQUE INDEX ops_one_active_condition ON public.ops_incidents(condition_key) WHERE resolved_at IS NULL;
CREATE TABLE public.ops_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.ops_incidents(id),
  action text NOT NULL CHECK(action IN ('opened','critical','acknowledged','escalated','recovered','retry_notification','manual_receipt')),
  actor_id uuid REFERENCES public.profiles(id), note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ops_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), incident_id uuid NOT NULL REFERENCES public.ops_incidents(id),
  stage text NOT NULL CHECK(stage IN ('opened','critical','escalated','recovered')), recipient text,
  subject text NOT NULL, text_body text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','accepted','blocked','received_manually')),
  attempts integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), next_attempt_at timestamptz NOT NULL DEFAULT now(),
  first_attempt_at timestamptz, lease_until timestamptz, claim_token uuid,
  provider_id text, accepted_at timestamptz, last_error text, reviewed_by uuid REFERENCES public.profiles(id), reviewed_at timestamptz, review_note text,
  UNIQUE(incident_id,stage)
);
CREATE INDEX ops_notification_due ON public.ops_notifications(next_attempt_at) WHERE state IN ('pending','sending');
ALTER TABLE public.ops_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_notifications ENABLE ROW LEVEL SECURITY;
-- Remove Supabase's default service grants too. Mutations are transactional RPCs.
REVOKE ALL ON public.ops_incidents,public.ops_incident_events,public.ops_notifications,public.cron_heartbeats FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.ops_incidents,public.ops_incident_events,public.ops_notifications,public.cron_heartbeats TO service_role;

CREATE FUNCTION public.record_cron_execution(p_job text,p_status text,p_detail text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_job IS NULL OR p_job NOT IN ('process-tournaments','flow-reconcile','reconcile-refunds','watchdog')
    OR p_status IS NULL OR p_status NOT IN ('started','ok','error') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Proceso o estado inválido'; END IF;
  IF p_status='started' THEN
    INSERT INTO public.cron_heartbeats(job_name,last_status,last_started_at,detail)
      VALUES(p_job,'error',clock_timestamp(),'Sin ejecución completada')
      ON CONFLICT(job_name) DO UPDATE SET last_started_at=EXCLUDED.last_started_at;
  ELSE
    INSERT INTO public.cron_heartbeats(job_name,last_run_at,last_status,detail,last_success_at,consecutive_failures)
      VALUES(p_job,clock_timestamp(),p_status,left(p_detail,2000),CASE WHEN p_status='ok' THEN clock_timestamp() END,CASE WHEN p_status='error' THEN 1 ELSE 0 END)
      ON CONFLICT(job_name) DO UPDATE SET last_run_at=EXCLUDED.last_run_at,last_status=p_status,detail=EXCLUDED.detail,
        last_success_at=CASE WHEN p_status='ok' THEN EXCLUDED.last_success_at ELSE public.cron_heartbeats.last_success_at END,
        consecutive_failures=CASE WHEN p_status='ok' THEN 0 ELSE public.cron_heartbeats.consecutive_failures+1 END,
        consecutive_dispatch_failures=CASE WHEN p_status='ok' THEN 0 ELSE public.cron_heartbeats.consecutive_dispatch_failures END;
  END IF;
END;
$$;

CREATE FUNCTION public.record_cron_dispatch_failure(p_job text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF p_job IS NULL OR p_job NOT IN ('process-tournaments','flow-reconcile','reconcile-refunds') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Proceso inválido'; END IF;
  INSERT INTO public.cron_heartbeats(job_name,last_status,last_dispatch_failure_at,consecutive_dispatch_failures,detail)
    VALUES(p_job,'error',clock_timestamp(),1,'El respaldo informó un fallo de llamada')
    ON CONFLICT(job_name) DO UPDATE SET last_dispatch_failure_at=EXCLUDED.last_dispatch_failure_at,
      consecutive_dispatch_failures=public.cron_heartbeats.consecutive_dispatch_failures+1;
END;
$$;

CREATE FUNCTION public.operational_snapshot() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH queues AS (
  SELECT 'unknown-payments' key,'Pagos desconocidos' title,'/admin/payments' href,count(*) count,
    COALESCE(sum(charged_amount_cents),0) amount_cents,min(created_at) oldest_at FROM public.flow_payment_attempts WHERE status='unknown'
  UNION ALL SELECT 'pending-payments','Pagos en espera','/admin/payments',count(*),COALESCE(sum(charged_amount_cents),0),min(created_at)
    FROM public.flow_payment_attempts WHERE status='pending'
  UNION ALL SELECT 'pending-refunds','Devoluciones sin confirmar','/admin/refunds',count(*),COALESCE(sum(amount_cents),0),min(created_at)
    FROM public.flow_refund_attempts WHERE status IN ('queued','dispatching','pending')
  UNION ALL SELECT 'failed-refunds','Devoluciones con incertidumbre o fallo','/admin/refunds',count(*),COALESCE(sum(amount_cents),0),min(created_at)
    FROM public.flow_refund_attempts WHERE status IN ('unknown','manual','rejected','cancelled')
  UNION ALL SELECT 'retained-prizes','Premios retenidos','/admin/prize-reviews',count(*),COALESCE(sum(amount_cents),0),min(created_at)
    FROM public.prize_reviews WHERE status IN ('pending','held')
  UNION ALL SELECT 'withdrawals','Retiros por pagar','/admin/payouts',count(*),COALESCE(sum(amount_cents),0),min(created_at)
    FROM public.withdrawal_requests WHERE status IN ('pending','claimed','approved')
  UNION ALL SELECT 'uncertain-withdrawals','Transferencias por confirmar','/admin/payouts',count(*),COALESCE(sum(amount_cents),0),min(transfer_started_at)
    FROM public.withdrawal_requests WHERE status IN ('transferring','reconciling')
), differences AS (
  SELECT j.id,COALESCE(sum(p.debit_cents-p.credit_cents),0) difference,count(p.id) postings
    FROM public.accounting_journal_entries j LEFT JOIN public.accounting_postings p ON p.journal_entry_id=j.id GROUP BY j.id
), checks AS (
  SELECT 'ledger-difference' key,'Asientos contables incompletos o descuadrados' title,'/admin/reports' href,
    count(*) count,COALESCE(sum(abs(difference)),0) amount_cents FROM differences WHERE difference<>0 OR postings<2
  UNION ALL SELECT 'orphan-reservation','Retiros sin reserva íntegra','/admin/payouts',count(*),COALESCE(sum(w.amount_cents),0)
    FROM public.withdrawal_requests w LEFT JOIN public.wallet_transactions t ON t.id=w.wallet_transaction_id
    WHERE w.status<>'rejected' AND (t.id IS NULL OR t.user_id IS DISTINCT FROM w.user_id OR t.type IS DISTINCT FROM 'withdrawal'
      OR t.amount_cents IS DISTINCT FROM -w.amount_cents OR t.reference_id IS DISTINCT FROM w.id OR t.reference_type IS DISTINCT FROM 'withdrawal_request')
  UNION ALL SELECT 'orphan-debit','Débitos de retiro sin solicitud','/admin/payouts',count(*),COALESCE(sum(abs(t.amount_cents)),0)
    FROM public.wallet_transactions t LEFT JOIN public.withdrawal_requests w ON w.id=t.reference_id
    WHERE t.type='withdrawal' AND t.reference_type='withdrawal_request' AND w.id IS NULL
  UNION ALL SELECT 'duplicate-prize','Créditos de premios duplicados','/admin/prize-reviews',count(*),COALESCE(sum(duplicate_amount),0)
    FROM (SELECT user_id,reference_id,sum(amount_cents)-max(amount_cents) duplicate_amount FROM public.wallet_transactions
      WHERE type='prize_credit' AND reference_type='tournament' GROUP BY user_id,reference_id HAVING count(*)>1) duplicated
  UNION ALL SELECT 'unauthorized-payout','Retiros sin separación de autorización','/admin/payouts',count(*),COALESCE(sum(amount_cents),0)
    FROM public.withdrawal_requests WHERE (status IN ('approved','transferring','reconciling') OR (status='paid' AND transfer_started_at IS NOT NULL))
      AND (claimed_by IS NULL OR reviewed_by IS NULL OR claimed_by=reviewed_by)
)
SELECT jsonb_build_object('observed_at',now(),'bank_cash_verified',false,
  'queues',COALESCE((SELECT jsonb_agg(to_jsonb(q) ORDER BY key) FROM queues q),'[]'::jsonb),
  'checks',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY key) FROM checks c),'[]'::jsonb),
  'jobs',COALESCE((SELECT jsonb_agg(to_jsonb(h) ORDER BY job_name) FROM public.cron_heartbeats h),'[]'::jsonb));
$$;

CREATE FUNCTION private.enqueue_ops_notification(p_id uuid,p_stage text,p_recipient text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO public.ops_notifications(incident_id,stage,recipient,subject,text_body)
    SELECT id,p_stage,nullif(btrim(p_recipient),''),'[TorneosPlay OPS] '||p_stage||': '||title,
      'Incidente: '||id||E'\nEstado: '||p_stage||E'\nSeveridad: '||severity||E'\nDetectado: '||first_seen_at||E'\nDetalle: '||details::text||
      E'\nAbrir Centro de operaciones > Obligaciones y alertas. Acusar atención no liquida obligaciones.'
    FROM public.ops_incidents WHERE id=p_id ON CONFLICT(incident_id,stage) DO NOTHING;
END;
$$;

CREATE FUNCTION public.observe_operations(p_recipient text DEFAULT NULL,p_escalation_recipient text DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE snapshot jsonb; conditions jsonb:='[]'; item jsonb; k text; level text; current_incident public.ops_incidents;
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

CREATE FUNCTION public.acknowledge_ops_incident(p_id uuid,p_actor uuid,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE incident public.ops_incidents;
BEGIN
  PERFORM private.financial_review_lock(); PERFORM private.assert_review_operator(p_actor);
  PERFORM pg_advisory_xact_lock(81009,9);
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Plan de atención de 10 a 2000 caracteres requerido'; END IF;
  SELECT * INTO incident FROM public.ops_incidents WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Incidente no encontrado'; END IF;
  IF incident.resolved_at IS NOT NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Incidente recuperado'; END IF;
  IF incident.acknowledged_by IS NOT NULL THEN
    IF incident.acknowledged_by=p_actor THEN RETURN; END IF;
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Incidente ya asignado a otro operador'; END IF;
  UPDATE public.ops_incidents SET acknowledged_by=p_actor,acknowledged_at=now(),acknowledgement_note=btrim(p_note) WHERE id=p_id;
  INSERT INTO public.ops_incident_events(incident_id,action,actor_id,note) VALUES(p_id,'acknowledged',p_actor,btrim(p_note));
END;
$$;

CREATE FUNCTION public.claim_ops_notifications() RETURNS SETOF public.ops_notifications
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  -- Never retry beyond the provider's 24h idempotency window; explicit reconciliation required.
  UPDATE public.ops_notifications SET state='blocked',last_error='Ventana de idempotencia agotada; conciliar aviso antes de reenviar'
    WHERE state IN ('pending','sending') AND first_attempt_at<=now()-interval '23 hours' AND (lease_until IS NULL OR lease_until<now());
  RETURN QUERY WITH due AS (
    SELECT id FROM public.ops_notifications WHERE state IN ('pending','sending') AND next_attempt_at<=now()
      AND (lease_until IS NULL OR lease_until<now()) ORDER BY CASE stage WHEN 'escalated' THEN 0 WHEN 'critical' THEN 1 WHEN 'opened' THEN 2 ELSE 3 END,
        next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 2
  ) UPDATE public.ops_notifications n SET state='sending',claim_token=gen_random_uuid(),lease_until=now()+interval '2 minutes',
    first_attempt_at=COALESCE(first_attempt_at,now()),attempts=attempts+1 FROM due WHERE n.id=due.id RETURNING n.*;
END;
$$;

CREATE FUNCTION public.finish_ops_notification(p_id uuid,p_token uuid,p_provider_id text DEFAULT NULL,p_error text DEFAULT NULL,p_retryable boolean DEFAULT true) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (nullif(btrim(p_provider_id),'') IS NULL AND p_error IS NULL) OR (p_provider_id IS NOT NULL AND p_error IS NOT NULL) THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Resultado de envío requerido'; END IF;
  UPDATE public.ops_notifications SET state=CASE WHEN p_provider_id IS NOT NULL THEN 'accepted' WHEN p_retryable THEN 'pending' ELSE 'blocked' END,
    provider_id=p_provider_id,accepted_at=CASE WHEN p_provider_id IS NOT NULL THEN now() END,last_error=left(p_error,2000),lease_until=NULL,
    next_attempt_at=now()+make_interval(mins=>LEAST(60,5*attempts))
    WHERE id=p_id AND claim_token=p_token AND state='sending';
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Arrendamiento de aviso perdido'; END IF;
END;
$$;

CREATE FUNCTION public.review_ops_notification(p_id uuid,p_actor uuid,p_action text,p_note text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE notification public.ops_notifications;
BEGIN
  PERFORM private.financial_review_lock(); PERFORM private.assert_review_operator(p_actor);
  IF p_action IS NULL OR p_action NOT IN ('retry','manual_receipt') OR p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Acción y evidencia de atención requeridas'; END IF;
  SELECT * INTO notification FROM public.ops_notifications WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Aviso no encontrado'; END IF;
  IF notification.state IN ('accepted','received_manually') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Aviso ya atendido'; END IF;
  IF notification.lease_until>now() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Envío todavía en curso'; END IF;
  IF p_action='retry' THEN
    IF notification.first_attempt_at<=now()-interval '23 hours' THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Ventana de idempotencia agotada: conciliar aviso y registrar recepción por canal alternativo'; END IF;
    UPDATE public.ops_notifications SET state='pending',next_attempt_at=now(),last_error=NULL,
      reviewed_by=p_actor,reviewed_at=now(),review_note=btrim(p_note) WHERE id=p_id;
  ELSE
    UPDATE public.ops_notifications SET state='received_manually',lease_until=NULL,reviewed_by=p_actor,reviewed_at=now(),review_note=btrim(p_note) WHERE id=p_id;
  END IF;
  INSERT INTO public.ops_incident_events(incident_id,action,actor_id,note)
    VALUES(notification.incident_id,CASE WHEN p_action='retry' THEN 'retry_notification' ELSE 'manual_receipt' END,p_actor,btrim(p_note));
END;
$$;

REVOKE ALL ON FUNCTION private.enqueue_ops_notification(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.review_ops_notification(uuid,uuid,text,text),public.record_cron_dispatch_failure(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_ops_notification(uuid,uuid,text,text),public.record_cron_dispatch_failure(text) TO service_role;
REVOKE ALL ON FUNCTION public.record_cron_execution(text,text,text),public.operational_snapshot(),public.observe_operations(text,text),
  public.acknowledge_ops_incident(uuid,uuid,text),public.claim_ops_notifications(),public.finish_ops_notification(uuid,uuid,text,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_cron_execution(text,text,text),public.operational_snapshot(),public.observe_operations(text,text),
  public.acknowledge_ops_incident(uuid,uuid,text),public.claim_ops_notifications(),public.finish_ops_notification(uuid,uuid,text,text,boolean) TO service_role;
COMMIT;
