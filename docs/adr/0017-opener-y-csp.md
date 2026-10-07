# ADR-0017 · Abrir enlaces con tauri-plugin-opener y CSP activa

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
- Los enlaces de evidencia y los archivos firmados se abrían con `target="_blank"` y `window.open`. En la app de escritorio, Tauri no abre el navegador sin un plugin.
- La CSP estaba desactivada (`"csp": null`) hasta F6.

## Decisión
- **Dependencia nueva:** `tauri-plugin-opener`, el plugin oficial de Tauri. Se usa solo desde un comando de Rust, `open_external(url)`, que rechaza todo lo que no empiece por `https://`.
  - La interfaz no recibe permisos del plugin: no se añade nada a `capabilities/`.
  - Prohibidos siguen `shell`, `fs` y `http`.
- **CSP activa desde ahora:**
  - `default-src 'self'`.
  - `connect-src`: Tauri y el proyecto de Supabase (`https://*.supabase.co`, `wss://*.supabase.co`).
  - `img-src 'self' data: blob:`.
  - `style-src 'self' 'unsafe-inline'`, por los estilos calculados de la franja de pulso.
  - `font-src 'self'`.

## Consecuencias
- Una fila nueva en ARQUITECTURA §6 y en `docs/STACK.lock.md`.
- La revisión de F6 comprueba la CSP con la app compilada.
