# ADR-0010 · Avisos de sitio no permitido y lista de apps instaladas

Fecha: 2026-10-06 · Estado: aceptado (por StehvenObando)

## Contexto
En la prueba real de ADR-0009 aparecieron tres problemas:
1. Marcar un sitio como no permitido no avisaba a nadie. Además, la regla nunca llegaba al sensor: la
   interfaz enviaba las reglas del equipo a Rust solo al arrancar o al cambiar de equipo (`team_rules = []`).
2. El tiempo en curso tardaba en verse:
   - *Mi día* se actualizaba solo cada 30 s.
   - Un bloque se subía solo 2 min después de cerrarse.
3. El selector de apps ocultas solo mostraba las apps usadas en 7 días. El responsable quiere elegir entre las instaladas.

## Decisión
- **Reglas siempre al día:** la interfaz vuelve a leer las reglas cada 5 min y al enfocar la ventana, y las
  envía a Rust cada vez que cambian. Al añadir o quitar un sitio, se reenvían al instante.
- **Avisos con sonido:** se adelanta `tauri-plugin-notification`, ya aprobado para F5.
  - Se usa **solo desde Rust**, sin permisos para la interfaz.
  - `Tracker::tick` devuelve un aviso al entrar a un dominio `not_allowed` y luego cada N minutos si la persona sigue ahí.
  - No avisa en pausa de privacidad, descanso, app oculta ni con inactividad.
- **Política de avisos** en `teams.settings.policies`:
  - `alert_not_allowed` (por defecto `true`) y `alert_repeat_minutes`: 0 = solo al entrar, 2, 5, 10, 15 o 30; por defecto 10.
  - La cambian owner y admin con `set_alert_policy`, auditada como `policy_changed`.
  - Llega a Rust por `team_policy_set`.
  - El aviso es local: no se guarda ni se sube nada nuevo, así que **no cambia el consentimiento**.
- **Subida más rápida:** un bloque se sube cuando empezó hace más de 15 s, aunque siga abierto. Las fusiones de bloques
  cortos (AC-2) ocurren antes de 10 s. El `upsert` por `id` hace que reenviar un bloque abierto no duplique nada.
- ***Mi día*** se actualiza también al enfocar la ventana.
- **Comando nuevo `installed_apps()`**:
  - Lee programas instalados del registro de Windows (`Uninstall`: `DisplayName` y el `.exe` de `DisplayIcon`; `App Paths`) y las ventanas visibles con título (`EnumWindows`).
  - Las ventanas visibles cubren apps de la Tienda, como WhatsApp.
  - Se quitan instaladores y auxiliares. La lista nunca sale del equipo.
  - *Feature* nueva `Win32_System_Registry` del crate `windows`.

## Consecuencias
- Migración `20261007000002_avisos_sitios.sql` con su prueba.
- Fila de `docs/ARQUITECTURA.md` §6, `contract.ts`, `mock.ts` y `tauri.ts`.
- En `tauri dev` la notificación sale a nombre de PowerShell: el plugin solo asigna el identificador de la app al
  ejecutable instalado. Con el instalador (`tauri build`) sale como Pulso.
- Prueba de la lista en el equipo del responsable: 108 apps en 50 ms, 7 abiertas (ejemplo `examples/apps_list.rs`, retirado tras la prueba).
- Los demás miembros reciben una regla nueva en un máximo de 5 min o al volver a Pulso.
