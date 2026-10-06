-- SOLO PARA PRUEBAS LOCALES (PGlite). NO es una migración y nunca se aplica en Supabase.
-- Recrea lo mínimo de Supabase que usan nuestras migraciones: los roles de la
-- API, el esquema auth y las funciones auth.uid() / auth.jwt().
-- A propósito NO concede permisos por defecto sobre public: así las pruebas
-- fallan si una migración olvida sus GRANT explícitos.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  -- En Supabase es null hasta verificar el correo. Aquí los usuarios nacen verificados;
  -- las pruebas que necesitan un correo sin verificar lo ponen en null.
  email_confirmed_at timestamptz default now(),
  created_at timestamptz not null default now()
);

create function auth.jwt() returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

create function auth.uid() returns uuid
language sql stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
