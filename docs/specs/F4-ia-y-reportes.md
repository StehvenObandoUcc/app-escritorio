# Spec F4 · IA y reportes

Funcionalidades: RI-01 a RI-10, IA-04
Estado: aprobada (por StehvenObando, 8 oct). Detalle de la IA en `docs/IA.md`; decisiones nuevas en ADR-0022.

## Objetivo
Al terminar, cada persona genera su reporte del día o de la semana, y quien gestiona genera el del proyecto o
del equipo. Las cifras salen de SQL; la IA solo redacta un resumen, observaciones y recomendaciones que citan
esas cifras. Funciona en tres modos: Gratis (con cupo diario), Clave propia y Manual (copiar y pegar). Los
reportes quedan en un historial y se exportan a Markdown, JSON, CSV y PDF.

## Decisiones de esta spec

| # | Decisión |
|---|---|
| D-1 | **Quién genera qué (ROLES 20 a 22).** Personal: cualquier rol menos `viewer`, solo sobre sí mismo. Proyecto: `owner`, `admin` y el `lead` de ese proyecto. Equipo: `owner` y `admin`. Los reportes de proyecto y de equipo exigen `members >= 2`; con menos, `get_report_facts` y `save_report` responden «Hacen falta al menos 2 miembros para un reporte de grupo». |
| D-2 | **Periodos: hoy, ayer, esta semana y la semana pasada.** La semana va de lunes a domingo. El servidor calcula las fechas en la zona horaria del perfil de quien genera; no hay rango libre. |
| D-3 | **Hechos: lista cerrada de métricas** (ver *Diccionario de métricas*). **Nunca** nombres de apps, dominios ni títulos (D-05, ADR-0009). Cada hecho: `{ id, metric, dimension, value, unit }`. |
| D-4 | **Sin desglose por persona.** Los reportes de proyecto y de equipo solo llevan totales del grupo; la IA solo escribe sobre una persona en el reporte personal de esa misma persona. La comparación entre miembros queda en F5 (DR-07). Por eso no hay seudónimos: ningún hecho identifica a nadie. |
| D-5 | **Prompt `prompts/report.v2.md`.** Igual que la v1 más el idioma de la respuesta (español o inglés, según la app). Prohíbe calcular: los porcentajes y proporciones vienen como hechos propios (`share_*`). La v1 nunca se usó y queda como registro. |
| D-6 | **Un solo validador completo, en TypeScript** (`supabase/functions/_shared/report-validator.ts`, un archivo sin importaciones). Corre en la Edge Function en modo Gratis y en la app en Clave propia y Manual. `save_report` recalcula los hechos y solo comprueba la forma: esquema de la narrativa, que cada `fact_id` exista en los hechos recalculados y longitudes máximas. `save_report` siempre guarda `validated_by = 'client'`. Después de guardar, la Edge Function llama a `mark_trial_report(id)` (solo `service_role`), que lo pasa a `server` si `mode = 'free'`, `validated_by = 'client'` y `created_at` es de hace menos de 5 minutos. Si esa llamada falla, el reporte queda `client`. Sin tabla de vales. |
| D-7 | **Reglas del validador** (`docs/IA.md` §3): esquema; `fact_id` existente; cada número del texto está en los hechos citados (el resumen, en cualquier hecho), redondeado a un decimal; sin correos ni nombres de miembros del equipo. Para los números: ignora los dígitos de los identificadores de hechos (`F1`); acepta coma y punto decimal; permite el día, el mes y el año de las fechas del periodo. Límite aceptado: no detecta números escritos en letras («tres»). |
| D-8 | **Si la IA falla.** Un reintento con el error explicado; si vuelve a fallar, plantilla fija hecha por el código (`validation = 'fallback'`). El reporte siempre sale. |
| D-9 | **Caché e historial con `SELECT` bajo RLS.** `get_report_facts` devuelve `{ facts, facts_hash }`; el hash se calcula en SQL (`sha256` del `jsonb` con los hechos en orden fijo por `metric` y `dimension`). Si ya hay un reporte con el mismo alcance, sujeto, `period_from`, `period_to`, `facts_hash`, versión de prompt e idioma (la etiqueta del periodo no basta: dos días con hechos idénticos son dos reportes), se muestra ese, sin gastar cupo ni llamar a la IA. |
| D-10 | **Modo Gratis.** Edge Function `ai-trial` (`docs/IA.md` §4): 5 reportes por persona y día, 30 s entre peticiones, 20 por equipo y 200 en total. **El día del cupo se cuenta en `America/Bogota`.** La plantilla de respaldo tras respuestas inválidas **sí** cuenta cupo; solo se devuelve si falla la red o el proveedor (sin respuesta, 5xx, 429 del proveedor). Guarda con el JWT de la persona; `service_role` solo para `refund_ai_trial` y `mark_trial_report` (D-6). Antes del primer reporte gratis se avisa que los hechos se envían a DeepSeek, fuera de Colombia. |
| D-11 | **Modo Clave propia.** Rust con `reqwest` y el TLS de Windows (ADR-0022). URL y modelo en los ajustes locales; la clave en el almacén seguro (`keyring`), nunca de vuelta a la interfaz. Solo `https://`, salvo `http://localhost` y `http://127.0.0.1`. Temperatura 0,2, **1200 tokens**, 30 s, `response_format: json_object`. Si el proveedor responde 400, **un** reintento con el cuerpo mínimo (`model` y `messages`). *Probar conexión* manda un mensaje mínimo. |
| D-12 | **Modo Manual.** *Copiar prompt* → el usuario lo pega en su chat → pega la respuesta → mismo validador. Se toma el primer objeto JSON del texto con un lector de llaves balanceadas que respeta las cadenas; tolera bloques de código (```` ```json ````) y texto antes o después. |
| D-13 | **Etiquetar la IA (IA-04).** En *Mi día*, un bloque de categoría IA se etiqueta como código, redacción, análisis u otro. Local: comando `block_set_ai_usage(id, usage)`. Nube: función `set_block_ai_usage(id, usage)`, que exige ser dueño del bloque y `category = 'ai'`, más la restricción `CHECK (ai_usage_type is null or category = 'ai')`. Si el bloque aún no se ha subido, `ai_usage_type` viaja con el bloque; `set_block_ai_usage` solo se usa para bloques ya sincronizados. Quitar la etiqueta (`null`) también se sube. |
| D-14 | **Historial y visibilidad (RI-09, ROLES 35 a 37).** `/reportes` lista con `SELECT` bajo RLS: los de equipo, para todos los roles del equipo; los de proyecto, para `owner`, `admin` y los miembros de ese proyecto; los personales, solo para su autor. |
| D-15 | **Exportar (RI-10).** Lo genera el código: Markdown, JSON (hechos y narrativa) y CSV (solo hechos) con descarga desde la página, y PDF con una vista de impresión (`window.print`). Si alguna de las dos no funciona en la app real (V1), un comando de Rust guarda el archivo en `Documentos\Pulso`, sin dependencias nuevas. |
| D-16 | **Auditoría.** Generar un reporte de proyecto o de equipo queda en `audit_log` (ROLES, nota de auditoría). |
| D-17 | **Salida del equipo (P7).** Al salir o ser expulsada, se borran también los reportes personales de esa persona en ese equipo (`leave_team`, `remove_member`). Los de proyecto y equipo que generó se conservan: no tienen datos personales. |
| D-18 | **Datos al día (P8).** Antes de generar «hoy», la app sincroniza. `data_until` lo calcula `save_report`, no la app: en el personal, el fin del último bloque sincronizado de la persona; en proyecto y equipo, la hora de generación. El reporte muestra «datos hasta HH:MM». |
| D-19 | **Las cifras de la pantalla salen de los hechos**, nunca del texto de la IA (`docs/IA.md` §3 paso 6). El texto de la IA va debajo, marcado como «redactado por IA» e «indicativo» (D-15 de la arquitectura). |

## Diccionario de métricas

Periodo: `[desde 00:00, hasta + 1 día 00:00)` en la zona horaria del perfil. «Solapado» = la parte de un intervalo que cae dentro del periodo.

| Métrica (`dimension`) | Alcance | Definición | Unidad · redondeo |
|---|---|---|---|
| `hours_active` | personal, equipo | Suma solapada de `activity_blocks` con `category in ('productive','neutral','distraction','ai')`. No cuentan `break`, `idle` ni `paused`. | h · 1 decimal |
| `hours_category` (`productive`, `neutral`, `distraction`, `ai`) | personal, equipo | Lo mismo, por cada categoría. | h · 1 decimal |
| `share_category` (las mismas) | personal, equipo | `100 × hours_category ÷ hours_active`; 0 si no hay tiempo activo. | % · entero |
| `ai_sessions` | personal, equipo | Número de bloques con `category = 'ai'` que empiezan en el periodo. El sensor ya separa un bloque al cambiar de app o de categoría. | n · entero |
| `hours_ai_tool` (`chatgpt`, `claude`, `gemini`, `deepseek`, `copilot`, `ollama`, `lmstudio`, `other`) | personal, equipo | Horas de IA por herramienta. `ai_tool` se pasa a minúsculas y solo vale si es uno de esos siete; cualquier otro valor, o ninguno, cuenta como `other`. Así ningún texto libre llega al prompt. | h · 1 decimal |
| `hours_ai_usage` (`code`, `writing`, `analysis`, `other`, `untagged`) | personal, equipo | Horas de IA por `ai_usage_type`; sin etiqueta = `untagged`. | h · 1 decimal |
| `hours_timer` | todos | Suma solapada de `time_entries` cerradas (`ended_at` no nulo). Personal: las propias. Proyecto: las de sus tareas, de todas las personas. Equipo: todas. | h · 1 decimal |
| `tasks_done` | todos | Tareas con `completed_at` en el periodo y `status = 'done'`. Personal: aquellas cuyo responsable es la persona. | n · entero |
| `tasks_created` | todos | Tareas con `created_at` en el periodo. Personal: las que creó la persona. | n · entero |
| `tasks_returned` | todos | Revisiones con `status = 'changes_requested'` y `decided_at` en el periodo. Personal: las que envió la persona. | n · entero |
| `tasks_in_review` | todos | Tareas con `status = 'review'` en el momento del reporte. | n · entero |
| `tasks_overdue` | todos | Tareas con `status <> 'done'` y `due_date` anterior a hoy y no posterior al último día del periodo, en el momento del reporte. Personal: aquellas cuyo responsable es la persona. | n · entero |
| `cycle_days_avg` | todos | Promedio de `completed_at − started_at` de las tareas de `tasks_done` con `started_at` no nulo. Se omite si no hay ninguna. | d · 1 decimal |
| `hours_estimated` / `hours_logged` | todos | De las tareas de `tasks_done`: suma de `estimate_minutes ÷ 60` (solo las que tienen estimación) y horas de todas sus `time_entries` cerradas, de cualquier fecha. | h · 1 decimal |
| `share_on_estimate` | todos | `100 × hours_logged ÷ hours_estimated`, solo con tareas que tienen estimación; se omite si no hay. | % · entero |
| `members` | proyecto, equipo | Miembros del proyecto o del equipo (sin `viewer`). | n · entero |

Los estados de las tareas (`tasks_in_review`, `tasks_overdue`) son los del momento del reporte, no los del final del periodo: el historial (`task_events`) no se reconstruye. Se dice en la pantalla.

## Contratos

**Puente** (`src/bridge/contract.ts`, ARQUITECTURA §5):
- `ai_config_set(base_url, model, key?)` · `ai_config_get() → { baseUrl, model, hasKey }` · `ai_config_clear()`.
- `ai_chat(messages) → string`.
- `block_set_ai_usage(id, usage | null)` (nuevo, ADR-0022). Un bloque sin subir lleva `ai_usage_type` en `sync_pending`; uno ya subido aparece en una lista aparte de etiquetas pendientes (también `null`).
- ~~`export_save`~~: no hace falta (V1 pasó).

**Datos** (migración `20261011000001_ia_y_reportes.sql`):
- `report_runs`: `id`, `team_id`, `scope` (`personal` · `project` · `team`), `subject_id`, `period` (`today` · `yesterday` · `this_week` · `last_week`), `period_from`, `period_to`, `facts`, `facts_hash`, `narrative`, `mode` (`free` · `own_key` · `manual`), `validation` (`ok` · `retried` · `fallback`), `validated_by` (`server` · `client`), `prompt_version`, `language`, `data_until` (lo calcula `save_report`, D-18), `created_by`, `created_at`. RLS de lectura según D-14; sin escritura directa.
- `ai_usage`: `day` (en `America/Bogota`), `team_id`, `user_id`, `count`, `last_at`.
- `get_report_facts(team, scope, subject, period) → { facts, facts_hash }` (respeta D-1).
- `save_report(team, scope, subject, period, narrative, mode, validation, prompt_version, language) → id`: recalcula los hechos, comprueba la forma (D-6) y guarda.
- `set_block_ai_usage(id, usage)` (solo bloques ya sincronizados).
- `mark_trial_report(id)` (solo `service_role`, D-6).
- `consume_ai_trial(team) → { ok, reason }` · `refund_ai_trial(team, user)` (solo `service_role`).
- `leave_team` y `remove_member` borran también los reportes personales (D-17).

**Edge Function** `supabase/functions/ai-trial/index.ts` (Deno): recibe `{ team, scope, subject, period, language }` y responde con el reporte guardado o con `{ reason }` (429, 502 o 503).

## Criterios de aceptación

Hechos y permisos
- AC-1 Dado un equipo con bloques, entradas y tareas sembrados, cuando se piden los hechos de una persona, de un proyecto o del equipo en cada periodo, entonces cada cifra coincide con el *Diccionario de métricas* calculado a mano (RI-01).
- AC-2 Los hechos nunca traen nombres de apps, dominios, títulos, correos, nombres ni identificadores de personas; los de proyecto y equipo no tienen desglose por persona.
- AC-3 Un `ai_tool` con texto libre (por ejemplo, una instrucción para la IA) cuenta como `other` en `hours_ai_tool`; solo aparecen las ocho dimensiones permitidas.
- AC-4 Los mismos datos dan el mismo `facts_hash`; un cambio en los datos lo cambia.
- AC-5 Un `member` pide los hechos personales de otra persona o los del equipo: se rechaza. Un `lead` pide los de su proyecto: sí; los de otro proyecto: no (RI-03).
- AC-6 Un proyecto o un equipo con menos de 2 miembros no admite reporte de grupo y lo dice con un mensaje claro.
- AC-7 Visibilidad: un reporte de equipo lo ven todos los roles del equipo, incluido `viewer`; uno de proyecto, `owner`, `admin` y los miembros de ese proyecto (no un `member` ajeno); uno personal, solo su autor. El `viewer` no genera ninguno.

Validador y guardado (RI-08)
- AC-8 El validador rechaza una respuesta que no cumple el esquema, que cita un hecho inexistente, que menciona un número que no está en los hechos citados o que contiene un correo o el nombre de un miembro. Los casos de prueba incluyen `F1`, coma y punto decimal, números de las fechas del periodo y un número en letras (que pasa: límite aceptado).
- AC-9 `save_report` rechaza una narrativa con otra forma, con un `fact_id` que no está en los hechos recalculados o con textos más largos que el máximo; siempre guarda `validated_by = 'client'`.
- AC-10 `mark_trial_report`: un usuario normal no puede ejecutarla; pasa a `server` un reporte gratis recién guardado; un reporte de hace más de 5 minutos, o que no es `free`, no se marca.
- AC-11 `data_until` lo pone el servidor: en el personal es el fin del último bloque sincronizado; en proyecto y equipo, la hora de generación.
- AC-12 Si la IA responde mal dos veces, el reporte sale con la plantilla fija y lo dice.
- AC-13a Con 20 respuestas grabadas en las pruebas automáticas, ningún número inventado llega a la pantalla: las cifras se pintan desde los hechos.
- AC-13b Un script hace una vez 20 reportes reales y anota cuántos terminan en la plantilla. Meta: 3 o menos.

Modos
- AC-14 Modo Gratis: el sexto reporte de una persona en el día (de `America/Bogota`) responde `user_limit` y la pantalla muestra el aviso; dos peticiones a menos de 30 s responden `cooldown` (RI-05).
- AC-15 Los cupos de equipo y global se cumplen con peticiones simultáneas: lo comprueba un script contra `pulso-dev` que ejecuta el usuario (PGlite no puede probarlo).
- AC-16 Si DeepSeek no responde o falla, el cupo se devuelve; si responde mal y sale la plantilla, no. Con `AI_TRIAL_ENABLED` distinto de `true`, la función responde 503 y la pantalla lo explica.
- AC-17 Repetir un reporte con los mismos hechos y las mismas fechas muestra el guardado y no gasta cupo; dos días con hechos idénticos producen dos reportes distintos (D-9).
- AC-18 Clave propia: *Probar conexión* responde bien con una clave válida; con 401, 402/429, 404 o sin red explica qué pasó; ante un 400 reintenta una vez con el cuerpo mínimo (RI-06).
- AC-19 `ai_config_get` nunca devuelve la clave, y la clave no aparece en los ajustes locales ni en el almacenamiento del navegador (PS-08).
- AC-20 Una URL `http://` que no sea `localhost` ni `127.0.0.1` se rechaza.
- AC-21 Modo Manual: el prompt copiado lleva solo los hechos; una respuesta dentro de un bloque de código o con texto alrededor se lee bien; una con formato inválido se rechaza con un mensaje claro (RI-07).

Reportes
- AC-22 Resumen personal de hoy, ayer, esta semana y la semana pasada (RI-02); de proyecto y de equipo según el rol (RI-03).
- AC-23 El reporte de hoy muestra «datos hasta HH:MM» después de sincronizar.
- AC-24 El reporte trae observaciones y recomendaciones, cada una con las cifras en que se apoya (RI-04).
- AC-25 El reporte de ayer sigue en el historial y se abre igual que el día en que se generó (RI-09).
- AC-26 Markdown, JSON, CSV y PDF se generan con las mismas cifras y se guardan en la app real (RI-10).
- AC-27 Generar un reporte de proyecto o de equipo deja una fila en `audit_log`.
- AC-28 Al salir o ser expulsada de un equipo, los reportes personales de esa persona en ese equipo se borran.

Etiquetado de IA (IA-04)
- AC-29 Un bloque de IA en *Mi día* se etiqueta como código, redacción, análisis u otro. Si el bloque no se ha subido, la etiqueta viaja con él; si ya se subió, va con `set_block_ai_usage`. Quitar la etiqueta (`null`) también sube. Aparece en `hours_ai_usage`. Un bloque que no es de IA, o de otra persona, no se puede etiquetar.

Idiomas y diseño
- AC-30 Toda la pantalla de reportes y de *Ajustes → IA* está en español e inglés (la app ya lo está desde F3, ADR-0015), y la IA responde en el idioma de la app.
- AC-31 Las pantallas nuevas están en la galería, en los tres anchos y en tema claro y oscuro, y se usan con el teclado.

## Trabajo por flujo

Orden: primero V1, porque decide si hace falta `export_save`.

| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| V1 · Comprobación | ninguno (prueba en la app real) | ¿Funcionan la descarga desde la página y `window.print()` en la app real? Resultado anotado en esta spec |
| A · Rust | `src-tauri/src/**`, `src-tauri/Cargo.toml` | `ai_config_*`, `ai_chat` (1200 tokens, reintento con cuerpo mínimo), `block_set_ai_usage` y etiquetas pendientes en `sync_pending`; `export_save` solo si V1 falla |
| B · Datos e IA | `supabase/**`, `prompts/**`, `scripts/**` | Migración (tablas, `get_report_facts`, `save_report`, `set_block_ai_usage`, `mark_trial_report`, cupos, borrado al salir), Edge Function `ai-trial`, validador compartido con sus casos, `report.v2.md`, pruebas PGlite, scripts de AC-13b y AC-15 |
| C · Interfaz | `src/**` | `/reportes` (generar, ver, historial, exportar), *Ajustes → IA*, modo manual, etiquetado en *Mi día*, sincronizar antes de «hoy», i18n, galería |

## Fuera de alcance
- Comparación entre miembros y desglose por persona en reportes de proyecto o de equipo (F5, DR-07).
- Rango de fechas libre.
- Asistente conversacional (RI-12), tareas desde texto (RI-11), clave compartida por el equipo (RI-13) y plan de ChatGPT (RI-14).
- Tableros con gráficos (F5) y la regla de si la IA cuenta como productiva (IA-05, F5).
- Programar reportes automáticos o enviarlos por correo.

## Resultado de V1 (8 oct)
Probado en la app real (`tauri dev`, WebView2 en Windows 11) con dos botones temporales en `/reportes`, pulsados por UI Automation:
- **Descarga desde la página:** un `<a download>` con un `Blob` guarda el archivo directamente en `Descargas` (`pulso-v1.md`, 5 bytes), sin preguntar.
- **`window.print()`:** abre el diálogo de impresión de WebView2 con la impresora «Microsoft Print to PDF», que sirve para guardar el PDF.

Conclusión: D-15 se queda como está y **no se crea `export_save`**. La pantalla dirá que el archivo quedó en *Descargas*.

## Cómo se comprueba
Puerta G4 de `docs/PLAN.md` más:
1. `npm run verify` y `npm run verify:rust` en verde.
2. El usuario aplica la migración (`npm run db:push`, `npm run db:types`), pone los secretos y despliega `ai-trial` (`docs/COMO-VERIFICAR.md` §5). Ningún agente lo hace.
3. El usuario ejecuta los scripts de AC-13b (20 reportes reales) y AC-15 (cupos con peticiones simultáneas contra `pulso-dev`).
4. Con dos cuentas: un `member` genera su reporte de hoy en los tres modos y no puede generar el del equipo; el `owner` genera el del equipo; el sexto reporte gratis muestra el aviso; exportar los cuatro formatos y abrirlos.
