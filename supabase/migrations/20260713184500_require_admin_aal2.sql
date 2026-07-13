BEGIN;

-- Exige un segundo factor para toda policy RLS que confíe en un rol
-- administrativo. El backend conserva la lectura de roles mediante service_role
-- para poder dirigir una sesión AAL1 al flujo de activación o desafío MFA.
CREATE OR REPLACE FUNCTION private.current_user_has_role(p_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (
      p_role NOT IN ('admin'::public.app_role, 'owner'::public.app_role)
      OR COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
    )
    AND EXISTS (
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

COMMIT;
