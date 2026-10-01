# Pulso — Arquitectura v1.2 (fuente de verdad)

> Estado: vigente desde el 1 de octubre de 2026. Reemplaza las versiones 1.0 y 1.1 conversadas antes.
> Cambios solo mediante un ADR en `docs/adr/`. Si algo no está aquí ni en una spec, **no se implementa**: se pregunta.

## 1. Qué es Pulso

App de escritorio para equipos que trabajan con IA. Registra tiempo y actividad, gestiona
tareas y genera reportes con IA. Promesa: *entiende cómo trabaja tu equipo con IA, sin vigilarlo*.

- Entrega: **lunes 19 de octubre de 2026**. Congelamiento: jueves 15 a las 23:59.
- Plataforma v1: **Windows 10/11**. macOS y Linux quedan para después de la entrega.

## 2. Glosario (vocabulario cerrado)

| Término | Significado |
|---|---|
| Equipo (`team`) | Unidad de privacidad. Todo dato pertenece a un equipo. |
| Proyecto (`project`) | Agrupa tareas dentro de un equipo. |
| Bloque de actividad (`activity_block`) | Intervalo continuo con la misma app y categoría. |
| Entrada de tiempo (`time_entry`) | Tiempo de un temporizador o registro manual, con tarea opcional. |
| Categoría | `productive` · `neutral` · `distraction` · `ai` · `break` · `idle` · `paused` |
| Hechos (`facts`) | Cifras de un reporte, calculadas por SQL. |
| Narrativa | Texto generado por IA que solo puede citar hechos. |
| Puente (`bridge`) | Contrato entre la interfaz y el núcleo Rust (`src/bridge/contract.ts`). |

## 3. Decisiones cerradas

| # | Decisión | Por qué |
|---|---|---|
| D-01 | Tauri v2 + React + TypeScript + Tailwind v4. Un solo repositorio, un solo `package.json`. | Menos piezas que coordinar. |
| D-02 | **Rust es delgado**: sensor, SQLite local, cifrado, secretos y la llamada a la IA con clave propia. Nada más. | Rust compila lento y el equipo lo está aprendiendo. |
| D-03 | La interfaz no ejecuta SQL ni ve secretos. Habla con Rust solo por los comandos de §6. | Seguridad y pruebas simples. |
| D-04 | Backend: Supabase (Auth, Postgres con RLS, Edge Functions). Sin NestJS ni AWS en v1. | Cero servidores que operar. |
| D-05 | Los **títulos de ventana nunca salen del equipo** y se guardan cifrados (AES-GCM; la clave vive en el almacén seguro del sistema). | Privacidad. Un título revela asuntos de correo o nombres de clientes. |
| D-06 | **La sincronización vive en TypeScript**: pide a Rust los registros pendientes (sin títulos), los sube con `supabase-js` y le confirma a Rust. | Quita de Rust el cliente HTTP, los reintentos y el refresco de sesión (ADR-0001). |
| D-07 | Actividad y tiempo funcionan sin conexión (UUID generado en el cliente, subida idempotente). Las tareas necesitan conexión para editarse; sin conexión se leen de una copia local. | Offline donde importa, sin resolver conflictos complejos. |
| D-08 | Conflictos en tareas: gana la última modificación (`updated_at` del servidor). | Regla simple y predecible. |
| D-09 | **Las cifras salen de SQL. La IA no calcula ni inventa números.** | Anti-alucinación (ver `docs/IA.md`). |
| D-10 | IA con **un solo formato**: API compatible con OpenAI. Tres modos: Gratis, Clave propia y Manual. | Un adaptador cubre casi todos los proveedores (ADR-0002). |
| D-11 | **Sin Docker.** Las pruebas de permisos corren con Postgres en memoria (PGlite). Supabase se usa en la nube. | Desarrollo y verificación simples (ADR-0003). |
| D-12 | Invitaciones por correo **sin enviar correos**: la invitación queda ligada al correo y aparece cuando esa persona inicia sesión. | Sin enlaces mágicos, sin límites de envío (ADR-0004). |
| D-13 | Interfaz con design tokens, atomic design y 3 tamaños de ventana (`docs/DISENO.md`). | Coherencia y velocidad. |
| D-14 | Nunca: registro de teclas, capturas de pantalla, contenido de documentos o de chats de IA. | Límite ético del producto. |
| D-15 | Los reportes son indicativos, no prueba disciplinaria. Se dice en la interfaz y en el consentimiento. | Las mediciones automáticas tienen errores. |

## 4. Vista general

```
┌───────────────── Pulso (app de escritorio, Tauri v2) ─────────────────┐
│  Interfaz (React + TS)                         Núcleo Rust (delgado)   │
│   pages ──► bridge (contrato + zod) ──invoke──►  sensor                │
│   ui: tokens → atoms → … → templates             store (SQLite, único) │
│   sync (TS): pendientes → supabase-js            crypto (AES-GCM)      │
│   supabase-js: sesión, equipos, tareas,          secrets (almacén SO)  │
│                reportes                          ai_chat (clave propia)│
└───────────────────────────────┬───────────────────────────────────────┘
                                │ HTTPS con el JWT del usuario
┌───────────────────────────────▼───────────────────────────────────────┐
│  Supabase: Auth · Postgres + RLS · funciones SQL (única vía de         │
│  escritura sensible) · Edge Function `ai-trial` (IA gratuita con cuota)│
└────────────────────────────────────────────────────────────────────────┘
```

Dos formas de ejecutar la interfaz:
- `npm run dev` → en el navegador, con el **puente simulado** (`src/bridge/mock.ts`). No necesita Rust.
- `npm run tauri dev` con `VITE_BRIDGE=tauri` → la app real con los comandos de Rust.

La interfaz muestra la etiqueta "Datos de ejemplo" siempre que usa el puente simulado.

## 5. Interfaz

- Capas y reglas: `docs/DISENO.md`. ESLint impide que una capa importe de otra superior.
- Solo `src/pages`, `src/app` y `src/dev` usan el puente; los componentes de `src/ui` reciben datos por props.
- Todo dato que llega del puente o de Supabase se valida con zod antes de usarse.
- Rutas (HashRouter): `/mi-dia`, `/tareas`, `/equipo`, `/reportes`, `/ajustes`, `/dev/galeria` (solo desarrollo).

## 6. Núcleo Rust: módulos y comandos (lista cerrada)

| Módulo | Hace | No hace |
|---|---|---|
| `sensor` | Cada 2 s lee app activa, título e inactividad. Cierra el bloque si cambia la app o la categoría, o si la inactividad supera el umbral. Fusiona bloques de menos de 10 s. | Teclas, pantalla, red. |
| `classifier` | Asigna categoría con reglas: primero las del equipo, luego `rules/default.json`. Gana la primera coincidencia. | Llamar a la red. |
| `store` | Único dueño de SQLite (modo WAL). Migraciones locales versionadas. Escribe en lote cada 10 s. | Exponer SQL a la interfaz. |
| `crypto` | Cifra y descifra títulos. | |
| `secrets` | Guarda sesión y clave de IA en el almacén seguro del sistema. | Devolver la clave de IA a la interfaz. |
| `ai` | Llama al proveedor del usuario (formato OpenAI) con su clave. | Enviar algo distinto del prompt con hechos. |

Comandos (nombres exactos; `src/bridge/contract.ts` es su espejo en TypeScript):

| Fase | Comando | Devuelve |
|---|---|---|
| F1 | `sensor_status()` | `SensorStatus` |
| F1 | `day_view(date)` | `DayView` (con títulos descifrados, solo locales) |
| F1 | `range_view(from, to)` | totales por día y categoría |
| F1 | `timer_start(task_id?)` · `timer_stop()` | `SensorStatus` |
| F1 | `break_start()` · `break_end()` | `SensorStatus` |
| F1 | `privacy_pause(minutes)` · `privacy_resume()` | `SensorStatus` |
| F1 | `time_entry_add(start, end, task_id?)` · `time_entry_update(id, …)` · `time_entry_delete(id)` | entrada |
| F1 | `settings_get()` · `settings_set(patch)` | ajustes locales (umbral de inactividad, ocultar apps) |
| F2 | `session_get()` · `session_set(json)` · `session_clear()` | sesión de Supabase |
| F2 | `sync_pending(limit)` | bloques y entradas sin subir, **sin títulos** |
| F2 | `sync_mark_synced(kind, ids)` | — |
| F2 | `rules_set(json)` | — (reglas del equipo para el clasificador) |
| F3 | `tasks_cache_put(json)` · `tasks_cache_get()` | copia local de tareas |
| F4 | `ai_config_set(base_url, model, key)` · `ai_config_get()` · `ai_config_clear()` | `ai_config_get` devuelve `{base_url, model, has_key}`, **nunca la clave** |
| F4 | `ai_chat(messages)` | texto de la respuesta |
| F5 | `export_my_data(path)` | ruta del archivo |

Agregar un comando exige actualizar esta tabla, `contract.ts` y `mock.ts` en el mismo cambio.

Seguridad de Tauri:
- `src-tauri/capabilities/default.json` solo contiene lo necesario. Prohibidos los plugins `shell`, `fs` y `http` expuestos a la interfaz.
- La interfaz no carga páginas remotas.
- La política CSP se activa y se prueba en F6 (objetivo: `default-src 'self'`; conexiones solo a Supabase y al canal interno de Tauri).

Presupuesto de rendimiento (se mide en F1 y F6): RAM en reposo < 120 MB, CPU media < 1 %, inicio < 2 s, instalador < 20 MB.

## 7. Datos

### 7.1 En la nube (Postgres). La migración SQL es el contrato.

| Tabla | Contenido | Fase |
|---|---|---|
| `profiles` | nombre visible, zona horaria | F0 ✔ |
| `teams` | nombre, `settings` (umbral de inactividad, horas de jornada, políticas) | F0 ✔ |
| `team_members` | rol de equipo, versión y fecha de consentimiento | F0 ✔ |
| `invitations` | correo, rol, quién invita, vence a los 7 días | F2 |
| `audit_log` | quién hizo qué (roles, expulsiones, IA, reportes) | F2 |
| `activity_blocks` | inicio, fin, app, categoría, herramienta de IA, tipo de uso de IA. **Sin títulos.** | F2 |
| `time_entries` | inicio, fin, tarea opcional, origen (`timer`/`manual`) | F2 |
| `classification_rules` | prioridad, tipo (`process`/`title`), patrón, categoría | F2 |
| `projects`, `project_members` | proyecto y rol de proyecto (`lead`/`contributor`) | F3 |
| `tasks` | título, descripción, responsable, estado (`todo`/`doing`/`done`), fecha límite, etiquetas, estimación | F3 |
| `report_runs` | alcance, periodo, hechos, narrativa, modo de IA, resultado de la validación | F4 |
| `ai_usage` | contador diario de la IA gratuita | F4 |

Reglas de toda migración (ya aplicadas en la primera, que sirve de modelo):
1. RLS activado en cada tabla.
2. `GRANT` explícitos; el rol `anon` no accede a nada.
3. Escrituras sensibles solo mediante funciones `SECURITY DEFINER` con `search_path = ''` que validan el rol.
4. Validación en el servidor: `user_id = auth.uid()`, fin posterior al inicio, duración máxima de 24 h, nada en el futuro.
5. Cada regla de `docs/ROLES.md` tiene una prueba en `supabase/tests`.

### 7.2 En el equipo (SQLite, solo Rust)

`activity_blocks_local` (con `title_enc` y `synced_at`), `time_entries_local`, `tasks_cache`, `kv_settings`.

### 7.3 Sincronización (TypeScript)

1. Cada 60 s, al recuperar la conexión y al enfocar la ventana: `sync_pending(200)`.
2. `upsert` en Supabase con `onConflict: 'id'` (repetir una subida no duplica nada).
3. `sync_mark_synced(...)` con los ids aceptados.
4. Si falla: reintento con espera creciente (5 s → 5 min). Los datos siguen a salvo en SQLite.

Límite conocido: con la ventana oculta, el sistema puede ralentizar los temporizadores de la interfaz;
la subida puede tardar un minuto más, pero no se pierde nada porque Rust ya lo guardó.

## 8. Roles e IA

- Roles y matriz de permisos: `docs/ROLES.md`.
- Proveedores, modos, cuotas y validación de la IA: `docs/IA.md`.

## 9. Privacidad y marco legal

- Consentimiento explícito y versionado al unirse a un equipo: qué se mide, quién lo ve, qué proveedor de IA se usa y que los datos pueden procesarse fuera de Colombia.
- Pausa de privacidad: durante la pausa solo se registra un bloque `paused`, sin detalle.
- Cada persona puede exportar sus datos y, al salir de un equipo, se borra su actividad en ese equipo.
- Referencia: Ley 1581 de 2012 (protección de datos personales, Colombia). Si se va a usar con empleados reales, hay que validarlo con asesoría.

## 10. Checklist de seguridad (cada punto es una prueba o una revisión de F6)

- [ ] Ninguna clave `service_role` ni de IA en el repositorio ni en la app.
- [ ] Cada política RLS tiene pruebas de acceso permitido y denegado por rol.
- [ ] La Edge Function verifica sesión, rol y cuota antes de llamar a la IA.
- [ ] Ningún payload de sincronización contiene títulos (prueba automática).
- [ ] Sesión y clave de IA solo en el almacén seguro del sistema.
- [ ] `npm audit` y `cargo audit` sin vulnerabilidades altas.
- [ ] CSP y capacidades mínimas de Tauri verificadas con la app real.
- [ ] Solo HTTPS; `http://` únicamente para `localhost` (modelos locales).
- [ ] Los registros no contienen datos personales ni credenciales.
