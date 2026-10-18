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
-- Como Supabase: toda función nueva de public se puede ejecutar como anon, authenticated y service_role
-- salvo que la migración lo revoque. Así las pruebas detectan un REVOKE olvidado.
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Storage mínimo (ADR-0014): buckets y objetos con RLS, como en Supabase.
create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null,
  owner uuid default auth.uid(),
  -- Storage guarda aquí el tamaño y el tipo del archivo subido.
  metadata jsonb,
  created_at timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant select, insert on storage.objects to authenticated;
