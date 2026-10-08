# ADR-0016 · Completar, tomar y borrar trabajo

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
En la prueba de F3 v2 no se pudo completar ninguna tarea, ni con la cuenta de propietario ni con la de empleado:
- A «Hecha» solo se llegaba con una revisión, y solo el responsable o un apoyo podían enviarla. Las tareas sin responsable quedaban bloqueadas.
- El propietario no tenía forma de cerrar una tarea.
- El editor del formulario de entrega permitió convertir «Qué se hizo» en un enlace obligatorio, y desde ese momento nadie pudo enviar texto.
- Tampoco se podía borrar nada, y archivar estaba escondido.

## Decisión
- **Dos caminos para completar.** Quien trabaja la tarea la envía a revisión. Quien gestiona el proyecto (owner, admin o líder) también puede **Completar** directamente con el mismo formulario de entrega: queda una revisión aprobada por él en el historial.
- **Tomar una tarea.** Cualquier miembro del proyecto puede asignarse una tarea sin responsable que esté por hacer o en curso.
- **El campo «Qué se hizo» es fijo:** siempre existe, es texto y es obligatorio. Se corrigen las plantillas ya guardadas.
- **Borrar.**
  - Owner y admin borran un proyecto escribiendo su nombre para confirmar.
  - Quien gestiona el proyecto borra tareas con confirmación.
  - El tiempo registrado se conserva sin tarea y el borrado queda en `audit_log`.
- **La evidencia** toma su tamaño de Storage (no del cliente) y solo admite imágenes, PDF, texto y documentos de Office.

## Consecuencias
- Migración nueva `20261008000003_completar_y_borrar.sql`.
- Reemplaza la D-12 de la spec F3 («sin borrar tareas»).
- No hay papelera: un borrado no se deshace.
