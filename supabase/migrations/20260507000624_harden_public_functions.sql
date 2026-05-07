BEGIN;

-- Mover el helper de roles fuera del schema expuesto por PostgREST.
-- Sigue disponible para RLS, pero deja de existir como /rest/v1/rpc público.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

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
    WHERE pr.profile_id = auth.uid()
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

DO $$
DECLARE
  policy_record record;
  using_expression text;
  check_expression text;
  statement text;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE qual ILIKE '%current_user_has_role%'
       OR with_check ILIKE '%current_user_has_role%'
  LOOP
    using_expression := NULL;
    check_expression := NULL;

    IF policy_record.qual IS NOT NULL THEN
      using_expression := replace(
        replace(policy_record.qual, 'current_user_has_role(', 'private.current_user_has_role('),
        '::app_role',
        '::public.app_role'
      );
    END IF;

    IF policy_record.with_check IS NOT NULL THEN
      check_expression := replace(
        replace(policy_record.with_check, 'current_user_has_role(', 'private.current_user_has_role('),
        '::app_role',
        '::public.app_role'
      );
    END IF;

    statement := format(
      'ALTER POLICY %I ON %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );

    IF using_expression IS NOT NULL THEN
      statement := statement || ' USING (' || using_expression || ')';
    END IF;

    IF check_expression IS NOT NULL THEN
      statement := statement || ' WITH CHECK (' || check_expression || ')';
    END IF;

    EXECUTE statement;
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.current_user_has_role(public.app_role);

-- Fijar search_path en funciones públicas heredadas.
ALTER FUNCTION public.user_has_accepted_terms(uuid) SET search_path = public;
ALTER FUNCTION public.wallet_withdrawable_balance(uuid) SET search_path = public;
ALTER FUNCTION public.wallet_withdrawn_in_window(uuid, interval) SET search_path = public;
ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.wallet_mark_flow_attempt_failed(text, text, smallint, jsonb) SET search_path = public;
ALTER FUNCTION public.wallet_insert_transaction(uuid, text, bigint, text, uuid, jsonb) SET search_path = public;
ALTER FUNCTION public.approve_withdrawal(uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.reject_withdrawal(uuid, uuid, text) SET search_path = public;

-- Los RPC mutables/privilegiados solo se invocan desde backend con service_role
-- o como triggers internos. No deben ser ejecutables por clientes públicos.
REVOKE EXECUTE ON FUNCTION public.handle_new_user()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_profile_admin_flag(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refresh_profile_admin_flag_trigger()
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.user_has_accepted_terms(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_withdrawable_balance(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_withdrawn_in_window(uuid, interval)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_mark_flow_attempt_failed(text, text, smallint, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.wallet_insert_transaction(uuid, text, bigint, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.approve_withdrawal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reject_withdrawal(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.user_has_accepted_terms(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_withdrawable_balance(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_withdrawn_in_window(uuid, interval)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_mark_flow_attempt_failed(text, text, smallint, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.wallet_insert_transaction(uuid, text, bigint, text, uuid, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.approve_withdrawal(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.reject_withdrawal(uuid, uuid, text)
  TO service_role;

COMMIT;
