# Spec F2 · Cuentas, equipos, roles y sincronización

Funcionalidades: CU-01 a CU-04, EQ-01 a EQ-08, EQ-10 (datos), PS-01, PS-02, PS-08 (sesión), PS-09, SY-02, SY-03, SY-05
Estado: borrador (pendiente de aprobación de StehvenObando)

## Objetivo
Al terminar, dos personas con cuenta propia forman un equipo: una lo crea e invita, la otra acepta con
consentimiento, y la actividad y el tiempo de ambas llegan a Supabase —sin títulos de ventana— aunque
hayan trabajado sin conexión. Cada persona ve solo lo que su rol permite.

## Decisiones que esta spec cierra (A-1 y A-3 de `docs/PLAN.md` §8.4)

| # | Decisión | Propuesta |
|---|---|---|
| A-1 | Jornada | Se define en `teams.settings.workday = { "days": [1,2,3,4,5], "start": "08:00", "end": "18:00" }` (días 1 = lunes … 7 = domingo), en la zona horaria del perfil de cada miembro. Valor por defecto al crear el equipo. La pantalla para editarla es EQ-09 (F5). |
| A-1 | Cierres de Pulso | Cerrar Pulso detiene el registro (F1). Al **volver a abrir**, Rust compara la hora del último dato guardado con la hora de arranque: si hubo un hueco de más de 2 minutos dentro de la jornada, guarda un **cierre** (`app_closures`) con hora de inicio y fin. Rust no puede avisar en el instante del cierre porque el proceso ya no existe. |
| A-1 | Quién ve los cierres | La persona (los suyos), el `owner` y el `admin` (todos los del equipo). Es la fila 26 nueva de `docs/ROLES.md`. Un cierre fuera de la jornada no se guarda. |
| A-3 | Salida de un equipo | Misma regla para salir por cuenta propia y para ser expulsado: se borran sus `activity_blocks` y `app_closures` de ese equipo, se **conservan** sus `time_entries` (se muestran como «Exmiembro» en los totales) y queda un registro en `audit_log`. Se corrige con una migración nueva; la anterior no se edita. |

Otras decisiones tomadas aquí (confirmar al aprobar):
- **Consentimiento sin cambiar `create_team`.** Una función nueva `give_consent(team, version)` fija `consent_version` y `consent_at`. Quien crea un equipo la llama justo después. Sin consentimiento, ninguna política deja subir actividad ni tiempo (PS-02).
- **Qué equipo recibe cada fila.** Rust guarda `team_id` en cada bloque y entrada local al crearla, tomándolo del equipo activo. Si no hay equipo activo (o aún no hay consentimiento), `team_id` queda nulo y esa fila **nunca se sube**: lo registrado antes de unirse a un equipo no se comparte.
- **Sesión.** Se guarda con `session_set` desde un adaptador de almacenamiento de `supabase-js`. El almacén de credenciales de Windows limita el tamaño de cada secreto y una sesión con sus tokens puede superarlo: **antes de implementar se comprueba (R2)**. Si no cabe, Rust guarda la sesión cifrada con la clave AES-GCM existente en `kv_settings`, y la clave sigue en el almacén seguro.
- **Registro sin verificar el correo (ADR-0008, aprobado el 6 oct).** Supabase Auth con *Confirm email* desactivado. Una invitación se acepta con el correo invitado **y** un código de 8 caracteres que comparte quien invita.

## Contratos

### Puente (`src/bridge/contract.ts`, `mock.ts`, `tauri.ts`, `docs/ARQUITECTURA.md` §6)
Comandos de la tabla de §6: `session_get()`, `session_set(json)`, `session_clear()`, `sync_pending(limit)`,
`sync_mark_synced(kind, ids)`, `rules_set(json)`.
Comando nuevo (ADR-0007): `active_team_set(team_id | null)`, que fija el equipo al que se asignan las filas nuevas.
Los tipos nuevos (`SyncBatch`, `SessionJson`, reglas) se validan con zod.

`sync_pending(limit)` devuelve `{ blocks: [...], entries: [...] }` solo del equipo activo, **sin título**. Tipos: bloque
(`id`, `teamId`, `startedAt`, `endedAt`, `appName`, `category`, `aiTool`) y entrada (`id`, `teamId`, `startedAt`,
`endedAt`, `taskId`, `source`, `updatedAt`, `deletedAt`). También devuelve los cierres pendientes.

### Datos (migración nueva en `supabase/migrations/`)
- `invitations(id, team_id, email, role, invited_by, status, expires_at, created_at)`. `status`: `pending`, `accepted`, `declined`, `revoked`. `expires_at` = creación + 7 días. El correo se guarda en minúsculas.
- `audit_log(id, team_id, actor_id, action, target_user, details jsonb, created_at)`. Nadie escribe directamente: solo las funciones de abajo.
- `app_closures(id, team_id, user_id, closed_at, reopened_at, created_at)`.
- Funciones (`SECURITY DEFINER`, `search_path = ''`, con `GRANT` explícito):
  `invite_member(team, email, role)` · `revoke_invitation(id)` · `my_invitations()` · `accept_invitation(id, consent_version)` ·
  `decline_invitation(id)` · `give_consent(team, version)` · `team_time_summary(team, from, to)`.
  El registro de auditoría se lee con `select` sobre `audit_log`: su política solo deja ver a owner y admin.
- Reemplazos (`create or replace`): `set_member_role`, `remove_member`, `leave_team` y `create_team` escriben en `audit_log`; el activador de salida aplica A-3.
- Políticas de `activity_blocks`, `time_entries` y `app_closures`: además de las actuales, exigen `consent_at is not null` para insertar y actualizar.
- Cada tabla con RLS activado y `GRANT` explícitos (reglas de `docs/ARQUITECTURA.md` §7.1).

### Documentos que cambian en el mismo PR
- `docs/ROLES.md`: fila 26 (cierres) y nota de A-3 ya vigente.
- `docs/ARQUITECTURA.md`: §5 (acceso obligatorio: sin sesión solo se ve la pantalla de acceso), §6 (comandos), §7.1 (`app_closures`) y §9.
- `docs/adr/0007-equipo-activo-en-rust.md`.
- `docs/STACK.lock.md`: versiones instaladas de `@supabase/supabase-js` y `@tanstack/react-query`.

## Criterios de aceptación

Cuentas (CU-01 a CU-04, PS-08, PS-09)
- AC-1 Dado un correo nuevo, cuando se registra con contraseña, entonces entra a la app al instante (ADR-0008). Sin sesión solo se ve la pantalla de acceso.
- AC-2 Dada una sesión iniciada, cuando se cierra y se vuelve a abrir Pulso, entonces la sesión sigue; tras *Cerrar sesión* no.
- AC-3 Dado un usuario que olvidó la contraseña, cuando pide el código por correo y escribe uno válido con una contraseña nueva, entonces puede entrar con ella.
- AC-4 Dado un perfil, cuando se edita el nombre visible o la zona horaria, entonces el cambio aparece en la lista del equipo.
- AC-5 La sesión no aparece en `localStorage`, en archivos del proyecto ni en texto plano de SQLite. Toda conexión es `https://`.

Equipos y roles (EQ-01 a EQ-08)
- AC-6 Dado un usuario sin equipo, cuando crea uno, entonces es `owner` y se le pide el consentimiento antes de empezar a subir datos.
- AC-7 Dado un `owner` o `admin`, cuando invita a un correo con un rol, entonces la invitación queda pendiente y vence a los 7 días. Un `admin` solo invita `member` o `viewer`; un `member` o `viewer` no puede invitar.
- AC-8 Dada una invitación pendiente, cuando la persona inicia sesión con ese correo, entonces la ve; al aceptarla con el código y el consentimiento entra al equipo con el rol indicado. Con otro correo, un código incorrecto, la invitación vencida o revocada, aceptar falla con un mensaje claro; tras 5 códigos incorrectos la invitación se anula.
- AC-9 Dada una invitación, cuando se rechaza o se revoca, entonces desaparece de la lista de pendientes y queda en `audit_log`.
- AC-10 Dado un `owner`, cuando nombra a otro `owner` y se degrada, entonces la propiedad cambia y el equipo nunca queda sin `owner`.
- AC-11 Dada una persona en dos equipos, cuando cambia el equipo activo, entonces la interfaz muestra los datos de ese equipo y las filas nuevas se asignan a él.
- AC-12 Dada una persona que sale o es expulsada, cuando se completa la salida, entonces se borran sus `activity_blocks` de ese equipo, sus `time_entries` se conservan y los totales del equipo las muestran como «Exmiembro». Queda una fila en `audit_log` con quién y cuándo.

Consentimiento y privacidad (PS-01, PS-02)
- AC-13 Dado un miembro sin consentimiento, cuando se intenta insertar un bloque, una entrada o un cierre, entonces la base lo rechaza.
- AC-14 La pantalla *Qué se mide y quién lo ve* se genera desde la matriz de `docs/ROLES.md` y la prueba compara su texto con ella. El consentimiento nombra la versión, el proveedor de IA y que los datos pueden procesarse fuera de Colombia (`docs/ARQUITECTURA.md` §9).

Sincronización (SY-02, SY-03, SY-05)
- AC-15 Dado un equipo activo con consentimiento, cuando pasan 60 s, se recupera la conexión o se enfoca la ventana, entonces se suben los registros pendientes en lotes de hasta 200 con `upsert` por `id`, y los ids aceptados se marcan como subidos.
- AC-16 Dada la misma subida repetida, entonces el resultado en Supabase es idéntico (sin duplicados).
- AC-17 Dado un fallo de red o del servidor, entonces se reintenta con espera creciente de 5 s hasta 5 min y no se pierde ningún dato local.
- AC-18 Ningún cuerpo enviado a Supabase contiene títulos de ventana. Prueba automática sobre el lote que arma `sync_pending` y sobre la subida.
- AC-19 El indicador muestra *Pendiente* sin red o con datos por subir, *Al día* con todo subido y *Error* si fallan los reintentos, con el motivo.
- AC-20 Las filas con `team_id` nulo nunca se suben.
- AC-21 Una entrada borrada o editada sin conexión se propaga (`deleted_at`, `updated_at`) al volver la red.

Cierres dentro de la jornada (A-1)
- AC-22 Dada una jornada configurada, cuando Pulso se cierra dentro de ella y se vuelve a abrir, entonces se guarda un cierre con hora de cierre y de apertura, y se sube. Fuera de la jornada no se guarda.
- AC-23 El `owner` y el `admin` ven los cierres del equipo; un `member`, solo los suyos; un `viewer` ninguno; alguien de otro equipo no ve nada.

Permisos (puerta G2: una prueba por celda de `docs/ROLES.md` marcada F2)
- AC-24 Filas 8, 9, 10, 11, 13, 14 y 26 de la matriz, y las reglas de integridad de F2 (vencimiento a 7 días, código de invitación, auditoría), tienen su prueba en `supabase/tests`, con caso permitido y denegado.
- AC-25 Un `viewer` solo ve su fila en la lista de miembros; alguien de otro equipo no ve nada (filas 7 y 13).

## Trabajo por flujo

| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| A · Rust | `src-tauri/**` | `session_*`, `sync_pending`, `sync_mark_synced`, `rules_set`, `active_team_set`; columna `team_id` en las tablas locales (migración local); detección de cierres; pruebas de AC-18, AC-20 y AC-22 |
| B · Datos | `supabase/migrations/**`, `supabase/tests/**` | Migración nueva con tablas, funciones y políticas; pruebas de AC-12, AC-13, AC-23 a AC-25 |
| C · Interfaz | `src/**`, `docs/**`, `.env.example` | Registro, inicio de sesión, recuperar contraseña, perfil, crear equipo, invitar, aceptar con consentimiento, miembros y roles, cambiar de equipo, salir, *Qué se mide*, motor de sincronización e indicador; `supabase-js` y `react-query` |

Orden: contratos (§Contratos) → migración y comandos de Rust → interfaz. La interfaz se construye contra el puente simulado
y un cliente de Supabase falso en pruebas.

## Fuera de alcance
- Pantalla de ajustes del equipo, jornada editable y pantalla de auditoría (F5).
- Proyectos, tareas y `task_id` real (F3).
- Foto de perfil, eliminar cuenta (F7). Inicio con proveedores externos.
- Tiempo real y Edge Functions (F4 en adelante).
- Descartar localmente las filas pendientes de un equipo al que ya no se pertenece: quedan en SQLite sin subirse.

## Cómo se comprueba
Puerta G2 de `docs/PLAN.md` más los pasos manuales con dos cuentas reales de `pulso-dev`:
1. Una cuenta crea el equipo, acepta el consentimiento e invita a la otra.
2. La otra acepta y trabaja unos minutos; su actividad aparece en Supabase sin títulos.
3. Treinta minutos sin red y luego con red: llega todo, sin duplicados.
4. Un `viewer` no ve la lista de miembros; alguien de otro equipo no ve nada.
5. Cerrar Pulso dentro de la jornada y reabrirlo: el `admin` ve el cierre.
