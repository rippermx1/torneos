BEGIN;

-- Evita reevaluar auth.uid() por fila cuando el helper se usa desde RLS.
CREATE OR REPLACE FUNCTION private.current_user_has_role(p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = (SELECT auth.uid())
      AND (
        pr.role = p_role
        OR (p_role = 'admin'::public.app_role AND pr.role = 'owner'::public.app_role)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION private.current_user_has_role(public.app_role)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.current_user_has_role(public.app_role)
  TO authenticated, service_role;

-- SELECT propios o admin: una sola policy permisiva por tabla evita ORs
-- repartidos en policies distintas y elimina auth.uid() por fila.
DROP POLICY IF EXISTS "Usuario lee sus roles" ON public.profile_roles;
DROP POLICY IF EXISTS "Admin lee roles" ON public.profile_roles;
CREATE POLICY "Usuario o admin lee roles"
  ON public.profile_roles FOR SELECT TO authenticated
  USING (
    profile_id = (SELECT auth.uid())
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admin ve todos los perfiles" ON public.profiles;
CREATE POLICY "Usuario o admin ve perfiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    id = (SELECT auth.uid())
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus transacciones" ON public.wallet_transactions;
DROP POLICY IF EXISTS "Admin ve todas las transacciones" ON public.wallet_transactions;
CREATE POLICY "Usuario o admin ve transacciones"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus inscripciones" ON public.registrations;
DROP POLICY IF EXISTS "Admin ve todas las inscripciones" ON public.registrations;
CREATE POLICY "Usuario o admin ve inscripciones"
  ON public.registrations FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario se inscribe" ON public.registrations;
CREATE POLICY "Usuario se inscribe"
  ON public.registrations FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus partidas" ON public.games;
DROP POLICY IF EXISTS "Admin ve todas las partidas" ON public.games;
CREATE POLICY "Usuario o admin ve partidas"
  ON public.games FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus movimientos" ON public.game_moves;
DROP POLICY IF EXISTS "Admin ve todos los movimientos" ON public.game_moves;
CREATE POLICY "Usuario o admin ve movimientos"
  ON public.game_moves FOR SELECT TO authenticated
  USING (
    (
      private.current_user_has_role('user'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.games g
        WHERE g.id = public.game_moves.game_id
          AND g.user_id = (SELECT auth.uid())
      )
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus retiros" ON public.withdrawal_requests;
DROP POLICY IF EXISTS "Admin ve todos los retiros" ON public.withdrawal_requests;
CREATE POLICY "Usuario o admin ve retiros"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus disputas" ON public.disputes;
DROP POLICY IF EXISTS "Admin ve todas las disputas" ON public.disputes;
CREATE POLICY "Usuario o admin ve disputas"
  ON public.disputes FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario crea disputas" ON public.disputes;
CREATE POLICY "Usuario crea disputas"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND private.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus intentos de pago" ON public.flow_payment_attempts;
DROP POLICY IF EXISTS "Admin ve todos los intentos de pago" ON public.flow_payment_attempts;
CREATE POLICY "Usuario o admin ve intentos de pago"
  ON public.flow_payment_attempts FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus solicitudes KYC" ON public.kyc_submissions;
DROP POLICY IF EXISTS "Admin ve todas las solicitudes KYC" ON public.kyc_submissions;
CREATE POLICY "Usuario o admin ve solicitudes KYC"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve su auditoria KYC" ON public.kyc_audit_events;
DROP POLICY IF EXISTS "Admin ve auditoria KYC" ON public.kyc_audit_events;
CREATE POLICY "Usuario o admin ve auditoria KYC"
  ON public.kyc_audit_events FOR SELECT TO authenticated
  USING (
    (
      user_id = (SELECT auth.uid())
      AND private.current_user_has_role('user'::public.app_role)
    )
    OR private.current_user_has_role('admin'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario sube sus documentos KYC" ON storage.objects;
CREATE POLICY "Usuario sube sus documentos KYC"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
    AND private.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus documentos KYC" ON storage.objects;
DROP POLICY IF EXISTS "Admin ve documentos KYC" ON storage.objects;
CREATE POLICY "Usuario o admin ve documentos KYC"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (
      (
        (storage.foldername(name))[1] = (SELECT auth.uid())::text
        AND private.current_user_has_role('user'::public.app_role)
      )
      OR private.current_user_has_role('admin'::public.app_role)
    )
  );

COMMIT;
