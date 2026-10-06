# STACK.lock — versiones fijadas

> Regla R1: se usa **solo** lo que aparece aquí. Agregar una dependencia exige un ADR aprobado en `docs/adr/` y actualizar este archivo en el mismo cambio.
> Las versiones exactas están en `package-lock.json` y `src-tauri/Cargo.lock`; esta tabla es su resumen legible (generada el 1 de octubre de 2026).

Varias de estas versiones son recientes. **No uses una API de memoria**: compruébala en los tipos instalados (regla R2).

## Entorno

| Herramienta | Versión |
|---|---|
| Node.js | 22 o superior |
| npm | el que trae Node |
| Rust | estable (edición 2024, mínimo 1.90) |
| CLI de Supabase | 2.119.0, con `npx` (no se instala) |

## Interfaz (dependencias)

| Paquete | Versión | Uso |
|---|---|---|
| `@fontsource-variable/bricolage-grotesque` | 5.3.0 | Tipografía de títulos |
| `@fontsource-variable/figtree` | 5.3.0 | Tipografía de texto |
| `@tauri-apps/api` | 2.12.1 | Llamadas a Rust |
| `lucide-react` | 1.49.0 | Iconos |
| `react` | 19.3.0 | Interfaz |
| `react-dom` | 19.3.0 | Interfaz |
| `react-router` | 8.4.0 | Rutas (HashRouter) |
| `zod` | 4.6.5 | Validación de contratos |

## Herramientas de desarrollo

| Paquete | Versión | Uso |
|---|---|---|
| `@electric-sql/pglite` | 0.5.8 | Postgres en memoria para pruebas |
| `@eslint/js` | 10.0.1 | Lint |
| `@tailwindcss/vite` | 4.3.3 | Tailwind en Vite |
| `@tauri-apps/cli` | 2.12.1 | Herramienta de Tauri |
| `@testing-library/jest-dom` | 7.0.1 | Comprobaciones de DOM |
| `@testing-library/react` | 16.3.3 | Pruebas de componentes |
| `@testing-library/user-event` | 14.6.7 | Interacción en pruebas |
| `@types/node` | 26.6.3 | Tipos |
| `@types/react` | 19.3.0 | Tipos |
| `@types/react-dom` | 19.3.0 | Tipos |
| `@vitejs/plugin-react` | 6.1.1 | React en Vite |
| `eslint` | 10.11.0 | Lint |
| `eslint-plugin-react-hooks` | 7.1.1 | Reglas de hooks |
| `globals` | 17.13.0 | Lint |
| `jsdom` | 29.1.1 | DOM para pruebas |
| `tailwindcss` | 4.3.3 | Estilos desde tokens |
| `typescript` | 6.0.3 | Tipos |
| `typescript-eslint` | 8.71.0 | Lint de TypeScript |
| `vite` | 8.3.2 | Servidor y empaquetado |
| `vitest` | 5.0.3 | Pruebas |

## Rust (`src-tauri`)

| Crate | Versión |
|---|---|
| `tauri` | 2.12.1 |
| `tauri-build` | 2.7.1 |
| `tauri-plugin-log` | 2.10.0 |
| `serde` | 1.0.229 |
| `serde_json` | 1.0.151 |
| `log` | 0.4.34 |
| `wry` | 0.57.0 |
| `tao` | 0.37.1 |

## Aprobadas, se instalan en su fase

Están aprobadas pero aún no instaladas. Quien las instale anota aquí la versión exacta que quedó.

| Paquete o crate | Fase | Uso | Versión instalada |
|---|---|---|---|
| `@supabase/supabase-js` | F2 | Sesión y datos en la nube | 2.117.2 |
| `@tanstack/react-query` | F2 | Caché y estados de carga de datos remotos | 5.104.1 |
| `windows` (solo Windows) | F1 | Ventana activa e inactividad (S-1). Desde F2 también UI Automation para el dominio del navegador: *features* `Win32_UI_Accessibility`, `Win32_System_Com`, `Win32_System_Variant`, `Win32_System_Ole` (S-5, ADR-0009) | 0.62.2 |
| `rusqlite` (con SQLite incluido) | F1 | Base local | 0.40.2 |
| `aes-gcm` | F1 | Cifrado de títulos | 0.11.1 |
| `keyring` | F1 | Almacén seguro del sistema (modo `v1`; trae `keyring-core` 1.0.0 y `windows-native-keyring-store` 1.1.0) | 4.2.0 |
| `uuid`, `chrono` | F1 | Identificadores y fechas | 1.27.0 · 0.4.45 |
| `reqwest` (TLS con rustls) | F4 | Llamada a la IA con clave propia | pendiente |
| `tauri-plugin-notification` | F5 | Avisos del sistema | pendiente |
| `tauri-plugin-autostart` | F6 | Abrir con el sistema | pendiente |

Los crates se agregan con `cargo add <nombre>` dentro de `src-tauri`, que toma la última versión estable; no se escribe la versión de memoria.

## No se usa (decidido)

| Qué | En su lugar |
|---|---|
| Docker y Supabase local | PGlite para pruebas; Supabase en la nube |
| Librerías de gráficas | Barras y franjas propias con CSS y tokens |
| Librerías de componentes (MUI, shadcn…) | Átomos propios en `src/ui` |
| Storybook | Galería en `#/dev/galeria` |
| Plugins `shell`, `fs` y `http` de Tauri hacia la interfaz | Comandos propios de Rust |
