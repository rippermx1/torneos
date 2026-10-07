-- RM14: service-only entrypoints; private implementations and immutable audit.
CREATE TABLE private.data_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_id uuid NOT NULL REFERENCES public.profiles(id),
  action text NOT NULL, target_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK(kind IN ('access','erasure')),
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','blocked','completed','rejected')),
  description text NOT NULL CHECK(length(description) BETWEEN 10 AND 2000),
  response text, response_storage_path text, reviewed_by uuid REFERENCES public.profiles(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rm14_one_open_data_request ON private.data_requests(user_id,kind) WHERE status IN ('submitted','reviewing','blocked');
CREATE TABLE private.data_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL REFERENCES private.data_requests(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id), status text NOT NULL, reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE private.support_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), case_id uuid NOT NULL REFERENCES public.disputes(id),
  actor_id uuid NOT NULL REFERENCES public.profiles(id), action text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE private.data_access_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.data_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.data_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.support_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.data_access_events,private.data_requests,private.data_request_events,private.support_case_events FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON private.data_access_events,private.data_requests,private.data_request_events,private.support_case_events TO service_role;
CREATE INDEX rm14_access_actor_time ON private.data_access_events(actor_id,created_at DESC);
CREATE INDEX rm14_requests_user_time ON private.data_requests(user_id,created_at DESC);
ALTER TABLE public.disputes ADD COLUMN case_kind text NOT NULL DEFAULT 'dispute' CHECK(case_kind IN ('consultation','dispute','incident')),
  ADD COLUMN acknowledged_by uuid REFERENCES public.profiles(id), ADD COLUMN acknowledged_at timestamptz;

CREATE FUNCTION private.app_session_live(p_user uuid,p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM auth.sessions WHERE id=p_session AND user_id=p_user AND (not_after IS NULL OR not_after>now()));
$$;
CREATE FUNCTION public.app_session_live(p_user uuid,p_session uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.app_session_live(p_user,p_session); $$;
CREATE FUNCTION private.current_session_live() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN (auth.jwt()->>'session_id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN private.app_session_live(auth.uid(),(auth.jwt()->>'session_id')::uuid) ELSE false END;
$$;
REVOKE ALL ON FUNCTION private.app_session_live(uuid,uuid),public.app_session_live(uuid,uuid),private.current_session_live() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.app_session_live(uuid,uuid),public.app_session_live(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION private.current_session_live() TO authenticated;
CREATE FUNCTION private.current_account_active() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT private.current_session_live() AND EXISTS(SELECT 1 FROM public.profiles WHERE id=auth.uid() AND NOT is_banned);
$$;
REVOKE ALL ON FUNCTION private.current_account_active() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.current_account_active() TO authenticated;
-- Keep histories/support readable for a suspended account, but reject a revoked
-- access token even before JWT expiry, including direct Data API calls.
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','profile_roles','wallet_transactions','withdrawal_requests','kyc_submissions','kyc_audit_events','disputes','games','game_moves','registrations','tournament_results'] LOOP
    EXECUTE format('CREATE POLICY rm14_live_session ON public.%I AS RESTRICTIVE TO authenticated USING(private.current_session_live()) WITH CHECK(private.current_account_active())',t);
    EXECUTE format('CREATE POLICY rm14_active_delete ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING(private.current_account_active())',t);
  END LOOP;
END $$;
CREATE POLICY rm14_storage_live_session ON storage.objects AS RESTRICTIVE TO authenticated
  USING(private.current_session_live()) WITH CHECK(private.current_account_active());
-- Reads must pass the audited application endpoints. Browser uploads stay own-only.
DROP POLICY IF EXISTS "Usuario ve sus documentos KYC" ON storage.objects;
DROP POLICY IF EXISTS "Usuario o admin ve documentos KYC" ON storage.objects;

CREATE FUNCTION private.revoke_app_sessions(p_user uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n integer;
BEGIN
  DELETE FROM auth.sessions WHERE user_id=p_user; GET DIAGNOSTICS n=ROW_COUNT;
  INSERT INTO private.data_access_events(actor_id,action) VALUES(p_user,'sessions.revoke'); RETURN n;
END; $$;
CREATE FUNCTION public.revoke_app_sessions(p_user uuid) RETURNS integer
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.revoke_app_sessions(p_user); $$;

CREATE FUNCTION private.read_kyc_document(p_actor uuid,p_submission uuid,p_side text,p_owner_only boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE k public.kyc_submissions; path text;
BEGIN
  SELECT * INTO k FROM public.kyc_submissions WHERE id=p_submission;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Documento no disponible'; END IF;
  IF p_owner_only AND k.user_id<>p_actor THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Documento no disponible'; END IF;
  IF k.user_id<>p_actor THEN PERFORM private.assert_review_operator(p_actor,k.user_id); END IF;
  IF p_side NOT IN ('front','back') OR p_side IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Lado invÃƒÂ¡lido'; END IF;
  path:=CASE WHEN p_side='front' THEN k.document_front_path ELSE k.document_back_path END;
  IF path IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Documento no disponible'; END IF;
  INSERT INTO private.data_access_events(actor_id,action,target_id) VALUES(p_actor,'kyc.'||p_side,k.id);
  RETURN path;
END; $$;
CREATE FUNCTION public.read_kyc_document(p_actor uuid,p_submission uuid,p_side text,p_owner_only boolean DEFAULT false) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.read_kyc_document(p_actor,p_submission,p_side,p_owner_only); $$;
CREATE FUNCTION private.audit_payout_proof(p_actor uuid,p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE path text;
BEGIN
  PERFORM private.assert_review_operator(p_actor);
  SELECT proof_storage_path INTO path FROM public.withdrawal_requests WHERE id=p_id;
  IF path IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Comprobante no disponible'; END IF;
  INSERT INTO private.data_access_events(actor_id,action,target_id) VALUES(p_actor,'payout.proof',p_id); RETURN path;
END; $$;
CREATE FUNCTION public.audit_payout_proof(p_actor uuid,p_id uuid) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.audit_payout_proof(p_actor,p_id); $$;

-- Keep the existing server-side support endpoint compatible while auditing
-- legacy service inserts in the same transaction. Browser INSERT remains denied.
CREATE FUNCTION private.audit_support_case_opened() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF length(btrim(NEW.description)) NOT BETWEEN 20 AND 2000 OR NOT EXISTS(SELECT 1 FROM public.profile_roles WHERE profile_id=NEW.user_id AND role='user') THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Caso y titular inválidos'; END IF;
  IF NEW.tournament_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.registrations WHERE user_id=NEW.user_id AND tournament_id=NEW.tournament_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Participación no encontrada'; END IF;
  INSERT INTO private.support_case_events(case_id,actor_id,action) VALUES(NEW.id,NEW.user_id,'opened'); RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION private.audit_support_case_opened() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER rm14_support_opened AFTER INSERT ON public.disputes FOR EACH ROW EXECUTE FUNCTION private.audit_support_case_opened();

CREATE FUNCTION private.open_support_case(p_user uuid,p_type text,p_description text,p_tournament uuid,p_kind text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE id uuid;
BEGIN
  IF p_type NOT IN ('payment','tournament_result','technical','other') OR p_kind NOT IN ('consultation','dispute','incident') OR p_type IS NULL OR p_kind IS NULL
    OR length(btrim(p_description)) NOT BETWEEN 20 AND 2000 OR p_description IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Solicitud invÃƒÂ¡lida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profile_roles WHERE profile_id=p_user AND role='user') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Cuenta de usuario requerida'; END IF;
  IF p_tournament IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.registrations WHERE tournament_id=p_tournament AND user_id=p_user) THEN
    RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='ParticipaciÃƒÂ³n no encontrada'; END IF;
  INSERT INTO public.disputes(user_id,type,description,tournament_id,case_kind) VALUES(p_user,p_type,btrim(p_description),p_tournament,p_kind) RETURNING disputes.id INTO id;
  RETURN id;
END; $$;
CREATE FUNCTION public.open_support_case(p_user uuid,p_type text,p_description text,p_tournament uuid,p_kind text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.open_support_case(p_user,p_type,p_description,p_tournament,p_kind); $$;
REVOKE INSERT ON public.disputes FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE c record; BEGIN FOR c IN SELECT attname FROM pg_attribute WHERE attrelid='public.disputes'::regclass AND attnum>0 AND NOT attisdropped LOOP
  EXECUTE format('REVOKE INSERT(%I) ON public.disputes FROM PUBLIC,anon,authenticated,service_role',c.attname); END LOOP; END $$;
GRANT INSERT ON public.disputes TO service_role;
CREATE FUNCTION private.acknowledge_support_case(p_actor uuid,p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.disputes;
BEGIN
  SELECT * INTO d FROM public.disputes WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Caso no encontrado'; END IF;
  PERFORM private.assert_review_operator(p_actor,d.user_id);
  IF d.status<>'open' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Caso cerrado'; END IF;
  IF d.acknowledged_at IS NOT NULL THEN RETURN; END IF;
  UPDATE public.disputes SET acknowledged_by=p_actor,acknowledged_at=now() WHERE id=p_id;
  INSERT INTO private.support_case_events(case_id,actor_id,action) VALUES(p_id,p_actor,'acknowledged');
END; $$;
CREATE FUNCTION public.acknowledge_support_case(p_actor uuid,p_id uuid) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.acknowledge_support_case(p_actor,p_id); $$;

CREATE FUNCTION private.open_data_request(p_user uuid,p_kind text,p_description text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE id uuid;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN ('access','erasure') OR p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Solicitud invÃƒÂ¡lida'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profile_roles WHERE profile_id=p_user AND role='user') THEN RAISE EXCEPTION USING ERRCODE='PT403',MESSAGE='Cuenta de usuario requerida'; END IF;
  INSERT INTO private.data_requests(user_id,kind,description) VALUES(p_user,p_kind,btrim(p_description)) RETURNING data_requests.id INTO id;
  INSERT INTO private.data_request_events(request_id,actor_id,status,reason) VALUES(id,p_user,'submitted','Solicitud recibida'); RETURN id;
END; $$;
CREATE FUNCTION public.open_data_request(p_user uuid,p_kind text,p_description text) RETURNS uuid
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.open_data_request(p_user,p_kind,p_description); $$;
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types) VALUES('data-responses','data-responses',false,4194304,ARRAY['application/pdf','application/json','application/zip']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION private.review_data_request(p_actor uuid,p_id uuid,p_status text,p_reason text,p_response_path text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.data_requests;
BEGIN
  SELECT * INTO r FROM private.data_requests WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Solicitud no encontrada'; END IF;
  PERFORM private.assert_review_operator(p_actor,r.user_id);
  IF p_status IS NULL OR p_status NOT IN ('reviewing','blocked','completed','rejected') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 10 AND 2000 THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Estado y respuesta requeridos'; END IF;
  IF r.status IN ('completed','rejected') THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Solicitud cerrada'; END IF;
  IF p_status='completed' AND r.kind='erasure' THEN RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='No se puede certificar eliminaciÃƒÂ³n sin polÃƒÂ­tica de retenciÃƒÂ³n aprobada y evidencia de borrado de archivos y copias'; END IF;
  IF p_status='completed' AND r.kind='access' AND (p_response_path IS NULL OR p_response_path !~ ('^'||p_id::text||'/[0-9a-f-]{36}\.(json|pdf|zip)$')
    OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='data-responses' AND name=p_response_path)) THEN
    RAISE EXCEPTION USING ERRCODE='PT423',MESSAGE='Adjuntar respuesta completa revisada antes de cerrar'; END IF;
  UPDATE private.data_requests SET status=p_status,response=btrim(p_reason),response_storage_path=CASE WHEN p_status='completed' THEN p_response_path ELSE response_storage_path END,reviewed_by=p_actor,updated_at=now() WHERE id=p_id;
  INSERT INTO private.data_request_events(request_id,actor_id,status,reason) VALUES(p_id,p_actor,p_status,btrim(p_reason));
END; $$;
CREATE FUNCTION public.review_data_request(p_actor uuid,p_id uuid,p_status text,p_reason text,p_response_path text DEFAULT NULL) RETURNS void
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.review_data_request(p_actor,p_id,p_status,p_reason,p_response_path); $$;
CREATE FUNCTION private.read_data_response(p_actor uuid,p_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.data_requests;
BEGIN
  SELECT * INTO r FROM private.data_requests WHERE id=p_id AND user_id=p_actor;
  IF NOT FOUND OR r.response_storage_path IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Respuesta no disponible'; END IF;
  INSERT INTO private.data_access_events(actor_id,action,target_id) VALUES(p_actor,'data.response',p_id); RETURN r.response_storage_path;
END; $$;
CREATE FUNCTION public.read_data_response(p_actor uuid,p_id uuid) RETURNS text
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.read_data_response(p_actor,p_id); $$;
CREATE FUNCTION private.list_data_requests(p_actor uuid,p_owner_only boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT p_owner_only THEN PERFORM private.assert_review_operator(p_actor); END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r)-'reviewed_by' ORDER BY created_at DESC,id) FROM private.data_requests r WHERE (NOT p_owner_only OR user_id=p_actor)),'[]'::jsonb);
END; $$;
CREATE FUNCTION public.list_data_requests(p_actor uuid,p_owner_only boolean) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.list_data_requests(p_actor,p_owner_only); $$;
CREATE FUNCTION private.data_request_for_review(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r private.data_requests;
BEGIN
  SELECT * INTO r FROM private.data_requests WHERE id=p_id;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Solicitud no encontrada'; END IF;
  PERFORM private.assert_review_operator(p_actor,r.user_id);
  RETURN jsonb_build_object('user_id',r.user_id,'kind',r.kind,'status',r.status);
END; $$;
CREATE FUNCTION public.data_request_for_review(p_actor uuid,p_id uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.data_request_for_review(p_actor,p_id); $$;
CREATE FUNCTION private.account_data_export(p_user uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  INSERT INTO private.data_access_events(actor_id,action) VALUES(p_user,'account.export');
  RETURN jsonb_build_object('scope','Perfil e historial comercial; solicitud de acceso completo disponible en soporte','generatedAt',now(),
    'profile',(SELECT to_jsonb(p) FROM public.profiles p WHERE id=p_user),
    'walletTransactions',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY created_at,id) FROM public.wallet_transactions t WHERE user_id=p_user),'[]'::jsonb),
    'tournamentResults',COALESCE((SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM public.tournament_results t WHERE user_id=p_user),'[]'::jsonb),
    'supportCases',COALESCE((SELECT jsonb_agg(to_jsonb(d)-'resolved_by'-'acknowledged_by' ORDER BY created_at,id) FROM public.disputes d WHERE user_id=p_user),'[]'::jsonb));
END; $$;
CREATE FUNCTION public.account_data_export(p_user uuid) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.account_data_export(p_user); $$;

-- Service-only invoker wrappers avoid exposing definer functions in public.
DO $$ DECLARE signature text; BEGIN
  FOREACH signature IN ARRAY ARRAY['revoke_app_sessions(uuid)','read_kyc_document(uuid,uuid,text,boolean)','audit_payout_proof(uuid,uuid)',
    'open_support_case(uuid,text,text,uuid,text)','acknowledge_support_case(uuid,uuid)','open_data_request(uuid,text,text)',
    'review_data_request(uuid,uuid,text,text,text)','read_data_response(uuid,uuid)','list_data_requests(uuid,boolean)','data_request_for_review(uuid,uuid)','account_data_export(uuid)'] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION private.'||signature||',public.'||signature||' FROM PUBLIC,anon,authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION private.'||signature||',public.'||signature||' TO service_role';
  END LOOP;
END $$;
-- Add support queues to RM09 without replacing its financial checks or RM10.
DO $$ DECLARE definition text; BEGIN
  definition:=pg_get_functiondef('public.operational_snapshot()'::regprocedure);
  IF strpos(definition,'), differences AS (')=0 OR strpos(definition,'AS checks')>0 THEN RAISE EXCEPTION 'Unexpected operational snapshot; preserve existing function'; END IF;
  definition:=replace(definition,'), differences AS (',
    'UNION ALL SELECT ''support-cases'',''Casos de soporte sin resolver'',''/admin/disputes'',count(*),0,min(created_at) FROM public.disputes WHERE status=''open''
     UNION ALL SELECT ''data-requests'',''Solicitudes de datos pendientes'',''/admin/privacy'',count(*),0,min(created_at) FROM private.data_requests WHERE status IN (''submitted'',''reviewing'',''blocked'')
     ), differences AS (');
  definition:=replace(definition,')' || chr(10) || 'SELECT jsonb_build_object',
    'UNION ALL SELECT ''support-critical'',''Incidentes o pagos reportados sin acuse'',''/admin/disputes'',count(*),0 FROM public.disputes WHERE status=''open'' AND acknowledged_at IS NULL AND (case_kind=''incident'' OR type=''payment'')
     )' || chr(10) || 'SELECT jsonb_build_object');
  IF strpos(definition,'support-critical')=0 THEN RAISE EXCEPTION 'Unexpected operational checks; preserve existing function'; END IF;
  EXECUTE definition;
END $$;
NOTIFY pgrst,'reload schema';
