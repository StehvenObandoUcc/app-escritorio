# ADR-0001 · La sincronización vive en TypeScript

Fecha: 2026-10-01 · Estado: aceptado

## Contexto
La versión 1.0 ponía en Rust el cliente HTTP, los reintentos y el refresco de la sesión.
El plazo pasó de siete semanas a 18 días y el equipo está aprendiendo Rust, que además compila despacio.

## Decisión
Rust solo entrega los registros pendientes (`sync_pending`, sin títulos) y marca los subidos
(`sync_mark_synced`). TypeScript los sube con `supabase-js`, que ya gestiona la sesión.

## Consecuencias
- Menos Rust: sin cliente HTTP ni manejo de tokens hasta F4 (y ahí solo para la IA con clave propia).
- La interfaz sigue sin ejecutar SQL: todo acceso a SQLite pasa por comandos.
- Con la ventana oculta la subida puede retrasarse cerca de un minuto. No se pierde nada: Rust ya guardó los datos.
- Si se da soporte a macOS, hay que revisar esta decisión (allí los temporizadores de una ventana oculta se frenan más).
