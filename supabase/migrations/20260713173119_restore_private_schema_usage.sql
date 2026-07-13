-- Restaura el USAGE requerido por private.current_user_has_role() en RLS.
-- La migracion del scheduler comparte el esquema privado y debe preservar
-- este permiso; los privilegios EXECUTE siguen siendo específicos por función.

begin;

grant usage on schema private to authenticated, service_role;
revoke all on function private.invoke_app_cron(text)
  from public, anon, authenticated, service_role;

commit;
