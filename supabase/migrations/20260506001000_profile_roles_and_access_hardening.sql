-- ============================================================
-- Roles y hardening de acceso.
--
-- Objetivos:
-- - Permitir cuentas con roles independientes: user, admin, owner.
-- - Mantener compatibilidad con profiles.is_admin mientras el codigo migra.
-- - Evitar escalamiento de privilegios por updates directos a profiles.
-- - Reemplazar checks RLS basados en profiles.is_admin por un helper
--   SECURITY DEFINER que no depende de metadata editable por el usuario.
-- ============================================================

BEGIN;

-- ── Tipo de rol de aplicacion ───────────────────────────────
DO $$
BEGIN
  CREATE TYPE public.app_role AS ENUM ('user', 'admin', 'owner');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'user';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'owner';

GRANT USAGE ON TYPE public.app_role TO anon, authenticated, service_role;

-- ── Roles por perfil ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profile_roles (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  granted_by uuid REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, role)
);

ALTER TABLE public.profile_roles ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_profile_roles_role
  ON public.profile_roles (role, profile_id);

-- Todos los perfiles existentes siguen siendo usuarios.
INSERT INTO public.profile_roles (profile_id, role)
SELECT id, 'user'::public.app_role
FROM public.profiles
ON CONFLICT (profile_id, role) DO NOTHING;

-- Los admins historicos conservan su acceso administrativo.
INSERT INTO public.profile_roles (profile_id, role)
SELECT id, 'admin'::public.app_role
FROM public.profiles
WHERE is_admin = true
ON CONFLICT (profile_id, role) DO NOTHING;

-- ── Helper RLS: rol del usuario autenticado actual ──────────
CREATE OR REPLACE FUNCTION public.current_user_has_role(p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = auth.uid()
      AND (
        pr.role = p_role
        OR (p_role = 'admin'::public.app_role AND pr.role = 'owner'::public.app_role)
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.current_user_has_role(public.app_role)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_user_has_role(public.app_role)
  TO anon, authenticated, service_role;

-- Mantener profiles.is_admin como cache/compatibilidad.
CREATE OR REPLACE FUNCTION public.refresh_profile_admin_flag(p_profile_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles p
  SET is_admin = EXISTS (
    SELECT 1
    FROM public.profile_roles pr
    WHERE pr.profile_id = p_profile_id
      AND pr.role IN ('admin'::public.app_role, 'owner'::public.app_role)
  )
  WHERE p.id = p_profile_id;
$$;

CREATE OR REPLACE FUNCTION public.refresh_profile_admin_flag_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.refresh_profile_admin_flag(OLD.profile_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.refresh_profile_admin_flag(NEW.profile_id);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS refresh_profile_admin_flag_on_roles ON public.profile_roles;
CREATE TRIGGER refresh_profile_admin_flag_on_roles
  AFTER INSERT OR UPDATE OR DELETE ON public.profile_roles
  FOR EACH ROW EXECUTE FUNCTION public.refresh_profile_admin_flag_trigger();

UPDATE public.profiles p
SET is_admin = EXISTS (
  SELECT 1
  FROM public.profile_roles pr
  WHERE pr.profile_id = p.id
    AND pr.role IN ('admin'::public.app_role, 'owner'::public.app_role)
);

-- Nuevos usuarios reciben rol user junto con su perfil.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, full_name)
  VALUES (
    NEW.id,
    'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(NEW.raw_user_meta_data->>'name', '')
    )
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.profile_roles (profile_id, role)
  VALUES (NEW.id, 'user'::public.app_role)
  ON CONFLICT (profile_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ── Politicas de profile_roles ──────────────────────────────
DROP POLICY IF EXISTS "Usuario lee sus roles" ON public.profile_roles;
CREATE POLICY "Usuario lee sus roles"
  ON public.profile_roles FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

DROP POLICY IF EXISTS "Admin lee roles" ON public.profile_roles;
CREATE POLICY "Admin lee roles"
  ON public.profile_roles FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

REVOKE ALL ON public.profile_roles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.profile_roles TO authenticated;
GRANT ALL ON public.profile_roles TO service_role;

-- ── Hardening de profiles ───────────────────────────────────
DROP POLICY IF EXISTS "Usuario edita su propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admin ve todos los perfiles" ON public.profiles;

CREATE POLICY "Admin ve todos los perfiles"
  ON public.profiles FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

-- No permitir updates directos por el cliente publico. Los cambios de
-- perfil/KYC/terminos pasan por Route Handlers con validacion server-side.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM PUBLIC, anon, authenticated;

-- ── Reemplazar checks admin de RLS existentes ───────────────
DROP POLICY IF EXISTS "Usuario ve sus transacciones" ON public.wallet_transactions;
CREATE POLICY "Usuario ve sus transacciones"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todas las transacciones" ON public.wallet_transactions;
CREATE POLICY "Admin ve todas las transacciones"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus inscripciones" ON public.registrations;
CREATE POLICY "Usuario ve sus inscripciones"
  ON public.registrations FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Cualquiera ve conteo por torneo" ON public.registrations;

DROP POLICY IF EXISTS "Admin ve todas las inscripciones" ON public.registrations;
CREATE POLICY "Admin ve todas las inscripciones"
  ON public.registrations FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario se inscribe" ON public.registrations;
CREATE POLICY "Usuario se inscribe"
  ON public.registrations FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Solo admin crea torneos" ON public.tournaments;
CREATE POLICY "Solo admin crea torneos"
  ON public.tournaments FOR INSERT TO authenticated
  WITH CHECK (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Solo admin actualiza torneos" ON public.tournaments;
CREATE POLICY "Solo admin actualiza torneos"
  ON public.tournaments FOR UPDATE TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role))
  WITH CHECK (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus partidas" ON public.games;
CREATE POLICY "Usuario ve sus partidas"
  ON public.games FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todas las partidas" ON public.games;
CREATE POLICY "Admin ve todas las partidas"
  ON public.games FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus movimientos" ON public.game_moves;
CREATE POLICY "Usuario ve sus movimientos"
  ON public.game_moves FOR SELECT TO authenticated
  USING (
    public.current_user_has_role('user'::public.app_role)
    AND EXISTS (
      SELECT 1
      FROM public.games g
      WHERE g.id = game_id AND g.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Admin ve todos los movimientos" ON public.game_moves;
CREATE POLICY "Admin ve todos los movimientos"
  ON public.game_moves FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus retiros" ON public.withdrawal_requests;
CREATE POLICY "Usuario ve sus retiros"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todos los retiros" ON public.withdrawal_requests;
CREATE POLICY "Admin ve todos los retiros"
  ON public.withdrawal_requests FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus disputas" ON public.disputes;
CREATE POLICY "Usuario ve sus disputas"
  ON public.disputes FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario crea disputas" ON public.disputes;
CREATE POLICY "Usuario crea disputas"
  ON public.disputes FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todas las disputas" ON public.disputes;
CREATE POLICY "Admin ve todas las disputas"
  ON public.disputes FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus intentos de pago" ON public.flow_payment_attempts;
CREATE POLICY "Usuario ve sus intentos de pago"
  ON public.flow_payment_attempts FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todos los intentos de pago" ON public.flow_payment_attempts;
CREATE POLICY "Admin ve todos los intentos de pago"
  ON public.flow_payment_attempts FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve sus solicitudes KYC" ON public.kyc_submissions;
CREATE POLICY "Usuario ve sus solicitudes KYC"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve todas las solicitudes KYC" ON public.kyc_submissions;
CREATE POLICY "Admin ve todas las solicitudes KYC"
  ON public.kyc_submissions FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario ve su auditoria KYC" ON public.kyc_audit_events;
CREATE POLICY "Usuario ve su auditoria KYC"
  ON public.kyc_audit_events FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve auditoria KYC" ON public.kyc_audit_events;
CREATE POLICY "Admin ve auditoria KYC"
  ON public.kyc_audit_events FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Admin lee admin_actions" ON public.admin_actions;
CREATE POLICY "Admin lee admin_actions"
  ON public.admin_actions FOR SELECT TO authenticated
  USING (public.current_user_has_role('admin'::public.app_role));

DROP POLICY IF EXISTS "Usuario sube sus documentos KYC" ON storage.objects;
CREATE POLICY "Usuario sube sus documentos KYC"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Usuario ve sus documentos KYC" ON storage.objects;
CREATE POLICY "Usuario ve sus documentos KYC"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND public.current_user_has_role('user'::public.app_role)
  );

DROP POLICY IF EXISTS "Admin ve documentos KYC" ON storage.objects;
CREATE POLICY "Admin ve documentos KYC"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'kyc-documents'
    AND public.current_user_has_role('admin'::public.app_role)
  );

COMMIT;
