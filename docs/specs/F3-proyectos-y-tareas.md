# Spec F3 · Proyectos y tareas

Funcionalidades: PT-01 a PT-09, SY-04, TA-05 (tarea del temporizador)
Estado: borrador v2 (7 oct). La v1 se probó el 7 oct; la v2 (ADR-0014, ADR-0015) responde a esa prueba.

## Objetivo
Al terminar, un equipo organiza su trabajo en proyectos con tareas, en lista y en tablero. Cada persona inicia el
temporizador sobre una tarea y ese tiempo suma al avance de la tarea y del proyecto. Sin conexión, las tareas se
siguen viendo (solo lectura).

## Decisiones de esta spec

| # | Decisión |
|---|---|
| D-1 | **Quién ve un proyecto.** `owner` y `admin` ven todos los proyectos del equipo. Un `member` ve solo aquellos de los que es miembro (`lead` o `contributor`). Un `viewer` no ve proyectos ni tareas (ROLES: «no pertenece a proyectos»). |
| D-2 | **Qué hace un `contributor` (fila 19).** Crea tareas en sus proyectos, asignadas a sí mismo o sin responsable, y cambia el estado de las tareas asignadas a él. Nada más: no edita otros campos ni toca tareas de otra persona. |
| D-3 | **Qué hacen `owner`, `admin` y `lead` (filas 16 a 18).** `owner` y `admin` crean y archivan proyectos. Los tres gestionan los miembros del proyecto y crean, editan y asignan cualquier tarea de él. Quien crea un proyecto queda como `lead`. |
| D-4 | **Escrituras solo por funciones SQL** (`SECURITY DEFINER`, ARQUITECTURA §7.1 regla 3): `create_project`, `set_project_archived`, `set_project_member`, `remove_project_member`, `create_task`, `update_task`, `set_task_status`. Las lecturas, por `my_projects` y `project_tasks`, que ya traen el avance. Las tablas tienen RLS de lectura como segunda barrera. |
| D-5 | **Responsable.** Solo puede ser responsable un miembro del proyecto. Un `viewer` no puede ser miembro de un proyecto. |
| D-6 | **Tiempo por tarea (PT-07, PT-08).** `time_entries.task_id` pasa a tener llave foránea hacia `tasks`; si la tarea no es del mismo equipo, la base rechaza la entrada. El avance suma el tiempo de todas las personas (sin desglose por persona) y lo ven quienes ven el proyecto. El desglose por persona (fila 13, «P») lo ven `owner`, `admin` y el `lead` del proyecto con `project_time_summary`. |
| D-7 | **Proyecto archivado.** Sigue visible en *Archivados*, con sus tareas en solo lectura: no admite tareas nuevas ni cambios. Se puede desarchivar. |
| D-8 | **Salida del equipo o paso a `viewer`.** La persona sale de los proyectos del equipo y sus tareas quedan sin responsable. Su tiempo se conserva (A-3). |
| D-9 | **Sin conexión (PT-09).** Cada vez que la lista llega de Supabase, la interfaz la guarda con `tasks_cache_put`, por equipo y cuenta (ADR-0013). Sin red, se muestra `tasks_cache_get` con el aviso «Sin conexión: solo lectura» y los botones de edición desactivados. |
| D-10 | **Conflictos (SY-04).** Gana la última modificación: `updated_at` lo pone el servidor en cada cambio y la interfaz vuelve a pedir la tarea tras guardar. |
| D-11 | **Tablero (PT-06).** Tres columnas (`todo`, `doing`, `done`). Una tarea se mueve con su selector de estado, que también funciona con teclado. Sin arrastrar y soltar, para no añadir dependencias. |
| D-12 | **Sin borrar tareas.** No está en `docs/FUNCIONALIDADES.md`: una tarea que sobra se marca hecha o se archiva el proyecto. |
| D-13 | **Fila 14 «P» (uso de IA por miembro en sus proyectos) pasa a F5.** Los bloques de actividad no llevan proyecto: no hay forma honesta de atribuir uso de IA a un proyecto. |

## Contratos

### Puente (`src/bridge/contract.ts`, `mock.ts`, `tauri.ts`, `docs/ARQUITECTURA.md` §6)
Comandos de §6 ya previstos: `tasks_cache_put(json)` y `tasks_cache_get()` (`string | null`). Rust guarda el texto tal
cual en `tasks_cache` (migración local 5), con el equipo y la cuenta activos; sin equipo o cuenta no guarda nada y
devuelve `null`. Máximo 2 MB. La interfaz valida con zod lo que lee.

### Datos (migración nueva `supabase/migrations/20261008000001_proyectos_y_tareas.sql`)
- `projects(id, team_id, name, archived_at, created_by, created_at)`.
- `project_members(project_id, user_id, role, created_at)`; `role` en `lead`, `contributor`.
- `tasks(id, project_id, team_id, title, description, assignee_id, status, due_date, labels, estimate_minutes, created_by, created_at, updated_at)`.
  - `status` en `todo`, `doing`, `done`. `title` de 1 a 200 caracteres; `description` hasta 5000.
  - `labels`: hasta 10, cada una de 1 a 30 caracteres. `estimate_minutes` de 1 a 100 000 o nulo.
- `time_entries.task_id` con llave foránea hacia `tasks` (`on delete set null`) y validación de equipo.
- Lecturas:
  - `my_projects(team)`: proyectos visibles con mi rol, tareas hechas y totales, segundos registrados y estimados.
  - `project_tasks(project)`: tareas con su tiempo registrado.
  - `project_time_summary(project, from, to)`: segundos por persona (fila 13, «P»).

### Nube (`src/cloud/contract.ts`)
`myProjects`, `projectTasks`, `projectMembers`, `createProject`, `setProjectArchived`, `setProjectMember`,
`removeProjectMember`, `createTask`, `updateTask`, `setTaskStatus`, `projectTimeSummary`.

## Criterios de aceptación

Proyectos (PT-01, PT-02)
- AC-1 Dado un `owner` o `admin`, cuando crea un proyecto, entonces aparece en la lista y él queda como `lead`. Un `member` o `viewer` no puede crearlo.
- AC-2 Dado un proyecto, cuando `owner` o `admin` lo archiva, entonces pasa a *Archivados* y no admite tareas nuevas ni cambios hasta desarchivarlo.
- AC-3 Dado un `lead`, `owner` o `admin`, cuando añade a un miembro del equipo como `lead` o `contributor`, o lo quita, entonces el cambio se ve en el proyecto. Un `contributor` no puede; a un `viewer` no se le puede añadir.
- AC-4 Un `member` solo ve los proyectos de los que es miembro; un `viewer` y alguien de otro equipo no ven nada.

Tareas (PT-03, PT-04)
- AC-5 Dado un `lead`, cuando crea una tarea con título, descripción, responsable, estado, fecha límite, etiquetas y estimación, entonces se guarda con todos los campos.
- AC-6 Dada una tarea asignada a otra persona, entonces aparece en la lista de esa persona con el filtro «Mis tareas».
- AC-7 Un `contributor` crea tareas para sí o sin responsable y cambia el estado de las suyas; no edita ni cambia el estado de la tarea de otra persona. Un `lead` sí.
- AC-8 Solo un miembro del proyecto puede ser responsable.

Lista y tablero (PT-05, PT-06)
- AC-9 La lista filtra por responsable, estado, etiqueta y fecha límite, y muestra cuántas tareas cumplen el filtro.
- AC-10 El tablero muestra tres columnas; al cambiar el estado de una tarea, pasa a la columna correspondiente.

Avance (PT-07, PT-08, TA-05)
- AC-11 Dado un temporizador iniciado sobre una tarea, cuando se detiene y se sube, entonces el tiempo de la tarea aumenta y se compara con su estimación.
- AC-12 El avance del proyecto muestra tareas hechas sobre el total y tiempo real frente al estimado, y las cifras coinciden con la suma de sus tareas.
- AC-13 Una entrada de tiempo con una tarea de otro equipo se rechaza.
- AC-14 `owner`, `admin` y el `lead` del proyecto ven el tiempo por persona del proyecto; un `contributor` no.

Sin conexión y conflictos (PT-09, SY-04)
- AC-15 Sin red, la lista de tareas sigue visible con el aviso de solo lectura y sin botones de edición.
- AC-16 Dos cambios seguidos sobre la misma tarea: queda el último y su `updated_at` es el del servidor.
- AC-17 La copia local de una cuenta no se muestra con otra cuenta del mismo PC.

Salida (D-8)
- AC-18 Cuando alguien sale del equipo o pasa a `viewer`, deja de ser miembro de sus proyectos y sus tareas quedan sin responsable.

## Trabajo por flujo

| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| A · Rust | `src-tauri/**` | `tasks_cache_put` y `tasks_cache_get`; migración local 5; pruebas de AC-17 |
| B · Datos | `supabase/migrations/**`, `supabase/tests/**`, `src/lib/database.types.ts` | Migración con tablas, funciones y políticas; pruebas de AC-1 a AC-8, AC-11 a AC-14, AC-16 y AC-18 |
| C · Interfaz | `src/**`, `docs/**` | Página *Tareas*: proyectos, miembros, lista con filtros, tablero, detalle, avance, temporizador sobre la tarea y modo sin conexión |

## Versión 2 (tras la prueba del 7 oct, ADR-0014 y ADR-0015)

Reemplaza D-2, D-5, D-9, D-11 y D-12 donde contradigan:
- D-2 v2: el colaborador crea tareas y subtareas para sí o sin responsable, trabaja en las suyas y en las que apoya, y las envía a revisión.
- D-5 v2: se puede asignar a cualquier persona del equipo que no sea viewer. Si no está en el proyecto, quien gestiona la añade como `contributor`.
- D-11 v2: el tablero tiene 4 columnas (Por hacer, En curso, En revisión, Hecha).
- D-12 v2: sigue sin borrado. A *Hecha* solo se llega aprobando una revisión.
- D-14: proyectos en `/proyectos` y `/proyectos/:id` (la selección vive en la URL); `/tareas` es *Mis tareas*.

Criterios nuevos:
- AC-19 Una tarea tiene tipo; una subtarea no puede tener subtareas ni cambiar de proyecto.
- AC-20 El avance de una tarea madre suma el tiempo y las subtareas hechas.
- AC-21 Asignar a alguien del equipo que no está en el proyecto lo añade como colaborador; a un viewer, no.
- AC-22 El líder gestiona los apoyos; el responsable solo si la tarea lo permite.
- AC-23 Nadie pone *Hecha* a mano.
- AC-24 Enviar a revisión exige el formulario del proyecto (obligatorios) y todos los criterios cumplidos; solo el responsable o un apoyo pueden enviarla.
- AC-25 Aprueban el revisor pedido, el líder o owner/admin; quien envía no se aprueba a sí mismo, salvo líder u owner/admin. *Pedir cambios* devuelve a En curso con comentario.
- AC-26 Aprobar fija `completed_at`; empezar fija `started_at`.
- AC-27 Cada cambio queda en el historial con quién y cuándo.
- AC-28 La evidencia en archivos solo la ven quienes ven el proyecto.
- AC-29 Una sola lectura (`team_work`) trae todo el trabajo visible y sirve de copia sin conexión.
- AC-30 La estimación se escribe con unidad y se muestra en días y horas.
- AC-31 Tras subir un temporizador, el tiempo de la tarea se actualiza solo.
- AC-32 Volver a un proyecto lo muestra a él, no otro.
- AC-33 Archivar pide confirmación; no se inicia el temporizador en una tarea hecha.
- AC-34 Toda la app se usa en español o en inglés y el cambio es inmediato.
- AC-35 Todo mensaje de error del servidor y de Rust tiene traducción.

## Fuera de alcance
- Editar tareas sin conexión (PT-10, F8).
- Borrar tareas (D-12), comentarios, adjuntos y subtareas.
- Arrastrar y soltar en el tablero (D-11).
- Uso de IA por proyecto (D-13, F5).

## Estado de cada criterio (7 oct)

| Criterio | Evidencia |
|---|---|
| AC-1 a AC-8, AC-11 a AC-14, AC-16, AC-18 | `supabase/tests/proyectos_y_tareas.test.ts` (adaptado a v2) |
| AC-9, AC-10, AC-15 | `src/lib/tasks.test.ts` y `src/pages/proyectos/Proyectos.test.tsx` |
| AC-17 | Prueba de Rust `the_tasks_copy_belongs_to_the_account_and_team` |
| AC-19 a AC-29 | `supabase/tests/trabajo_v2.test.ts` y `src/pages/proyectos/Proyectos.test.tsx` |
| AC-30 a AC-33 | `src/lib/tasks.test.ts` y `src/pages/proyectos/Proyectos.test.tsx` |
| AC-34, AC-35 | `src/app/locale.test.tsx`, `src/i18n/server-messages.test.ts` y `npm run check:i18n` |
| Prueba real con dos cuentas | **Pendiente**: requiere aplicar `20261008000002` en `pulso-dev` |

## Cómo se comprueba
Puerta G3 de `docs/PLAN.md` más estos pasos con dos cuentas reales:
1. La cuenta `owner` crea un proyecto, añade a la otra como `contributor` y le asigna una tarea.
2. La otra cuenta ve la tarea en «Mis tareas», no puede editar una tarea ajena y mueve la suya a *En curso*.
3. Inicia el temporizador sobre su tarea, lo detiene a los 2 min: el tiempo de la tarea y el del proyecto suben.
4. Sin red, la lista sigue visible y no deja editar.

Versión 2:
1. El owner asigna una tarea a alguien del equipo sin añadirlo antes al proyecto: queda como colaborador.
2. Estima «2 días», crea 2 subtareas y añade un apoyo.
3. La otra cuenta trabaja con el temporizador y envía a revisión con un enlace y un archivo.
4. El owner pide cambios: la tarea vuelve a *En curso*. Se reenvía y se aprueba: queda *Hecha* con su historial.
5. *Ajustes → Idioma → English*: toda la app y el aviso de Windows salen en inglés.
