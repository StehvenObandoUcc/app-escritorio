# ADR-0014 · Modelo de trabajo v2: tipos, subtareas, apoyos, revisión con evidencia e historial

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
La primera prueba de F3 mostró que el modelo era demasiado simple para un equipo de empresa:
- Una tarea pasaba a *Hecha* sin trabajo registrado y sin prueba. En los datos reales, 2 tareas hechas con 0 s.
- No se podía dividir una tarea ni repartirla entre varias personas.
- El responsable solo podía ser alguien añadido antes al proyecto; en la práctica, solo el owner.
- La estimación solo admitía minutos (se guardaron 4000 y 3333).
- No quedaba historial: F4 no podría medir tiempos de ciclo, devoluciones ni quién hizo qué.

## Decisión
- **Tipos de tarea**, lista fija: `task`, `bug`, `improvement`, `research`, `meeting`.
- **Subtareas de un nivel** (`parent_id`). El avance de la tarea madre suma el de sus subtareas.
- **Responsable y apoyos.** Un responsable principal y personas de apoyo (`task_collaborators`) que también trabajan y registran tiempo.
  - Con `assignee_can_manage`, el responsable puede gestionar sus apoyos.
  - Asignar a alguien del equipo que aún no está en el proyecto lo añade como `contributor`. El viewer nunca entra.
- **Criterios de aceptación** por tarea (`task_criteria`).
- **Revisión al estilo de un PR:** Por hacer → En curso → En revisión → Hecha.
  - Para enviar a revisión se llena el **formulario de entrega del proyecto** (configurable: texto, enlace o casilla, obligatorio u opcional) y se marcan todos los criterios. Se adjuntan enlaces y archivos (bucket privado `task-evidence`, máximo 10 MB).
  - Se puede pedir un revisor del proyecto.
  - Deciden el revisor pedido, el líder o owner/admin. Quien envía no se aprueba a sí mismo, salvo que sea líder u owner/admin.
  - *Pedir cambios* devuelve la tarea a En curso con un comentario.
  - **Nadie pone `done` a mano:** solo se llega aprobando.
- **Historial** (`task_events`), solo se añaden filas: creación, estado, responsable, apoyos, estimación, revisiones. Más `started_at` y `completed_at` en la tarea.
- **Estimación con unidad** en la interfaz (min, h, días de 8 h, semanas de 5 días). Se guarda en minutos.
- **Una sola lectura** `team_work(team)` con todo el trabajo visible del equipo, que también es la copia sin conexión.

## Consecuencias
- Migración nueva `20261008000002_trabajo_v2.sql`; la de F3 ya está aplicada y no se toca.
- `set_task_status` deja de aceptar `done`.
- Rutas nuevas `/proyectos` y `/proyectos/:id`; `/tareas` pasa a ser *Mis tareas*.
- Fuera de alcance: tipos configurables, más niveles de subtareas, comentarios fuera de la revisión, avisos por correo.
