# ADR-0015 · Español e inglés sin librerías

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
El plan no incluía idiomas y la interfaz tiene todo el texto en español escrito a mano, con fechas fijas en `es-CO`. El responsable pide español e inglés en todas las pantallas, con una implementación sencilla.

## Decisión
- **Diccionarios en TypeScript:**
  - `src/i18n/es.ts` es la fuente.
  - `src/i18n/en.ts` tiene el mismo tipo: si falta una clave, no compila.
- **`t(clave, valores)` y `useT()`** con un `LocaleProvider`. Fechas y números con `Intl` en el idioma activo. Sin dependencias nuevas.
- **El idioma es un ajuste local** (`Settings.language`, `es` | `en`), guardado por Rust para que la notificación de Windows salga en el mismo idioma. La primera vez se toma el del sistema.
- **Mensajes de error del servidor y de Rust:** siguen en español en su origen. La interfaz los traduce con una tabla. Una prueba falla si un mensaje de `supabase/migrations` o de `src-tauri/src` no tiene traducción.
- **`npm run check:i18n`** (dentro de `verify`) falla si hay texto escrito a mano en JSX dentro de `src/pages`, `src/ui` o `src/app`.

## Consecuencias
- Agregar un texto exige ponerlo en los dos diccionarios.
- Las pruebas de interfaz siguen en español, que es el idioma por defecto.
- `docs/ROLES.md` sigue en español; la pantalla de privacidad traduce la matriz por número de fila.
