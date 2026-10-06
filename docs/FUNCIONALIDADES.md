# Catálogo completo de funcionalidades

Todas las funcionalidades de Pulso, con el requisito del documento original (RF), la fase
en que se construyen y cómo se comprueba cada una. Nada se construye si no tiene una fila aquí.

- **F0–F6**: antes de la entrega del 19 de octubre (`docs/PLAN.md`).
- **F7–F9**: después de la entrega. Están diseñadas, no olvidadas.
- **✂** = recortable: es lo primero que sale si una fase se atrasa (orden en `docs/PLAN.md` §4).

Resumen: 106 funcionalidades en total: 88 antes de la entrega y 18 después (TA-14 y PS-11 se añadieron el 6 oct, ADR-0009).

## A. Cuenta y acceso (RF-01, RF-03)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| CU-01 | Registro con correo y contraseña; se entra al instante, sin verificar el correo (ADR-0008) | 01 | F2 | Crear una cuenta nueva y entrar |
| CU-02 | Iniciar y cerrar sesión; la sesión se guarda en el almacén seguro del sistema | 01 | F2 | Cerrar y abrir la app: sigue la sesión. Tras cerrar sesión, no |
| CU-03 | Recuperar la contraseña con un código por correo | 01 | F2 | Cambiar la contraseña sin conocer la anterior |
| CU-04 | Perfil: nombre visible, zona horaria, avatar con iniciales | 03 | F2 | Editar el nombre y verlo en la lista del equipo |
| CU-05 | Foto de perfil | 03 | F7 | — |
| CU-06 | Preferencias de notificación | 03 | F5 ✂ | Desactivar un aviso y comprobar que no llega |
| CU-07 | Exportar mis datos a un archivo | — | F5 | El archivo contiene mis bloques y entradas |
| CU-08 | Eliminar mi cuenta | — | F7 | — |

## B. Equipos y roles (RF-02)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| EQ-01 | Crear un equipo; quien lo crea es `owner` | 02 | F0 ✔ / F2 | Prueba de base de datos + pantalla |
| EQ-02 | Invitar por correo con un rol y un código para compartir (ADR-0008); la invitación vence a los 7 días | 02 | F2 | La persona invitada ve la invitación al iniciar sesión |
| EQ-03 | Aceptar (con el código y el consentimiento) o rechazar una invitación | 02 | F2 | Al aceptar, aparece en el equipo |
| EQ-04 | Roles de equipo: `owner`, `admin`, `member`, `viewer` | 02 | F0 ✔ | `npm run test:db` |
| EQ-05 | Cambiar roles y expulsar según la matriz; el equipo siempre conserva un owner | 02 | F0 ✔ / F2 | Prueba de base de datos + pantalla |
| EQ-06 | Ceder la propiedad del equipo | 02 | F2 | Nombrar otro owner y degradarse |
| EQ-07 | Cambiar de equipo activo | 02 | F2 | Con dos equipos, cambiar y ver datos distintos |
| EQ-08 | Salir de un equipo | 02 | F0 ✔ / F2 | Prueba de base de datos + pantalla |
| EQ-09 | Ajustes del equipo: nombre, umbral de inactividad, horas de jornada | 02 | F5 | Cambiar el umbral y ver que el sensor lo aplica |
| EQ-10 | Registro de auditoría para owner y admin | 23 | F2 (datos) / F5 (pantalla) | Un cambio de rol aparece en el registro |

## C. Tiempo y actividad (RF-04, RF-05, RF-06)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| TA-01 | Sensor: app activa, título de ventana e inactividad, cada 2 s (Windows) | 05 | F1 | Usar 3 apps y verlas en *Mi día* |
| TA-02 | Bloques de actividad; los de menos de 10 s se fusionan | 05 | F1 | Prueba unitaria de Rust |
| TA-03 | Clasificación en productivo, neutro, distracción o IA mediante reglas | 05 | F1 | Prueba unitaria del clasificador |
| TA-04 | Inactividad con umbral configurable (3 a 15 min) | 04, 05 | F1 | Dejar el equipo quieto: aparece un bloque sin actividad |
| TA-05 | Temporizador: iniciar y detener, con tarea opcional | 04 | F1 (tarea en F3) | Iniciar, esperar, detener: queda la entrada |
| TA-06 | Registro manual de tiempo; editar y eliminar entradas propias | 04 | F1 | Añadir una entrada de ayer |
| TA-07 | Jornada: empieza con la primera actividad y termina con la última | 06 | F1 | El resumen muestra inicio y fin |
| TA-08 | Descansos manuales | 06 | F1 | *Tomar un descanso* crea un bloque de descanso |
| TA-09 | *Mi día*: franja de pulso, reparto por categoría y lista de bloques | 06 | F0 ✔ (ejemplo) / F1 (real) | Pantalla |
| TA-10 | *Mi semana* y *Mi mes* | 17 | F5 | Pantalla con totales por día |
| TA-11 | Editor de reglas de clasificación del equipo | 05 | F5 | Marcar una app como distracción y verla reclasificada |
| TA-12 | Abrir con el sistema e icono en la bandeja | — | F6 ✂ | Reiniciar: Pulso arranca solo |
| TA-13 | macOS y Linux (X11) | — | F7 | — |
| TA-14 | Tiempo por sitio web: solo el dominio, nunca la página ni la búsqueda (ADR-0009) | 05 | F2 | Abrir perplexity.ai: *Mi día → Por sitio* lo muestra |

## D. Proyectos y tareas (RF-07, RF-08, RF-09)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| PT-01 | Crear y archivar proyectos | 07 | F3 | Pantalla + prueba de permisos |
| PT-02 | Miembros del proyecto con rol `lead` o `contributor` | 07 | F3 | Prueba de permisos |
| PT-03 | Tareas con título, descripción, responsable, estado, fecha límite, etiquetas y estimación | 07 | F3 | Crear una tarea con todos los campos |
| PT-04 | Asignar tareas a miembros | 07 | F3 | La tarea aparece en la lista de la otra persona |
| PT-05 | Lista de tareas con filtros por responsable, estado, etiqueta y fecha | 08 | F3 | Filtrar y contar |
| PT-06 | Tablero kanban con tres columnas | 08 | F3 ✂ | Mover una tarea de columna |
| PT-07 | Avance de la tarea: tiempo registrado frente al estimado | 09 | F3 | Un temporizador sobre la tarea suma a su tiempo |
| PT-08 | Avance del proyecto: tareas hechas y tiempo real frente al estimado | 09 | F3 | Las cifras coinciden con las tareas |
| PT-09 | Tareas visibles sin conexión (solo lectura) | 26 | F3 | Sin red, la lista sigue visible |
| PT-10 | Editar tareas sin conexión | 26, 27 | F8 | — |

## E. Uso de herramientas de IA (RF-10, RF-11)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| IA-01 | Detectar uso de IA en el navegador y en apps, mediante reglas | 10 | F1 | Abrir ChatGPT: bloque de categoría IA |
| IA-02 | Duración y número de sesiones de IA por persona | 10 | F1 (datos) / F5 (pantalla) | Las cifras coinciden con los bloques |
| IA-03 | Detectar IA local (Ollama, LM Studio) por nombre de proceso | 10 | F1 | Regla incluida y probada |
| IA-04 | Etiquetar una sesión de IA por tipo de uso: código, redacción, análisis u otro | 11 | F4 | Etiquetar un bloque y verlo en el reporte |
| IA-05 | Regla del equipo: la IA cuenta o no como tiempo productivo | 11 | F5 | Cambiar la regla cambia los totales |
| IA-06 | Reglas de IA distintas por rol | 11 | F8 | — |
| IA-07 | Extensión de navegador para detectar el dominio exacto | 10 | F8 | Solo si la prueba S-2 queda por debajo del 90 % |

## F. Reportes con IA (RF-12, RF-13, RF-14, RF-15)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| RI-01 | Cifras del reporte calculadas por SQL | 12 | F4 | Prueba: las cifras coinciden con datos sembrados |
| RI-02 | Resumen personal diario y semanal | 12 | F4 | Generar el de hoy |
| RI-03 | Resumen de proyecto y de equipo, según el rol | 12, 18 | F4 | Un member no puede generar el de equipo |
| RI-04 | Recomendaciones de productividad dentro del reporte | 15 | F4 | El reporte trae recomendaciones con sus hechos |
| RI-05 | Modo Gratis con límites diarios | — | F4 | El sexto reporte del día muestra el aviso de límite |
| RI-06 | Modo Clave propia (URL, modelo y clave en formato OpenAI) | — | F4 | *Probar conexión* responde bien con una clave válida |
| RI-07 | Modo Manual (copiar el prompt, pegar la respuesta) | — | F4 | Un texto inválido se rechaza con un mensaje claro |
| RI-08 | Validador anti-alucinación y plantilla de respaldo | 12 | F4 | 20 reportes: cero números inventados |
| RI-09 | Historial de reportes | 12 | F4 | El reporte de ayer sigue disponible |
| RI-10 | Exportar el reporte a Markdown, JSON y PDF | 12 | F4 | Los tres archivos abren bien |
| RI-11 | Crear tareas a partir de un texto (actas, correos) | 14 | F7 | — |
| RI-12 | Asistente del equipo (preguntas sobre el trabajo) | 13 | F8 | — |
| RI-13 | Clave de IA compartida por el equipo | — | F7 | — |
| RI-14 | Usar el plan de ChatGPT del usuario | — | F9 | — |

## G. Tableros y reportes (RF-16, RF-17, RF-18)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| DR-01 | Tablero del equipo: quién está activo, inactivo o en pausa (se actualiza cada 60 s) | 16 | F5 | Con dos equipos de cómputo, ver el cambio de estado |
| DR-02 | Tareas en curso por miembro | 16 | F5 | Coincide con el tablero de tareas |
| DR-03 | Uso de IA del equipo | 16, 18 | F5 | Coincide con los bloques de IA |
| DR-04 | Gráficas de horas, productividad y apps por periodo | 16 | F5 | Pantalla con datos sembrados |
| DR-05 | Reporte individual por día, semana y mes; por proyecto y tarea; apps e IA | 17 | F5 | Las cifras coinciden con *Mi día* |
| DR-06 | Exportar a CSV y PDF | 17 | F5 ✂ (CSV) | Abrir el CSV en una hoja de cálculo |
| DR-07 | Reporte para owner, admin y lead: capacidad usada, comparativa y uso de IA | 18 | F5 | Cada rol ve solo su columna de la matriz |
| DR-08 | Actualización en tiempo real | 16 | F8 | — |

## H. Avisos (RF-19, RF-20)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| NO-01 | Aviso al acercarse el fin de la jornada | 19 | F5 ✂ | Llega el aviso del sistema |
| NO-02 | Aviso por inactividad prolongada | 19 | F5 ✂ | Llega el aviso del sistema |
| NO-03 | Aviso por tarea próxima a vencer | 19 | F5 ✂ | Llega el aviso del sistema |
| NO-04 | Alertas para líderes (baja actividad, proyecto atrasado) | 20 | F8 | — |

## I. Privacidad y seguridad (RF-21, RF-22, RF-23)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| PS-01 | Pantalla *Qué se mide y quién lo ve* | 21 | F2 | Texto revisado contra la matriz de roles |
| PS-02 | Consentimiento explícito y versionado al unirse a un equipo | 21 | F2 | Sin aceptar, no se sube actividad |
| PS-03 | Pausa de privacidad | 21 | F1 | Durante la pausa no se guardan app ni título |
| PS-04 | Títulos de ventana solo en el equipo y cifrados | 22, 23 | F1 | Prueba: ningún envío contiene títulos |
| PS-05 | Opción personal: no compartir nombres de apps, solo categorías | 22 | F5 | El admin deja de ver las apps de esa persona |
| PS-06 | Política mínima del equipo y tope diario de pausa (la política de apps ocultas llega en F2, ADR-0009) | 22 | F2 / F5 | El tope impide pausar de más |
| PS-07 | Permisos por rol aplicados en la base de datos (RLS) | 23 | F0 ✔ → F5 | `npm run test:db` |
| PS-08 | Sesión y clave de IA en el almacén seguro del sistema | 23 | F2, F4 | No aparecen en archivos ni en el almacenamiento del navegador |
| PS-09 | Comunicación cifrada (HTTPS) | 23 | F2 | Revisión de F6 |
| PS-10 | Permisos mínimos de la app y política de contenido (CSP) | 23 | F6 | Revisión de F6 con la app real |
| PS-11 | Sitios no permitidos por el equipo: se marcan como distracción, no se bloquean (ADR-0009) | 22 | F2 | El admin marca un sitio y el miembro lo ve «No permitido» |

## J. Sin conexión y sincronización (RF-26, RF-27)

| ID | Funcionalidad | RF | Fase | Cómo se comprueba |
|---|---|---|---|---|
| SY-01 | Registrar actividad y tiempo sin conexión | 26 | F1 | Sin red, *Mi día* sigue registrando |
| SY-02 | Subida automática con reintentos | 27 | F2 | 30 min sin red y luego con red: todo llega |
| SY-03 | Subidas repetibles sin duplicar datos | 27 | F2 | Prueba: subir dos veces da el mismo resultado |
| SY-04 | Conflictos de tareas: gana la última modificación | 27 | F3 | Prueba |
| SY-05 | Indicador del estado de sincronización | 27 | F2 | Muestra *pendiente* sin red y *al día* con red |

## K. Interfaz y diseño

| ID | Funcionalidad | Fase | Cómo se comprueba |
|---|---|---|---|
| UI-01 | Design tokens en tres capas | F0 ✔ | `npm run check:tokens` |
| UI-02 | Tema claro y oscuro | F0 ✔ | Botón de tema |
| UI-03 | Atomic design con reglas de importación | F0 ✔ | `npm run lint` |
| UI-04 | Diseño adaptable a tres anchos de ventana | F0 ✔ | Cambiar el tamaño de la ventana |
| UI-05 | Galería de componentes | F0 ✔ | `#/dev/galeria` |
| UI-06 | Accesibilidad: foco visible, contraste AA, uso con teclado | F0 ✔ → F6 | Revisión de F6 |
| UI-07 | Estados de carga, vacío y error en cada pantalla | cada fase | Pruebas de cada página |

## L. Entrega

| ID | Funcionalidad | Fase | Cómo se comprueba |
|---|---|---|---|
| EN-01 | Instalador para Windows | F6 | Instalar en un Windows limpio |
| EN-02 | Datos de demostración: un equipo con todos los roles y dos semanas de actividad | F6 | El guion de demo pasa tres veces |
| EN-03 | Actualizaciones automáticas firmadas | F7 | — |
| EN-04 | Firma de código del instalador | F9 | — |

## M. Integraciones (RF-24, RF-25)

| ID | Funcionalidad | RF | Fase |
|---|---|---|---|
| IN-01 | Importar tareas de GitHub, GitLab, Trello y Notion | 24 | F9 |
| IN-02 | Cruzar reuniones de Google Calendar y Outlook con el tiempo registrado | 24 | F9 |
| IN-03 | API para que otros sistemas consulten tiempo, tareas y reportes | 25 | F9 |
| IN-04 | Webhooks de eventos | 25 | F9 |

## Qué requisitos quedan fuera de la entrega y por qué

| RF | Qué falta | Motivo |
|---|---|---|
| RF-13 | Asistente del equipo | Necesita consultas seguras sobre datos de otras personas; no cabe con calidad antes del 19 |
| RF-14 | Tareas desde texto | Es lo primero que entra después de la entrega (F7) |
| RF-20 | Alertas para líderes | Depende de tener semanas de datos reales |
| RF-24, RF-25 | Integraciones y API pública | Cada integración es un proyecto propio |
| RF-11 (parte) | Reglas de IA por rol | En v1 la regla es por equipo |
| RF-26 (parte) | Editar tareas sin conexión | Exige resolver conflictos de edición |
