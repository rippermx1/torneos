-- Mantiene la verificación de términos de la base de datos alineada con la
-- versión que exige la aplicación. La función anterior solo comprobaba fecha.

BEGIN;

CREATE OR REPLACE FUNCTION public.user_has_accepted_terms(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.terms_accepted_at IS NOT NULL
        AND p.terms_version = '1.1'
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),
    false
  );
$$;

REVOKE ALL ON FUNCTION public.user_has_accepted_terms(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_accepted_terms(uuid) TO authenticated, service_role;

COMMIT;
