# ADR-0003 · Pruebas de base de datos con PGlite, sin Docker

Fecha: 2026-10-01 · Estado: aceptado

## Contexto
Supabase local exige Docker. Se pidió un desarrollo simple de comprobar, sin Docker.
Los permisos (RLS) son la frontera de seguridad: no pueden quedar sin pruebas.

## Decisión
Las migraciones se prueban con PGlite, un Postgres real compilado a WebAssembly que corre
dentro de Node. `supabase/tests/_supabase_stub.sql` recrea lo mínimo de Supabase
(roles `anon` y `authenticated`, `auth.users`, `auth.uid()`).

## Consecuencias
- `npm run test:db` corre en segundos, sin instalar nada y sin red.
- Las migraciones solo usan SQL estándar de Postgres y llevan `GRANT` explícitos.
- No se prueban el servicio de cuentas ni las Edge Functions: se comprueban a mano en las puertas de F2 y F4.
- Una extensión de Postgres nueva exige verificar antes que PGlite la incluye.
