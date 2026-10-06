# Spec F1 · Sensor y *Mi día*

Funcionalidades: TA-01 a TA-09, IA-01 a IA-03, PS-03, PS-04, SY-01
Estado: aprobada (por StehvenObando, 2026-10-05). Evidencia de cada criterio en `docs/spikes/F1-medicion-app-real.md`.

## Objetivo
Al terminar, Pulso registra en Windows la actividad real del usuario y *Mi día* la muestra,
con temporizador, descansos y pausa de privacidad. Todo funciona sin conexión.

## Contratos

Puente (`src/bridge/contract.ts`): los tipos `ActivityBlock`, `DayView` y `SensorStatus` ya
existen y **no cambian**. Rust debe devolver exactamente esas formas (camelCase), porque la
interfaz las valida con zod. Comandos nuevos que se agregan al contrato en esta fase:
`range_view`, `time_entry_add`, `time_entry_update`, `time_entry_delete`, `settings_get`, `settings_set`.

Base local (SQLite, la crea Rust al arrancar):

```
activity_blocks_local(id TEXT PK, started_at TEXT, ended_at TEXT, app_name TEXT,
                      title_enc BLOB NULL, category TEXT, ai_tool TEXT NULL, synced_at TEXT NULL)
time_entries_local(id TEXT PK, started_at TEXT, ended_at TEXT NULL, task_id TEXT NULL,
                   source TEXT, updated_at TEXT, deleted_at TEXT NULL, synced_at TEXT NULL)
kv_settings(key TEXT PK, value TEXT)
```

Fechas en ISO 8601 con zona (UTC). Identificadores UUID v4 generados en Rust.

Reglas por defecto (`src-tauri/rules/default.json`): lista ordenada de
`{ "match": "process" | "title", "pattern": "<texto en minúsculas>", "category": "...", "ai_tool": "..." | null }`.
Coincidencia por "contiene", sin distinguir mayúsculas. Gana la primera. Sin coincidencia: `neutral`.

## Criterios de aceptación

Sensor y bloques
- AC-1 Dado el sensor activo, cuando la app en primer plano cambia, entonces el bloque anterior se cierra y empieza uno nuevo en menos de 4 s.
- AC-2 Dado un bloque de menos de 10 s entre dos bloques de la misma app y categoría, entonces los tres se fusionan en uno.
- AC-3 Dado que no hay teclado ni ratón durante el umbral configurado (5 min por defecto), entonces el bloque activo se cierra en el momento de la última interacción y empieza un bloque `idle`.
- AC-4 Dado un cierre inesperado de la app, al volver a abrir se conservan los bloques escritos (pérdida máxima: 10 s).

Clasificación y uso de IA
- AC-5 Dadas las reglas por defecto, un título que contiene "chatgpt", "claude", "gemini", "deepseek" o "copilot" produce `category = "ai"` con el `ai_tool` correspondiente.
- AC-6 Un proceso llamado `ollama` o `lm studio` produce `category = "ai"`.
- AC-7 El clasificador es una función pura con pruebas para cada regla por defecto.

Privacidad
- AC-8 Durante una pausa de privacidad solo se escribe un bloque `paused` con `app_name = "Pulso"` y sin título.
- AC-9 El título se guarda cifrado (`title_enc`); abrir el archivo SQLite con otra herramienta no muestra títulos legibles.
- AC-10 La clave de cifrado se crea en el primer arranque y vive en el almacén seguro del sistema, no en un archivo.
- AC-11 La pausa termina sola al cumplirse los minutos.
- AC-20 Apps ocultas (ajuste local): la persona define una lista de apps por nombre de proceso, sin distinguir mayúsculas. Mientras una de ellas está en primer plano, el bloque se guarda con `app_name = "App oculta"`, sin título y con categoría `neutral`; el tiempo cuenta en la jornada. Se aplica antes de clasificar y solo desde que se activa, no hacia atrás. No es lo mismo que «No compartir nombres de apps» (PS-05, F5), que solo afecta a lo que se sube a la nube.

Tiempo
- AC-12 `timer_start` crea una entrada abierta; `timer_stop` la cierra. Con un temporizador ya en marcha, `timer_start` devuelve un error claro.
- AC-13 `time_entry_add` rechaza un fin anterior al inicio, una duración de más de 24 h y fechas futuras.
- AC-14 `break_start` cierra el bloque actual y abre uno `break` hasta `break_end`.

*Mi día*
- AC-15 `day_view(date)` devuelve los bloques del día local, los totales por categoría en segundos, y el inicio y fin de la jornada (primer y último bloque que no sea `idle` ni `paused`).
- AC-16 Con `VITE_BRIDGE=tauri`, *Mi día* muestra los datos reales y desaparece la etiqueta "Datos de ejemplo".
- AC-17 *Mi día* se actualiza sola cada 30 s mientras la ventana está visible.
- AC-18 Todo lo anterior funciona sin conexión a internet.

Rendimiento
- AC-19 Tras una hora de uso: la memoria privada (suma de Pulso y sus procesos de WebView2, medida tras 5 minutos en reposo, ADR-0006) por debajo de 120 MB y la CPU media por debajo del 1 %. El conjunto de trabajo se anota solo como dato.

## Trabajo por flujo

| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| A · Rust | `src-tauri/**` | Módulos `sensor`, `classifier`, `store`, `crypto`; comandos de F1; pruebas de AC-2, AC-5 a AC-7, AC-13 |
| B · Datos | `supabase/migrations/**`, `supabase/tests/**` | Migración y pruebas de `activity_blocks`, `time_entries`, `classification_rules` (adelanto de F2) |
| C · Interfaz | `src/**` | `tauri.ts` y `mock.ts` con los comandos nuevos; registro manual de tiempo; actualización periódica; ajustes locales |

## Fuera de alcance
- Sesión, equipos y sincronización (F2).
- Asociar el temporizador a una tarea real (F3): por ahora `task_id` es siempre nulo.
- Editor de reglas del equipo (F5).
- macOS y Linux.

## Cómo se comprueba
Puerta G1 de `docs/PLAN.md`.
