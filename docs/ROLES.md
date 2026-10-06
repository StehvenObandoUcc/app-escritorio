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
| 13 | Ver actividad agregada por miembro (categorías, apps, horas) | ✔ | ✔ | P (solo tiempo de sus proyectos) | — | — | F2 |
| 14 | Ver uso de IA por miembro | ✔ | ✔ | P | — | — | F2 |
| 15 | Ver totales del equipo sin nombres | ✔ | ✔ | ✔ | ✔ | ✔ | F5 |
| 16 | Crear o archivar proyectos | ✔ | ✔ | — | — | — | F3 |
| 17 | Gestionar miembros de un proyecto | ✔ | ✔ | P | — | — | F3 |
| 18 | Crear, editar y asignar cualquier tarea del proyecto | ✔ | ✔ | P | — | — | F3 |
| 19 | Crear tareas y cambiar el estado de las propias | ✔ | ✔ | ✔ | ✔ (en sus proyectos) | — | F3 |
| 20 | Generar un reporte personal | S | S | S | S | — | F4 |
| 21 | Generar un reporte de proyecto | ✔ | ✔ | P | — | — | F4 |
| 22 | Generar un reporte de equipo | ✔ | ✔ | — | — | ver los ya generados | F4 |
| 23 | Editar reglas de clasificación y políticas de privacidad | ✔ | ✔ | — | — | — | F5 |
| 24 | Ver quién está activo ahora | ✔ | ✔ | P | si el equipo lo permite | — | F5 |
| 25 | Exportar los datos propios | S | S | S | S | S | F5 |

## Reglas de integridad

- El equipo siempre conserva al menos un `owner`: el último no puede salir ni degradarse. (F0 ✔)
- Un `admin` no puede modificar ni expulsar a un `owner` ni a otro `admin`. (F0 ✔)
- Nadie escribe la tabla `team_members` directamente: solo mediante `create_team`, `set_member_role`, `remove_member`, `leave_team` y, desde F2, `accept_invitation`. (F0 ✔)
- Las invitaciones vencen a los 7 días y solo las puede aceptar quien inició sesión con ese correo verificado. (F2)
- Cambios de rol, expulsiones, configuración de IA y reportes sobre otras personas quedan en `audit_log`. (F2)
- Salida de un equipo (la persona se va o es expulsada: misma regla): se borran sus `activity_blocks` de ese equipo; sus `time_entries` se conservan y se muestran como «Exmiembro»; el hecho queda en `audit_log`. (F2)

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
