# ADR-0007 · Equipo activo en Rust: comando `active_team_set`

Fecha: 2026-10-06 · Estado: aceptado (spec F2)

## Contexto
En la nube, cada bloque y cada entrada de tiempo pertenece a un equipo (`team_id`), y una fila no puede
cambiar de equipo. En el equipo, SQLite no sabía a qué equipo pertenecía cada fila. Si la interfaz
añadiera el equipo activo al subir, una persona que trabaja sin red, cambia de equipo y luego recupera la
conexión subiría su actividad al equipo equivocado. Además, PS-02 exige que lo registrado sin
consentimiento no se suba.

## Decisión
- Comando nuevo `active_team_set(team_id | null)`. La interfaz lo llama al elegir equipo, **solo cuando la
  persona ya dio su consentimiento** en ese equipo; si no, pasa `null`.
- Rust guarda `team_id` en cada bloque, entrada y cierre en el momento de crearlo. Al cambiar de equipo
  cierra el bloque abierto, para que ningún bloque quede repartido entre dos equipos.
- `sync_pending` solo entrega filas del equipo activo. Las filas con `team_id` nulo nunca se suben.
- El equipo activo se guarda en `kv_settings` y sobrevive a un reinicio.

## Consecuencias
- Un comando más en Rust, `contract.ts`, `mock.ts`, `tauri.ts` y `docs/ARQUITECTURA.md` §6.
- Migración local 2 de SQLite: columna `team_id` y tabla `app_closures_local`.
- Lo registrado antes de unirse a un equipo se queda en el equipo de la persona y nunca se comparte.
- Las filas pendientes de un equipo del que la persona salió quedan en SQLite sin subirse (fuera de alcance en F2).
