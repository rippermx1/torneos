-- Programador principal de tareas criticas.
--
-- pg_cron ejecuta dentro de Postgres y pg_net despacha las llamadas HTTP a
-- la aplicacion. La URL y CRON_SECRET permanecen cifrados en Vault y se
-- configuran fuera de la migracion con `npm run configure:scheduler`.

begin;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
-- El esquema ya contiene current_user_has_role(), usado por políticas RLS.
-- USAGE permite resolver nombres; EXECUTE sigue controlado por función.
grant usage on schema private to authenticated, service_role;

create or replace function private.invoke_app_cron(p_path text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_app_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  if not p_path = any (array[
    '/api/cron/process-tournaments',
    '/api/cron/flow-reconcile',
    '/api/cron/reconcile-refunds',
    '/api/cron/watchdog'
  ]) then
    raise exception 'Ruta de cron no permitida: %', p_path;
  end if;

  select decrypted_secret
  into v_app_url
  from vault.decrypted_secrets
  where name = 'torneos_app_url'
  order by updated_at desc
  limit 1;

  select decrypted_secret
  into v_cron_secret
  from vault.decrypted_secrets
  where name = 'torneos_cron_secret'
  order by updated_at desc
  limit 1;

  if nullif(trim(v_app_url), '') is null then
    raise exception 'Falta el secreto torneos_app_url en Vault';
  end if;

  if nullif(v_cron_secret, '') is null then
    raise exception 'Falta el secreto torneos_cron_secret en Vault';
  end if;

  select net.http_get(
    url := rtrim(v_app_url, '/') || p_path,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_cron_secret,
      'User-Agent', 'TorneosPlay-Supabase-Cron/1.0'
    ),
    timeout_milliseconds := 55000
  )
  into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function private.invoke_app_cron(text)
  from public, anon, authenticated;

comment on function private.invoke_app_cron(text) is
  'Despacha rutas cron permitidas usando URL y credencial almacenadas en Vault.';

commit;
