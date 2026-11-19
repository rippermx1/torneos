-- Dormant by default: activation is separate and explicitly targets isolated develop.
CREATE TABLE private.rm12_cron_dispatches (
  request_id bigint PRIMARY KEY,
  job_name text NOT NULL CHECK (job_name IN ('process-tournaments','flow-reconcile','reconcile-refunds','watchdog')),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  observed_at timestamptz,
  http_status integer,
  processing_ok boolean,
  operational_ok boolean,
  failure_class text
);
ALTER TABLE private.rm12_cron_dispatches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.rm12_cron_dispatches FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.invoke_rm12_cron(p_path text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE origin text; secret text; request_id bigint;
BEGIN
  IF p_path IS NULL OR NOT p_path=ANY(ARRAY['/api/cron/process-tournaments','/api/cron/flow-reconcile','/api/cron/reconcile-refunds','/api/cron/watchdog']) THEN
    RAISE EXCEPTION 'Ruta RM-12 no permitida';
  END IF;
  SELECT decrypted_secret INTO origin FROM vault.decrypted_secrets WHERE name='rm12_app_url';
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name='rm12_cron_secret';
  IF origin IS DISTINCT FROM 'https://rm12-torneos-dev.vercel.app' OR secret IS NULL OR length(secret)<32 THEN
    RAISE EXCEPTION 'Scheduler RM-12 no configurado';
  END IF;
  SELECT net.http_get(url:=origin||p_path,
    headers:=jsonb_build_object('Authorization','Bearer '||secret,'User-Agent','TorneosPlay-RM12-Cron/1.0'),
    timeout_milliseconds:=55000) INTO request_id;
  INSERT INTO private.rm12_cron_dispatches(request_id,job_name) VALUES(request_id,substring(p_path FROM 11));
  RETURN request_id;
END; $$;

CREATE FUNCTION private.capture_rm12_cron_responses() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE response record; body jsonb; captured integer:=0;
BEGIN
  FOR response IN SELECT r.*,d.job_name FROM private.rm12_cron_dispatches d
    JOIN net._http_response r ON r.id=d.request_id WHERE d.observed_at IS NULL LOOP
    BEGIN body:=response.content::jsonb; EXCEPTION WHEN OTHERS THEN body:='{}'::jsonb; END;
    UPDATE private.rm12_cron_dispatches SET observed_at=clock_timestamp(),http_status=response.status_code,
      processing_ok=CASE WHEN response.timed_out OR response.error_msg IS NOT NULL THEN false
        WHEN response.job_name='watchdog' THEN COALESCE(response.status_code IN (200,503) AND body->'schedulerHealthy'='true'::jsonb,false)
        ELSE COALESCE(response.status_code=200 AND body->'ok'='true'::jsonb,false) END,
      operational_ok=COALESCE(response.status_code=200 AND body->'ok'='true'::jsonb,false),
      failure_class=CASE WHEN response.timed_out THEN 'timeout' WHEN response.error_msg IS NOT NULL THEN 'network'
        WHEN response.status_code BETWEEN 300 AND 399 THEN 'redirect'
        WHEN response.status_code IN (401,403) THEN 'authorization'
        WHEN response.status_code>=400 THEN 'application' END
      WHERE request_id=response.id;
    captured:=captured+1;
  END LOOP;
  UPDATE private.rm12_cron_dispatches SET observed_at=clock_timestamp(),processing_ok=false,operational_ok=false,failure_class='missing-response'
    WHERE observed_at IS NULL AND requested_at<clock_timestamp()-interval '2 minutes';
  DELETE FROM private.rm12_cron_dispatches WHERE requested_at<clock_timestamp()-interval '14 days';
  RETURN captured;
END; $$;
REVOKE ALL ON FUNCTION private.invoke_rm12_cron(text),private.capture_rm12_cron_responses() FROM PUBLIC,anon,authenticated,service_role;
