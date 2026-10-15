# Spec F5 · Tableros, privacidad y ajustes del equipo

Funcionalidades: DR-01 a DR-05, DR-06 (solo PDF), DR-07, TA-10, TA-11, IA-02 (pantalla), IA-05, EQ-09, EQ-10 (pantalla), PS-05, PS-06, PS-07 (filas F5), CU-07. Además, la corrección del supuesto 5 de F4 (`data_until`).
Estado: borrador v2 (13 oct), revisado por el agente revisor. Decisiones de producto tomadas por el responsable el 13 oct: reglas por app solo para lo nuevo; *Mi semana/Mi mes* con categorías, IA y proyectos; exportar a *Descargas*. Falta la aprobación formal.
Recortado el 12 oct (PLAN §4, decisión del responsable): NO-01 a NO-03, CU-06 y la exportación a CSV de DR-06. Pasan a después de la entrega.

## Objetivo
Al terminar, cada rol abre *Tablero* y ve exactamente lo que le toca: owner y admin, quién está activo, horas,
productividad, uso de IA y capacidad por persona; el lead, el tiempo y la IA de las personas de sus proyectos
dentro de esos proyectos; member y viewer, los totales del equipo sin nombres. Cada persona ve *Mi semana* y
*Mi mes*, puede dejar de compartir los nombres de sus apps y exportar sus datos. Owner y admin ajustan el
equipo (umbral, jornada, regla de IA, tope de pausa, presencia visible), crean reglas por app y revisan la auditoría.

## Definiciones (valen para toda la spec)

- **Periodo**: `[p_from, p_to)` — `p_to` es exclusivo, igual que `team_activity_summary`. La interfaz calcula los límites a las 00:00 en la zona horaria del perfil de quien consulta (`profiles.timezone`, por defecto `America/Bogota`). Máximo 92 días; si no, 22023.
- **Solapado**: la parte de un intervalo que cae dentro del periodo (`least(fin, p_to) − greatest(inicio, p_from)`).
- **`hours_active`**: suma solapada de `activity_blocks` con `category in ('productive','neutral','distraction','ai')`. No cuentan `break`, `idle` ni `paused` (mismo criterio que F4).
- **Horas de IA**: bloques con `category = 'ai'` (no basta `ai_tool`). **Sesiones de IA**: número de esos bloques que empiezan en el periodo.
- **Horas de temporizador**: `time_entries` no borradas, con `coalesce(ended_at, now())` como fin (como `project_time_summary`), solapadas con el periodo.
- **`per_day`**: días calendario en la zona horaria del perfil de quien consulta.
- **Días de la jornada**: ISO, 1 = lunes … 7 = domingo (como `teams.settings.workday.days`).
- **Error de permisos**: siempre `No permitido` con código 42501. Error de datos: 22023.

## Decisiones de esta spec

| # | Decisión |
|---|---|
| D-1 | **Página nueva `/tablero`**, con entrada «Tablero» en la navegación para todos los roles. Periodos: hoy, esta semana, este mes, la semana pasada y el mes pasado (semana de lunes a domingo; mes de calendario). |
| D-2 | **Una sola función de lectura `team_dashboard(team, from, to) → jsonb`** que arma el tablero según el rol de quien llama (forma exacta en *Contratos*). Todas las cifras salen de ahí (D-09 de la arquitectura); la interfaz solo da formato. |
| D-3 | **Totales sin nombres (fila 15)** para todos los roles. Si el equipo tiene menos de 2 miembros sin contar `viewer` (como `report_members` de F4), member y viewer reciben `totals: null` y `per_day: []`, y la pantalla dice «Hacen falta al menos 2 miembros». Owner y admin siempre reciben los totales. |
| D-4 | **Presencia (DR-01, fila 24)**: `team_presence(team)`. Estado según el último bloque subido de cada persona: si `ended_at >= now() − 3 min`, `productive`/`neutral`/`distraction`/`ai` → `active`, `idle` → `idle`, `paused` → `paused`, `break` → `break`; si no hay bloque reciente, `offline`. Devuelve `since` = inicio de ese bloque (nulo si `offline`). **Nunca** app, dominio ni herramienta de IA. Quién: owner y admin, a todos los miembros sin `viewer`; lead, a las personas de sus proyectos; member, a todos solo si `teams.settings.policies.presence_visible_to_members = true` (por defecto `false`), si no 42501; viewer, 42501. La pantalla la pide cada 60 s. |
| D-5 | **El lead ve solo sus proyectos** (filas 13 y 14 «P»). Por cada persona de sus proyectos: `project_hours` = horas de temporizador en tareas de sus proyectos; `ai_hours_in_projects` = horas de IA de esa persona **solapadas con esos mismos temporizadores**, recortadas al periodo; `tasks_doing` de sus proyectos. Sin capacidad, sin apps, sin categorías y sin personas ajenas a sus proyectos. Si alguien es lead y además owner/admin, recibe la vista de owner/admin. |
| D-6 | **Capacidad usada (DR-07)**, solo owner y admin: `capacity_hours` = (fin − inicio de la jornada) × número de días laborales del periodo **hasta hoy incluido**; `capacity_share` = `100 × hours_active ÷ capacity_hours`, entero; si `capacity_hours = 0`, `capacity_share` es `null`. |
| D-7 | **Regla de IA (IA-05)**: `teams.settings.policies.ai_counts_as_productive` (por defecto `false`). Con `true`, `hours_productive` = horas `productive` + `ai`; con `false`, solo `productive`. Afecta al tablero y a *Mi semana/Mi mes*. **No** cambia las categorías guardadas ni los hechos de F4. |
| D-8 | **No compartir nombres de apps (PS-05)**. Columna nueva `team_members.share_app_names boolean not null default true`, que la persona cambia con `set_share_app_names(team, share)` (se añade a la regla «nadie escribe `team_members` directamente»). Tres capas: (1) **cliente, la principal**: `MyTeam` trae `shareAppNames`; mientras sea `false`, `src/sync/engine.ts` cambia cada bloque a `appName = 'App oculta'` y `domain = null` **antes** de subirlo, así el nombre no sale del equipo; (2) **servidor, respaldo**: un activador `before insert or update` en `activity_blocks` fuerza lo mismo si la persona tiene `share_app_names = false`; (3) al apagarlo, `set_share_app_names` cambia también sus bloques ya subidos en ese equipo. La categoría y `ai_tool` se conservan. Encender de nuevo solo afecta a lo nuevo. Es un derecho personal, independiente de la política de equipo `allow_hidden_apps` (ADR-0009). Owner y admin ven «Solo categorías» junto a esa persona. |
| D-9 | **Ajustes del equipo (EQ-09)**: `set_team_settings(team, idle_minutes, workday, ai_counts_as_productive, presence_visible_to_members, pause_cap_minutes)`, solo owner y admin. Validación: `idle_minutes` entre 3 y 15, o `null` (sin valor de equipo); `workday` = `{days, start, end}` con días entre 1 y 7 sin repetir, al menos uno, y `start < end` en formato `HH:MM`; `pause_cap_minutes` ∈ {0, 15, 30, 60, 120, 240} (0 = sin tope). Guarda en `teams.settings`: `idle_minutes`, `workday`, `policies.ai_counts_as_productive`, `policies.presence_visible_to_members`, `policies.pause_cap_minutes`, sin borrar las demás claves. Escribe `settings_changed` en `audit_log` con los valores. Renombrar el equipo sigue como está (solo owner, fila 1). |
| D-10 | **Umbral del equipo en el sensor sin tocar Rust**: si el equipo activo tiene `idle_minutes`, la app llama a `settings_set({ idleMinutes })` al cargar o cambiar de equipo y cada vez que llega un valor distinto. En *Ajustes*, el campo queda desactivado con «Lo define el equipo». Sin valor de equipo, sigue el ajuste personal. El valor del equipo queda guardado como ajuste personal: si después el equipo quita su valor, se mantiene el último aplicado. |
| D-11 | **Tope de pausa (PS-06)**: si `pause_cap_minutes > 0`, la pausa de privacidad solo ofrece minutos hasta lo que queda del día (tope − segundos `paused` de hoy según `day_view`); sin minutos restantes, el botón queda desactivado con el motivo. **Límite aceptado: se aplica en la interfaz, no en Rust** (anotado para F7). |
| D-12 | **Auditoría (EQ-10)**: pestaña nueva «Auditoría» en *Equipo*, solo owner y admin, con `SELECT` a `audit_log` bajo la RLS que ya existe: 50 filas por página, de la más nueva a la más vieja, «Cargar más» por `id` (`id < último`), filtro por acción. Cada acción de la restricción vigente tiene texto en español e inglés; quien ya no está en el equipo se muestra como «Exmiembro». |
| D-13 | **Reglas por app (TA-11)**. La pestaña «Sitios y políticas» pasa a llamarse «Reglas y políticas» (las políticas se quedan ahí) y suma la sección «Apps»: elegir una app de `installed_apps()` o escribir el nombre del proceso, elegir categoría (`productive`, `neutral`, `distraction`, `ai`) y guardar. Nube: métodos nuevos `processRules(teamId)` y `addProcessRule(teamId, pattern, category)`, y para borrar el `removeDomainRule(ruleId)` existente si sirve para cualquier regla (si no, `removeRule(ruleId)`). El insert va directo bajo la política `classification_rules_insert` (solo owner y admin), con `match_type = 'process'`, `pattern` = nombre en minúsculas, sin espacios al borde y sin `.exe` final, `priority = 0` (igual que los sitios), `ai_tool = null`, `created_by` = la cuenta. Tras guardar o borrar se invalida la consulta `['team-rules', …]` de `src/app/session.tsx` para que llegue al sensor con `rules_set`. **Decisión del responsable: aplica solo a los bloques nuevos**; lo ya registrado no se reclasifica. La lista de apps sin teclado (TA-15) sigue fija. |
| D-14 | **Mi semana y Mi mes (TA-10, DR-05)** dentro de `/mi-dia`, con un selector Día · Semana · Mes y flechas para moverse. Datos locales con `range_view(from, to)` (incluye ambos días): horas por día y categoría, total activo, «Productivas» (con D-7) e IA, sin red. Con conexión, tiempo por proyecto y tarea con `my_time_by_task`; sin conexión esa sección dice «Sin conexión». **Decisión del responsable: sin desglose por app** (sigue solo en el día). |
| D-15 | **Exportar mis datos (CU-07)**: comando de Rust `export_my_data()` (**ADR-0023**: sin argumento, aprobado por el responsable; cambia la fila de ARQUITECTURA §6). Escribe `%USERPROFILE%\Downloads\pulso-mis-datos-AAAA-MM-DD.json` con `blocks` (con título descifrado: es de la propia persona y no sale a la red), `time_entries` y `closures` **solo de la cuenta activa**, y devuelve la ruta. Sin crates nuevos. La función interna recibe el directorio como parámetro para poder probarla; el comando le pasa `USERPROFILE\Downloads`. Botón en *Ajustes → Mi privacidad*. |
| D-16 | **Gráficas sin librerías** (R1): barras apiladas por día y barras horizontales hechas en `src/ui` con tokens; cada gráfica tiene al lado su tabla equivalente (visible para lectores de pantalla). |
| D-17 | **PDF del tablero (DR-06)**: botón «Imprimir / PDF» con `window.print()`, igual que F4 D-15; navegación y controles con `print:hidden`. |
| D-18 | **Supuesto 5 de F4**: en `save_report`, si la persona no tiene bloques en el periodo, `data_until` queda `null` (hoy toma el fin del periodo porque `LEAST` ignora los nulos, `20261011000001_ia_y_reportes.sql:352`). Se reemplaza la función copiando el cuerpo vigente y cambiando solo ese cálculo. |
| D-19 | **Dónde va cada cosa**: los ajustes del equipo, en la pestaña «General» de *Equipo* (sección visible solo para owner y admin). «No compartir nombres de apps» y «Exportar mis datos», en una sección nueva *Ajustes → Mi privacidad* (`src/pages/ajustes/MiPrivacidadSection.tsx`, claves `myPrivacy.*`); `/equipo/privacidad` no cambia. |

## Contratos

**Datos** (migración nueva `supabase/migrations/20261013000001_tableros_y_privacidad.sql`; las anteriores no se editan):
- `team_members.share_app_names boolean not null default true` y el activador de D-8.
- `audit_log.action`: se reemplaza la restricción conservando **todas** las acciones de la versión vigente (`20261011000001_ia_y_reportes.sql:57`) y añadiendo `settings_changed` y `share_apps_changed`.
- `team_dashboard(p_team uuid, p_from timestamptz, p_to timestamptz) → jsonb`, `security definer`, `search_path = ''`:
  ```
  { role: 'owner'|'admin'|'member'|'viewer', is_lead: boolean,
    totals: null | { members, hours_active, hours_productive,
                     hours_category: {productive, neutral, distraction, ai},
                     ai_hours, ai_sessions, ai_tool: {<herramienta>: horas}, ai_usage: {code, writing, analysis, other, untagged},
                     tasks_doing, tasks_done },
    per_day: [ { day: 'AAAA-MM-DD', hours_category: {productive, neutral, distraction, ai} } ],
    members: [ { user_id, name, share_app_names, hours_active, hours_productive, hours_category, ai_hours, ai_sessions,
                 capacity_hours, capacity_share, tasks_doing: [ { id, title, project_id, project_name } ] } ],   -- owner y admin
    lead_members: [ { user_id, name, project_hours, ai_hours_in_projects,
                      tasks_doing: [ { id, title, project_id, project_name } ] } ],                         -- lead (D-5)
    top_apps: [ { app_name, hours } ] }                                                                     -- owner y admin
  ```
  Horas con 1 decimal; porcentajes enteros; `ai_tool` normalizada con `report_ai_tool` (F4). `tasks_doing` = tareas con `status = 'doing'` en el momento de la consulta; `tasks_done` = `status = 'done'` con `completed_at` en el periodo. `top_apps`: las 10 con más `hours_active`, sin `'App oculta'`. `members`, `lead_members` y `top_apps` van como `[]` para quien no puede verlos. Un member o viewer nunca recibe `user_id` ni `name` en ninguna parte.
- `team_presence(p_team uuid) → table (user_id uuid, name text, state text, since timestamptz)` (D-4).
- `set_team_settings(p_team uuid, p_idle_minutes integer, p_workday jsonb, p_ai_counts_as_productive boolean, p_presence_visible_to_members boolean, p_pause_cap_minutes integer) → void` (D-9).
- `set_share_app_names(p_team uuid, p_share boolean) → void` (D-8): exige ser miembro no `viewer` del equipo.
- `my_time_by_task(p_team uuid, p_from timestamptz, p_to timestamptz) → table (project_id uuid, project_name text, task_id uuid, task_title text, seconds bigint)`: solo entradas propias, con las definiciones de arriba; sin tarea → `task_id` y `project_id` nulos. Un `viewer` o alguien fuera del equipo: 42501.
- `save_report`: reemplazo con D-18.
- Permisos: `revoke execute ... from public, anon` y `grant execute ... to authenticated` para `team_dashboard`, `team_presence`, `set_team_settings`, `set_share_app_names`, `my_time_by_task` y `save_report`. Cualquier función auxiliar nueva que no sea una de esas seis queda revocada también para `authenticated` (como F4, supuesto 9). La lista `ALLOWED` de `supabase/tests/ia_y_reportes.test.ts` se amplía con las cinco nuevas.

**Puente** (`src/bridge/contract.ts`, `mock.ts`, `tauri.ts`): `exportMyData(): Promise<string>` (ruta del archivo).

**Nube** (`src/cloud/contract.ts`, real `supabase.ts` y simulada `mock.ts`; todo validado con zod):
- `MyTeamSchema` y el mapeo de `myTeams()` suman: `idleMinutes: number | null`, `workday: { days, start, end }`, `aiCountsAsProductive: boolean`, `presenceVisibleToMembers: boolean`, `pauseCapMinutes: number`, `shareAppNames: boolean` (de la fila propia en `team_members`). Valores por defecto si faltan: `null`, la jornada por defecto, `false`, `false`, `0`, `true`.
- Métodos nuevos: `teamDashboard(teamId, from, to)`, `teamPresence(teamId)`, `setTeamSettings(teamId, settings)`, `setShareAppNames(teamId, share)`, `myTimeByTask(teamId, from, to)`, `auditLog(teamId, { beforeId?, action? })`, `processRules(teamId)`, `addProcessRule(teamId, pattern, category)` (y `removeRule(ruleId)` solo si `removeDomainRule` no sirve).

**Roles** (`docs/ROLES.md`, en el mismo cambio que la migración):
- Fila 14 · «P»: horas de IA solapadas con sus temporizadores en tareas de sus proyectos (D-5); fase F5.
- Fila 24 · member: «si el equipo lo permite» = `presence_visible_to_members` (D-4).
- Fila nueva 38 · Cambiar los ajustes del equipo (umbral, jornada, regla de IA, presencia visible, tope de pausa): owner ✔ · admin ✔ · resto — · F5.
- Fila nueva 39 · No compartir nombres de apps: S para owner, admin, member + lead y member; viewer — · F5.
- Fila nueva 40 · Ver la comparativa y la capacidad por persona (DR-07): owner ✔ · admin ✔ · resto — · F5. (El lead solo ve `lead_members`, filas 13 y 14.)
- Regla de integridad: añadir `set_share_app_names` a la lista de funciones que escriben `team_members`.

**Documentos** que cambian con esta spec: `docs/FUNCIONALIDADES.md` (TA-11: «Marcar una app como distracción y ver que los bloques nuevos salen así»; TA-15: «Lista fija; editable después de la entrega»; DR-06: «solo PDF en F5»; NO-01 a NO-03 y CU-06: «recortado, después de la entrega»), `docs/ARQUITECTURA.md` (§5 ruta `/tablero`; §6 `export_my_data()`) y `docs/adr/0023-exportar-a-descargas.md`.

## Criterios de aceptación

Datos y permisos (PGlite; un equipo con owner, admin, lead, member y viewer, y alguien de otro equipo):
- AC-1 Con datos sembrados, owner y admin reciben `totals`, `per_day`, `members` con todas las personas sin `viewer` (incluido `tasks_doing` de cada una) y `top_apps`; las horas coinciden con las calculadas a mano con las *Definiciones*.
- AC-2 El lead recibe `members = []`, `top_apps = []` y `lead_members` solo con personas de sus proyectos, con `project_hours` y `ai_hours_in_projects` iguales a los calculados a mano (incluye un bloque de IA que solo se solapa en parte con un temporizador, y un temporizador abierto).
- AC-3 Member y viewer reciben `totals` y `per_day`; el JSON completo no contiene ningún `user_id` ni `name`.
- AC-4 En un equipo con solo owner + viewer, el viewer recibe `totals: null` y `per_day: []`; el owner sí recibe totales.
- AC-5 Alguien de otro equipo recibe 42501 en `team_dashboard`, `team_presence`, `my_time_by_task` y `set_share_app_names`; un periodo de más de 92 días o con `p_to <= p_from` da 22023.
- AC-6 `team_presence`: owner y admin ven a todos; el lead, solo a las personas de sus proyectos; el member recibe 42501 con la política en `false` y ve a todos con `true`; el viewer, 42501. Estados según D-4 (bloque terminado hace 1 min → `active`; hace 5 min → `offline`; `paused` → `paused`). El resultado no tiene columnas de app, dominio ni herramienta.
- AC-7 Capacidad: jornada L–V 08:00–18:00 y periodo del lunes al miércoles de hoy → `capacity_hours = 30`; con 15 h activas, `capacity_share = 50`; con jornada sin días, `capacity_share = null`.
- AC-8 IA-05: con `false`, `hours_productive` = horas `productive`; con `true`, `productive + ai`. `get_report_facts` devuelve los mismos hechos en ambos casos.
- AC-9 PS-05: tras `set_share_app_names(team, false)`, los bloques ya subidos de esa persona en ese equipo tienen `app_name = 'App oculta'` y `domain` nulo; un `upsert` nuevo con nombre real queda igual; sus bloques de otro equipo no cambian; `top_apps` no la incluye; `members[].share_app_names = false`; hay una fila `share_apps_changed`. El viewer recibe 42501.
- AC-10 `set_team_settings`: owner y admin pueden; lead, member y viewer reciben 42501; `idle_minutes = 2`, días repetidos o vacíos, `start >= end` y tope 45 dan 22023; las demás claves de `teams.settings` se conservan; hay una fila `settings_changed` con los valores.
- AC-11 `my_time_by_task` solo devuelve entradas propias; las de otra persona del equipo no aparecen; una entrada sin tarea sale con `task_id` nulo.
- AC-12 D-18: un reporte personal de «hoy» sin bloques guarda `data_until` nulo; con bloques, el fin del último.
- AC-13 La prueba de la lista exacta de funciones que puede ejecutar `authenticated` incluye las cinco nuevas y pasa.

Interfaz (Vitest con la nube y el puente simulados):
- AC-14 `/tablero` muestra a cada rol solo sus secciones (AC-1 a AC-3); sin datos, estado vacío; con error, mensaje traducido (UI-07). Con `totals: null`, el aviso de D-3.
- AC-15 La presencia se pide cada 60 s (temporizadores falsos) y cada estado se ve con texto, no solo con color.
- AC-16 Cada gráfica tiene su tabla equivalente con las mismas cifras del JSON. (15 oct, decisión del responsable: en «Uso de IA» y «Apps más usadas» la lista de barras, que dice nombre y valor en texto, cuenta como equivalente; no llevan tabla aparte.)
- AC-17 «Imprimir / PDF» llama a `window.print()` y la navegación y los controles tienen `print:hidden`.
- AC-18 *Mi día* tiene Día · Semana · Mes; Semana pide `range_view` de lunes a domingo y Mes del día 1 al último; las flechas cambian el periodo; con `aiCountsAsProductive = true`, «Productivas» suma IA.
- AC-19 Con conexión, *Mi semana/Mi mes* lista el tiempo por proyecto y tarea; sin conexión, «Sin conexión» y el resto sigue visible.
- AC-20 *Equipo → General → Ajustes del equipo* (owner y admin) guarda con `setTeamSettings`; los demás roles no ven la sección. Con `idleMinutes` del equipo, la app llama a `settingsSet({ idleMinutes })` y *Ajustes* muestra el campo desactivado con «Lo define el equipo».
- AC-21 Con tope de 30 min y 20 min ya pausados hoy, la pausa ofrece como máximo 10 min; con 30 o más, el botón está desactivado con el motivo.
- AC-22 *Equipo → Auditoría* (owner y admin) muestra 50 filas, «Cargar más» pide las siguientes con `beforeId` y el filtro por acción funciona; cada acción tiene texto en los dos idiomas.
- AC-23 *Equipo → Reglas y políticas → Apps* crea una regla con el patrón normalizado (`Code.exe ` → `code`) y la borra; la lista sale de `installedApps()`; después de guardar se vuelve a llamar a `rulesSet` con la regla nueva.
- AC-24 *Ajustes → Mi privacidad*: el interruptor llama a `setShareAppNames` y explica qué cambia; con `shareAppNames = false`, la sincronización sube los bloques con `appName = 'App oculta'` y `domain = null` (prueba de `src/sync`).
- AC-25 *Ajustes → Mi privacidad → Exportar mis datos* llama a `exportMyData()` y muestra la ruta.
- AC-26 Todas las pantallas nuevas están en la galería, se ven bien en los 3 anchos y en tema claro y oscuro, y se recorren con teclado (ADR-0021).

Rust:
- AC-27 La función de exportación, con un directorio temporal, escribe un JSON válido con `blocks`, `time_entries` y `closures` solo de la cuenta activa (base local de prueba con dos cuentas) y devuelve la ruta; el comando `export_my_data` está registrado y en `contract.ts`/`mock.ts`.

## Trabajo por flujo

Orden: PUL-50 y PUL-51 en paralelo; luego, de una en una (todas tocan `src/i18n`), 52 → 53 → 54 → 55 → 56.

| Ficha | Flujo | Archivos permitidos | Entrega |
|---|---|---|---|
| PUL-50 | B · Datos | `supabase/migrations/20261013000001_tableros_y_privacidad.sql` (nuevo), `supabase/tests/tableros_y_privacidad.test.ts` (nuevo), `supabase/tests/ia_y_reportes.test.ts` (solo la lista `ALLOWED`), `docs/ROLES.md` | Migración y AC-1 a AC-13 |
| PUL-51 | A · Rust | `src-tauri/src/**`, `src/bridge/contract.ts`, `src/bridge/mock.ts`, `src/bridge/tauri.ts`, `docs/ARQUITECTURA.md` (§6, fila de `export_my_data`), `docs/adr/0023-exportar-a-descargas.md` (nuevo), `docs/adr/README.md` | `export_my_data()` y AC-27 |
| PUL-52 | C · Nube | `src/cloud/**`, `src/lib/database.types.ts` (regenerado con `db:types` por el responsable; si aún no, se usan los tipos a mano solo dentro de `src/cloud` y se anota) | Campos nuevos de `MyTeam` y métodos nuevos, con sus pruebas |
| PUL-53 | C · Interfaz | `src/pages/mi-dia/**`, `src/ui/**`, `src/i18n/*` (claves `myRange.*`, `charts.*`), `src/dev/**` | Mi semana / Mi mes y componentes de gráfica (AC-16 parcial, AC-18, AC-19) |
| PUL-54 | C · Interfaz | `src/pages/tablero/**` (nuevo), `src/app/**` (ruta y navegación), `src/ui/**`, `src/i18n/*` (claves `dashboard.*`, `nav.*`), `src/dev/**`, `docs/ARQUITECTURA.md` (§5, rutas) | Tablero (AC-14 a AC-17) |
| PUL-55 | C · Interfaz | `src/pages/equipo/**`, `src/app/session.tsx` (solo exponer la invalidación de reglas, si hace falta), `src/i18n/*` (claves `teamSettings.*`, `audit.*`, `rules.*`, `sites.*`, `team.tabs.*`), `src/dev/**` | Ajustes del equipo, Auditoría y Reglas (AC-20 parte Equipo, AC-22, AC-23) |
| PUL-56 | C · Interfaz | `src/pages/ajustes/**`, `src/pages/mi-dia/**` (solo la pausa), `src/sync/**`, `src/app/**` (aplicar el umbral, D-10), `src/i18n/*` (claves `myPrivacy.*`, `pause.*`, `settings.*`), `src/dev/**` | PS-05, PS-06, CU-07 y D-10 (AC-20 parte Ajustes, AC-21, AC-24, AC-25) |

El orquestador actualiza `docs/FUNCIONALIDADES.md` y `docs/PLAN.md` (§9).

## Fuera de alcance
- Avisos del sistema (NO-01 a NO-03), sus preferencias (CU-06) y exportar el tablero a CSV.
- Reclasificar bloques ya registrados; editar la lista de apps sin teclado; desglose por app en *Mi semana/Mi mes*.
- Aplicar el tope de pausa en Rust (F7).
- Tiempo real (se pide cada 60 s), alertas para líderes y asistente del equipo (F8).
- Cambiar los reportes de F4 (salvo D-18).

## Cómo se comprueba
Puerta G5 de `docs/PLAN.md`, adaptada a los recortes:
1. `npm run verify` y `npm run verify:rust` en verde.
2. El responsable aplica la migración (`npm run db:push`, `npm run db:types`).
3. AC-1 a AC-6: cada rol ve exactamente su columna de la matriz.
4. En la app real, con dos cuentas: las cifras de hoy del tablero coinciden con *Mi día* de cada persona.
5. Quien apaga «compartir nombres de apps» aparece en el tablero del owner solo con categorías.
6. Congelamiento el jueves 15 a las 23:59: desde ahí solo se corrigen errores.
