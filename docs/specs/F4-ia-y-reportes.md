# Spec F4 · IA y reportes

Funcionalidades: RI-01 a RI-10, IA-04
Estado: borrador (8 oct). Detalle de la IA en `docs/IA.md`; decisiones nuevas en ADR-0022.

## Objetivo
Al terminar, cada persona genera su reporte del día o de la semana, y quien gestiona genera el del proyecto o
del equipo. Las cifras salen de SQL; la IA solo redacta un resumen, observaciones y recomendaciones que citan
esas cifras. Funciona en tres modos: Gratis (con cupo diario), Clave propia y Manual (copiar y pegar). Los
reportes quedan en un historial y se exportan a Markdown, JSON, CSV y PDF.

## Decisiones de esta spec

| # | Decisión |
|---|---|
| D-1 | **Quién genera qué (ROLES 20 a 22).** Personal: cualquier rol menos `viewer`, solo sobre sí mismo. Proyecto: `owner`, `admin` y el `lead` de ese proyecto. Equipo: `owner` y `admin`. El `viewer` lee los reportes de equipo ya generados. |
| D-2 | **Periodos.** Hoy, ayer, esta semana, la semana pasada o un rango de hasta 31 días. Los días se cuentan en la zona horaria del perfil de quien genera. |
| D-3 | **Hechos: lista cerrada de métricas.** `get_report_facts` devuelve solo estas: horas activas y por categoría (productiva, neutral, distracción, IA), sesiones y horas de IA por herramienta y por tipo de uso, horas del temporizador, y de tareas: hechas, en revisión, vencidas, devueltas, creadas, ciclo medio en días y horas estimadas contra registradas. **Nunca** nombres de apps, dominios ni títulos (D-05, ADR-0009). Cada hecho: `{ id, metric, subject, value, unit }` con `dimension` opcional (p. ej. `code`). |
| D-4 | **Seudónimos.** `get_report_facts` devuelve `{ facts, people }`, donde `people` relaciona `M1, M2…` con cada `user_id`. A la IA solo va `facts`; la pantalla cambia `M1` por el nombre en el equipo, nunca en el servidor de la IA. |
| D-5 | **Prompt `prompts/report.v2.md`.** Igual que la v1 más el idioma de la respuesta (español o inglés, según la app). La v1 nunca se usó y queda como registro. |
| D-6 | **Validador en código, dos veces.** El de TypeScript (`supabase/functions/_shared/report-validator.ts`, sin dependencias) lo usan la app y la Edge Function para decidir el reintento. `save_report` vuelve a comprobar las cuatro reglas de `docs/IA.md` §3 en SQL, porque la app no es de fiar. Un archivo de casos compartido prueba los dos con las mismas entradas. |
| D-7 | **Si la IA falla.** Un reintento con el error explicado; si vuelve a fallar, plantilla fija hecha por el código (`validation = 'fallback'`). El reporte siempre sale. |
| D-8 | **Caché.** Si ya existe un reporte con los mismos hechos (`facts_hash`), la misma versión de prompt y el mismo idioma, se devuelve sin gastar cupo ni llamar a la IA. |
| D-9 | **Modo Gratis.** Edge Function `ai-trial` (`docs/IA.md` §4): 5 reportes por persona y día, 30 s entre peticiones, 20 por equipo y 200 en total. El día del cupo es UTC. `refund_ai_trial` solo la llama la función con `service_role`. Antes del primer reporte gratis se avisa que los hechos seudonimizados se envían a DeepSeek, fuera de Colombia. |
| D-10 | **Modo Clave propia.** Rust con `reqwest` y el TLS de Windows (ADR-0022). URL y modelo en los ajustes locales; la clave en el almacén seguro (`keyring`), nunca de vuelta a la interfaz. Solo `https://`, salvo `http://localhost` y `http://127.0.0.1`. Temperatura 0,2, 800 tokens, 30 s, `response_format: json_object` con reintento sin él si el proveedor responde 400. *Probar conexión* manda un mensaje mínimo. |
| D-11 | **Modo Manual.** *Copiar prompt* → el usuario lo pega en su chat → pega la respuesta → mismo validador. Se toma el primer objeto JSON del texto. |
| D-12 | **Etiquetar la IA (IA-04).** En *Mi día*, un bloque de categoría IA se etiqueta como código, redacción, análisis u otro con el comando nuevo `block_set_ai_usage(id, usage)`. El bloque vuelve a quedar pendiente de subir y la sincronización envía `ai_usage_type` (la columna ya existe en Supabase). |
| D-13 | **Historial (RI-09).** `/reportes` lista los reportes que la persona puede ver: los suyos, los de los proyectos que gestiona y los de equipo si es `owner`, `admin` o `viewer`. La tabla tiene RLS de lectura con esas reglas. |
| D-14 | **Exportar (RI-10).** Lo genera el código: Markdown, JSON (hechos y narrativa), CSV (solo hechos) con descarga del navegador, y PDF con una vista de impresión (`window.print`). |
| D-15 | **Auditoría.** Generar un reporte de proyecto o de equipo queda en `audit_log` (ROLES, nota de auditoría). |
| D-16 | **Las cifras de la pantalla salen de los hechos**, nunca del texto de la IA (`docs/IA.md` §3 paso 6). El texto de la IA va debajo, marcado como «redactado por IA» y «indicativo» (D-15 de la arquitectura). |

## Contratos

**Puente** (`src/bridge/contract.ts`, ARQUITECTURA §5):
- `ai_config_set(base_url, model, key?)` · `ai_config_get() → { baseUrl, model, hasKey }` · `ai_config_clear()`.
- `ai_chat(messages) → string`.
- `block_set_ai_usage(id, usage | null)`, con `usage` en `code`, `writing`, `analysis`, `other` (nuevo, ADR-0022).

**Datos** (migración `20261011000001_ia_y_reportes.sql`):
- `report_runs`: `id`, `team_id`, `scope` (`personal` · `project` · `team`), `subject_id`, `period_from`, `period_to`, `facts`, `facts_hash`, `people`, `narrative`, `mode` (`free` · `own_key` · `manual`), `validation` (`ok` · `retried` · `fallback`), `prompt_version`, `language`, `created_by`, `created_at`.
- `ai_usage`: `day`, `team_id`, `user_id`, `count`, `last_at`.
- `get_report_facts(team, scope, subject, from, to) → { facts, people }` (respeta D-1).
- `save_report(team, scope, subject, from, to, narrative, mode, validation, prompt_version, language) → report_runs.id`: recalcula los hechos, valida la narrativa (D-6) y guarda.
- `find_report(team, scope, subject, from, to, prompt_version, language)` para la caché (D-8).
- `list_reports(team, limit)`.
- `consume_ai_trial(team) → { ok, reason }` · `refund_ai_trial(team, user)` (solo `service_role`).

**Edge Function** `supabase/functions/ai-trial/index.ts` (Deno): recibe `{ team, scope, subject, from, to, language }` y responde con el reporte guardado o con `{ reason }` (429, 502 o 503).

## Criterios de aceptación

Hechos y permisos
- AC-1 Dado un equipo con bloques, entradas y tareas sembrados, cuando se piden los hechos de una persona, de un proyecto o del equipo, entonces cada cifra coincide con la calculada a mano (RI-01).
- AC-2 Los hechos nunca traen nombres de apps, dominios, títulos, correos ni nombres de personas: solo `M1, M2…`.
- AC-3 Un `member` pide los hechos personales de otra persona o los del equipo: se rechaza. Un `lead` pide los de su proyecto: sí; los de otro proyecto: no (RI-03).
- AC-4 El `viewer` ve los reportes de equipo ya generados y no puede generar ninguno.

Validador (RI-08)
- AC-5 El validador rechaza una respuesta que no cumple el esquema, que cita un hecho inexistente, que menciona un número que no está en los hechos citados (con redondeo a un decimal) o que contiene un correo o un nombre de la lista.
- AC-6 Las mismas 20 respuestas de prueba dan el mismo resultado en el validador de TypeScript y en `save_report`.
- AC-7 Si la IA responde mal dos veces, el reporte sale con la plantilla fija y lo dice.
- AC-8 En 20 reportes de prueba, ningún número inventado llega a la pantalla: las cifras se pintan desde los hechos.

Modos
- AC-9 Modo Gratis: el sexto reporte de una persona en el día responde `user_limit` y la pantalla muestra el aviso; dos peticiones a menos de 30 s responden `cooldown`; los cupos de equipo y global también se cumplen con peticiones simultáneas (RI-05).
- AC-10 Si DeepSeek falla, el cupo se devuelve. Con `AI_TRIAL_ENABLED` distinto de `true`, la función responde 503 y la pantalla lo explica.
- AC-11 Repetir un reporte con los mismos hechos no gasta cupo (D-8).
- AC-12 Clave propia: *Probar conexión* responde bien con una clave válida; con 401, 402/429, 404 o sin red explica qué pasó (RI-06).
- AC-13 `ai_config_get` nunca devuelve la clave, y la clave no aparece en los ajustes locales ni en el almacenamiento del navegador (PS-08).
- AC-14 Una URL `http://` que no sea `localhost` ni `127.0.0.1` se rechaza.
- AC-15 Modo Manual: el prompt copiado lleva los hechos sin nombres; una respuesta con formato inválido se rechaza con un mensaje claro; una válida produce el reporte (RI-07).

Reportes
- AC-16 Resumen personal del día y de la semana (RI-02); de proyecto y de equipo según el rol (RI-03).
- AC-17 El reporte trae observaciones y recomendaciones, cada una con las cifras en que se apoya (RI-04).
- AC-18 El reporte de ayer sigue en el historial y se abre igual que el día en que se generó (RI-09).
- AC-19 Markdown, JSON, CSV y PDF se generan con las mismas cifras (RI-10).
- AC-20 Generar un reporte de proyecto o de equipo deja una fila en `audit_log`.

Etiquetado de IA (IA-04)
- AC-21 Un bloque de IA en *Mi día* se etiqueta como código, redacción, análisis u otro; la etiqueta sube a Supabase y aparece en los hechos del reporte. Un bloque que no es de IA no se puede etiquetar.

Idiomas y diseño
- AC-22 Toda la pantalla de reportes y de *Ajustes → IA* está en español e inglés, y la IA responde en el idioma de la app.
- AC-23 Las pantallas nuevas están en la galería, en los tres anchos y en tema claro y oscuro, y se usan con el teclado.

## Trabajo por flujo

| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| A · Rust | `src-tauri/src/**`, `src-tauri/Cargo.toml` | `ai_config_*`, `ai_chat`, `block_set_ai_usage`, columna local `ai_usage_type` y su subida |
| B · Datos e IA | `supabase/**`, `prompts/**` | migración, Edge Function `ai-trial`, validador compartido, `report.v2.md`, pruebas PGlite |
| C · Interfaz | `src/**` | `/reportes` (generar, ver, historial, exportar), *Ajustes → IA*, modo manual, etiquetado en *Mi día*, i18n, galería |

## Fuera de alcance
- Asistente conversacional (RI-12), tareas desde texto (RI-11), clave compartida por el equipo (RI-13) y plan de ChatGPT (RI-14).
- Tableros con gráficos (F5) y la regla de si la IA cuenta como productiva (IA-05, F5).
- Programar reportes automáticos o enviarlos por correo.

## Cómo se comprueba
Puerta G4 de `docs/PLAN.md` más:
1. `npm run verify` y `npm run verify:rust` en verde.
2. El usuario aplica la migración (`npm run db:push`, `npm run db:types`), pone los secretos y despliega `ai-trial` (`docs/COMO-VERIFICAR.md` §5). Ningún agente lo hace.
3. Con dos cuentas: un `member` genera su reporte del día en los tres modos y no puede generar el del equipo; el `owner` genera el del equipo; el sexto reporte gratis muestra el aviso; exportar los cuatro formatos y abrirlos.
