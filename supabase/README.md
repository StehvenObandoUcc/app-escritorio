# Base de datos

- `migrations/` — SQL que define tablas, permisos (RLS) y funciones. Es la fuente de verdad.
  Nombre: `AAAAMMDDhhmmss_descripcion.sql`. Una migración ya aplicada **no se edita**: se crea otra.
- `tests/` — pruebas de permisos con Postgres en memoria. `npm run test:db`
  - `harness.ts` aplica todas las migraciones y permite consultar "como" un usuario.
  - `_supabase_stub.sql` imita lo mínimo de Supabase. Solo se usa en pruebas.
- `functions/` — Edge Functions (desde F4).
- `config.toml` — configuración de la CLI de Supabase.

Cómo aplicar las migraciones a la nube: `docs/COMO-VERIFICAR.md` §5.

Toda migración sigue las cinco reglas de `docs/ARQUITECTURA.md` §7.1 y llega con sus pruebas.
La primera migración es el modelo a copiar.
