-- ============================================================
-- Roles y schemas que Supabase Cloud crea automáticamente.
-- En Docker los creamos aquí antes de correr el schema de la app.
-- ============================================================

-- ── Roles ────────────────────────────────────────────────────
create role anon           nologin noinherit;
create role authenticated  nologin noinherit;
create role service_role   nologin noinherit bypassrls;

-- authenticator es el usuario que PostgREST usa para conectarse.
-- Puede cambiar al rol que el JWT indique (anon / authenticated / service_role).
create role authenticator  noinherit login password 'postgres';

grant anon          to authenticator;
grant authenticated to authenticator;
grant service_role  to authenticator;
grant authenticator to postgres;

-- ── Schema auth ──────────────────────────────────────────────
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

-- auth.uid() lee el claim "sub" del JWT que PostgREST inyecta.
-- Replica exactamente la función de Supabase Cloud.
create or replace function auth.uid() returns uuid
  language sql stable as
$$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

create or replace function auth.role() returns text
  language sql stable as
$$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')
  )::text
$$;

create or replace function auth.email() returns text
  language sql stable as
$$
  select nullif(current_setting('request.jwt.claim.email', true), '')::text
$$;

-- ── Permisos en schema public ─────────────────────────────────
-- Se otorgan antes de crear las tablas para que apply también a
-- las creadas en el schema migration (via ALTER DEFAULT PRIVILEGES).
grant usage  on schema public to anon, authenticated, service_role;
grant all    on all tables    in schema public to anon, authenticated, service_role;
grant all    on all routines  in schema public to anon, authenticated, service_role;
grant all    on all sequences in schema public to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables   to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on routines to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to anon, authenticated, service_role;
