# ADR-0019 · Teclado en toda la app y flujo de la tarea por pasos

Fecha: 2026-10-08 · Estado: aceptado (por StehvenObando)

## Contexto
- El teclado solo funcionaba bien en algunos formularios.
- En las tareas, un selector con los cuatro estados no se sentía intuitivo; además, convivía con varios botones sueltos.
- Editar una tarea mostraba el formulario junto a la barra lateral y sus acciones.

## Decisión
- **Capa de teclado global** (`src/app/keyboard.ts`):
  - En cualquier formulario, Enter pasa al siguiente campo vacío y envía en el último; Ctrl+Enter envía desde un área de texto.
  - Alt+1…6 abre cada sección.
  - «?» muestra la ayuda de atajos.
  - Al cambiar de pantalla, el foco va al contenido.
  - Hay un enlace «Saltar al contenido».
- **Flechas en el menú y en las listas** (tareas, tablero, proyectos, mis tareas, revisiones, entradas de tiempo, invitaciones). Las pestañas siguen el patrón ARIA.
- **Flujo por pasos:**
  - La tarea muestra los cuatro estados como pasos y **un botón con el siguiente paso** de quien mira: Tomar, Empezar, Enviar a revisión, Completar, Revisar o Reabrir (`nextSteps`).
  - El tablero y la lista muestran ese mismo botón en cada tarjeta.
  - Ya no hay selector de estado, tampoco en el formulario de la tarea.
- **Editar, crear una subtarea, enviar o completar** ocupan la pantalla entera con un solo formulario.

## Consecuencias
- Reemplaza la AC-45 v3 (selector de 4 estados) por la AC-45 v4.
- La barra lateral de la tarea solo informa: tipo, personas, fechas, tiempo y temporizador.
