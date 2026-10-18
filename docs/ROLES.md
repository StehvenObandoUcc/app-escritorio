# Roles y permisos

Esta matriz es la fuente de las pruebas de `supabase/tests`. Una celda que cambia aquí
obliga a cambiar la migración y su prueba en el mismo cambio.

## Roles

- **Rol de equipo** (`team_members.role`): `owner` (uno o más) · `admin` · `member` · `viewer`.
  - `viewer` es un observador de solo lectura agregada (un docente, un cliente). No pertenece a proyectos.
- **Rol de proyecto** (`project_members.role`): `lead` · `contributor`.

## Matriz

✔ permitido · **P** solo en proyectos donde es `lead` · **S** solo sobre sí mismo · — denegado

| # | Acción | owner | admin | member + lead | member | viewer | Fase |
|---|---|---|---|---|---|---|---|
| 1 | Renombrar o eliminar el equipo | ✔ | — | — | — | — | F0 ✔ |
| 2 | Nombrar o quitar admins y owners | ✔ | — | — | — | — | F0 ✔ |
| 3 | Cambiar a alguien entre member y viewer | ✔ | ✔ | — | — | — | F0 ✔ |
| 4 | Expulsar a un member o viewer | ✔ | ✔ | — | — | — | F0 ✔ |
| 5 | Expulsar a un admin u owner | ✔ | — | — | — | — | F0 ✔ |
| 6 | Salir del equipo | S | S | S | S | S | F0 ✔ |
| 7 | Ver la lista de miembros | ✔ | ✔ | ✔ | ✔ | solo su fila | F0 ✔ |
| 8 | Invitar personas (admin invita member/viewer; owner, cualquier rol) | ✔ | ✔ | — | — | — | F2 |
| 9 | Ver el registro de auditoría | ✔ | ✔ | — | — | — | F2 |
| 10 | Registrar y editar tiempo propio | S | S | S | S | — | F2 |
| 11 | Editar el tiempo de otra persona | — | — | — | — | — | F2 |
| 12 | Ver la propia actividad con títulos (solo local) | S | S | S | S | — | F1 |
| 13 | Ver actividad agregada por miembro (categorías, apps, sitios por dominio, horas) | ✔ | ✔ | P (solo tiempo de sus proyectos) | — | — | F2 · «P» en F3 (`project_time_summary`) |
| 14 | Ver uso de IA por miembro | ✔ | ✔ | P | — | — | F2 · «P» en F5 (los bloques no llevan proyecto; spec F3, D-13) |
| 15 | Ver totales del equipo sin nombres | ✔ | ✔ | ✔ | ✔ | ✔ | F5 |
| 16 | Crear o archivar proyectos | ✔ | ✔ | — | — | — | F3 ✔ |
| 17 | Gestionar miembros de un proyecto | ✔ | ✔ | P | — | — | F3 ✔ |
| 18 | Crear, editar y asignar cualquier tarea del proyecto | ✔ | ✔ | P | — | — | F3 ✔ |
| 19 | Crear tareas y cambiar el estado de las propias | ✔ | ✔ | ✔ | ✔ (en sus proyectos) | — | F3 ✔ |
| 20 | Generar un reporte personal | S | S | S | S | — | F4 |
| 21 | Generar un reporte de proyecto | ✔ | ✔ | P | — | — | F4 |
| 22 | Generar un reporte de equipo | ✔ | ✔ | — | — | — | F4 |
| 23 | Editar reglas de clasificación y políticas de privacidad | ✔ | ✔ | — | — | — | F2 (sitios, avisos y apps ocultas, ADR-0009/0010) / F5 (resto) |
| 24 | Ver quién está activo ahora | ✔ | ✔ | P | si el equipo lo permite | — | F5 |
| 25 | Exportar los datos propios | S | S | S | S | S | F5 |
| 26 | Ver los cierres de Pulso dentro de la jornada (A-1) | ✔ | ✔ | S | S | — | F2 |
| 27 | Enviar una tarea a revisión (responsable o apoyo) | S | S | S | S | — | F3 |
| 28 | Aprobar o pedir cambios en una revisión (revisor pedido, o quien gestiona el proyecto; nadie se aprueba a sí mismo salvo líder u owner/admin) | ✔ | ✔ | P | S (si es el revisor pedido) | — | F3 |
| 29 | Gestionar los apoyos de una tarea | ✔ | ✔ | P | S (responsable con permiso) | — | F3 |
| 30 | Configurar el formulario de entrega del proyecto | ✔ | ✔ | P | — | — | F3 |
| 31 | Tomar una tarea sin responsable | ✔ | ✔ | ✔ | ✔ (en sus proyectos) | — | F3 |
| 32 | Completar una tarea directamente, con el formulario de entrega | ✔ | ✔ | P | — | — | F3 |
| 33 | Borrar un proyecto (escribiendo su nombre) | ✔ | ✔ | — | — | — | F3 |
| 34 | Borrar una tarea | ✔ | ✔ | P | — | — | F3 |
| 35 | Ver un reporte de equipo ya generado | ✔ | ✔ | ✔ | ✔ | ✔ | F4 |
| 36 | Ver un reporte de proyecto ya generado | ✔ | ✔ | ✔ (en sus proyectos) | ✔ (en sus proyectos) | — | F4 |
| 37 | Ver un reporte personal | S | S | S | S | — | F4 |

## Reglas de integridad

- El equipo siempre conserva al menos un `owner`: el último no puede salir ni degradarse. (F0 ✔)
- Un `admin` no puede modificar ni expulsar a un `owner` ni a otro `admin`. (F0 ✔)
- Nadie escribe la tabla `team_members` directamente: solo mediante `create_team`, `set_member_role`, `remove_member`, `leave_team` y, desde F2, `accept_invitation`. (F0 ✔, F2 ✔)
- Las invitaciones vencen a los 7 días y solo las puede aceptar quien inició sesión con ese correo **y** escribe el código de la invitación; tras 5 códigos incorrectos se anula (ADR-0008). (F2 ✔)
- Cambios de rol, expulsiones y reportes de proyecto o de equipo quedan en `audit_log`. (F2 ✔ roles, expulsiones, salidas, invitaciones y consentimiento; reportes en F4. La configuración de IA es local en v1: no hay nada que auditar en el servidor.)
- Reportes (filas 20 a 22 y 35 a 37, F4): los de proyecto y de equipo solo llevan totales del grupo, sin cifras de ninguna persona, y exigen al menos 2 miembros; un reporte personal solo lo ve quien lo generó. La comparación entre miembros es de F5 (DR-07).
- Salida de un equipo (la persona se va o es expulsada: misma regla): se borran sus `activity_blocks` de ese equipo; sus `time_entries` se conservan y se muestran como «Exmiembro»; el hecho queda en `audit_log`. También se borran sus cierres de Pulso (`app_closures`). (F2 ✔) Desde F4 se borran también sus reportes personales de ese equipo; los de proyecto y equipo que generó se conservan.

- Sin consentimiento (`team_members.consent_at`) no se sube actividad, tiempo ni cierres. (F2 ✔)
- Proyectos y tareas se escriben solo con `create_project`, `set_project_archived`, `set_project_member`, `remove_project_member`, `create_task`, `update_task` y `set_task_status`. Un `member` solo ve los proyectos de los que es miembro; el `viewer`, ninguno. Solo un miembro del proyecto puede ser responsable de una tarea; un proyecto archivado no admite cambios. (F3 ✔)
- Al salir del equipo o pasar a `viewer`, la persona deja sus proyectos y sus tareas quedan sin responsable; su tiempo se conserva. (F3 ✔)
- Una entrada de tiempo solo puede apuntar a una tarea de su mismo equipo. (F3 ✔)

## Cómo se prueba cada celda

`supabase/tests/identidad_y_equipos.test.ts` es el modelo: un equipo con un usuario por rol,
más un usuario de otro equipo. Por cada fila se comprueba el caso permitido y el denegado.

```ts
// Permitido
await db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'viewer']));
// Denegado
expect(await failure(() => db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, ana, 'member']))))
  .toMatch(/No permitido/);
```
