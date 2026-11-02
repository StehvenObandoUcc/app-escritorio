# Catálogo completo de funcionalidades

Todas las funcionalidades de Pulso 0.1.x, con el requisito del documento original (RF) y cómo
se comprueba cada una.

Resumen: 90 funcionalidades.

## A. Cuenta y acceso (RF-01, RF-03)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| CU-01 | Registro con correo y contraseña; se entra al instante, sin verificar el correo (ADR-0008) | 01 | Crear una cuenta nueva y entrar |
| CU-02 | Iniciar y cerrar sesión; la sesión se guarda en el almacén seguro del sistema | 01 | Cerrar y abrir la app: sigue la sesión. Tras cerrar sesión, no |
| CU-03 | Recuperar la contraseña con un código por correo | 01 | Cambiar la contraseña sin conocer la anterior |
| CU-04 | Perfil: nombre visible, zona horaria, avatar con iniciales | 03 | Editar el nombre y verlo en la lista del equipo |
| CU-07 | Exportar mis datos a un archivo | — | El archivo contiene mis bloques y entradas |
| CU-08 | Eliminar mi cuenta; si eres la única propietaria de un equipo con más personas, primero cedes la propiedad (spec de eliminar cuenta) | — | Prueba de base de datos + pantalla: tras eliminarla, la cuenta no vuelve a entrar |

## B. Equipos y roles (RF-02)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| EQ-01 | Crear un equipo; quien lo crea es `owner` | 02 | Prueba de base de datos + pantalla |
| EQ-02 | Invitar por correo con un rol y un código para compartir (ADR-0008); la invitación vence a los 7 días | 02 | La persona invitada ve la invitación al iniciar sesión |
| EQ-03 | Aceptar (con el código y el consentimiento) o rechazar una invitación | 02 | Al aceptar, aparece en el equipo |
| EQ-04 | Roles de equipo: `owner`, `admin`, `member`, `viewer` | 02 | `npm run test:db` |
| EQ-05 | Cambiar roles y expulsar según la matriz; el equipo siempre conserva un owner | 02 | Prueba de base de datos + pantalla |
| EQ-06 | Ceder la propiedad del equipo | 02 | Nombrar otro owner y degradarse |
| EQ-07 | Cambiar de equipo activo | 02 | Con dos equipos, cambiar y ver datos distintos |
| EQ-08 | Salir de un equipo | 02 | Prueba de base de datos + pantalla |
| EQ-09 | Ajustes del equipo: nombre, umbral de inactividad, horas de jornada | 02 | Cambiar el umbral y ver que el sensor lo aplica |
| EQ-10 | Registro de auditoría para owner y admin | 23 | Un cambio de rol aparece en el registro |

## C. Tiempo y actividad (RF-04, RF-05, RF-06)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| TA-01 | Sensor: app activa, título de ventana e inactividad, cada 2 s (Windows) | 05 | Usar 3 apps y verlas en *Mi día* |
| TA-02 | Bloques de actividad; los de menos de 10 s se fusionan | 05 | Prueba unitaria de Rust |
| TA-03 | Clasificación en productivo, neutro, distracción o IA mediante reglas | 05 | Prueba unitaria del clasificador |
| TA-04 | Inactividad con umbral configurable (3 a 15 min) | 04, 05 | Dejar el equipo quieto: aparece un bloque sin actividad |
| TA-05 | Temporizador: iniciar y detener, con tarea opcional (desde el detalle de la tarea) | 04 | Iniciar, esperar, detener: queda la entrada |
| TA-06 | Registro manual de tiempo; editar y eliminar entradas propias | 04 | Añadir una entrada de ayer |
| TA-07 | Jornada: empieza con la primera actividad y termina con la última | 06 | El resumen muestra inicio y fin |
| TA-08 | Descansos manuales | 06 | *Tomar un descanso* crea un bloque de descanso |
| TA-09 | *Mi día*: franja de pulso, reparto por categoría y lista de bloques | 06 | Pantalla |
| TA-10 | *Mi semana* y *Mi mes* | 17 | Pantalla con totales por día |
| TA-11 | Editor de reglas de clasificación del equipo (reglas por app; aplican a lo nuevo, spec F5 D-13) | 05 | Marcar una app como distracción y ver que los bloques nuevos salen así |
| TA-13 | macOS y Linux (X11): sensor básico sin dominio del navegador; instaladores en GitHub Releases (ADR-0024) | — | El job «Núcleo Rust (Linux)» ve la xterm activa bajo Xvfb; «Núcleo Rust (macOS)» lee la inactividad |
| TA-14 | Tiempo por sitio web: solo el dominio, nunca la página ni la búsqueda (ADR-0009) | 05 | Abrir perplexity.ai: *Mi día → Por sitio* lo muestra |
| TA-15 | Apps de lectura y reunión sin teclado no cuentan como inactividad hasta 30 min (ADR-0013), según una lista fija incluida en la app (spec F5 D-13) | 05 | Leer 10 min en Readest sin tocar nada: *Mi día* muestra 10 min de Readest |

## D. Proyectos y tareas (RF-07, RF-08, RF-09)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| PT-01 | Crear y archivar proyectos | 07 | Pantalla + prueba de permisos |
| PT-02 | Miembros del proyecto con rol `lead` o `contributor` | 07 | Prueba de permisos |
| PT-03 | Tareas con título, descripción, responsable, estado, fecha límite, etiquetas y estimación | 07 | Crear una tarea con todos los campos |
| PT-04 | Asignar tareas a miembros | 07 | La tarea aparece en la lista de la otra persona |
| PT-05 | Lista de tareas con filtros por responsable, estado, etiqueta y fecha | 08 | Filtrar y contar |
| PT-06 | Tablero kanban con tres columnas | 08 | Mover una tarea de columna |
| PT-07 | Avance de la tarea: tiempo registrado frente al estimado | 09 | Un temporizador sobre la tarea suma a su tiempo |
| PT-08 | Avance del proyecto: tareas hechas y tiempo real frente al estimado | 09 | Las cifras coinciden con las tareas |
| PT-09 | Tareas visibles sin conexión (solo lectura) | 26 | Sin red, la lista sigue visible |
| PT-11 | Tipos de tarea y subtareas de un nivel (ADR-0014) | 07 | Crear una subtarea: aparece bajo su madre y suma a su avance |
| PT-12 | Responsable y apoyos, con permiso opcional para que el responsable gestione apoyos (ADR-0014) | 07 | Prueba de permisos |
| PT-13 | Revisión al estilo de un PR: formulario de entrega configurable, criterios, evidencia, aprobar o pedir cambios, e historial (ADR-0014) | 07, 09 | Enviar, pedir cambios y aprobar: queda en el historial |

## E. Uso de herramientas de IA (RF-10, RF-11)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| IA-01 | Detectar uso de IA en el navegador y en apps, mediante reglas | 10 | Abrir ChatGPT: bloque de categoría IA |
| IA-02 | Duración y número de sesiones de IA por persona | 10 | Las cifras coinciden con los bloques |
| IA-03 | Detectar IA local (Ollama, LM Studio) por nombre de proceso | 10 | Regla incluida y probada |
| IA-04 | Etiquetar una sesión de IA por tipo de uso: código, redacción, análisis u otro | 11 | Etiquetar un bloque y verlo en el reporte |
| IA-05 | Regla del equipo: la IA cuenta o no como tiempo productivo | 11 | Cambiar la regla cambia los totales |

## F. Reportes con IA (RF-12, RF-15)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| RI-01 | Cifras del reporte calculadas por SQL | 12 | Prueba: las cifras coinciden con datos sembrados |
| RI-02 | Resumen personal diario y semanal | 12 | Generar el de hoy |
| RI-03 | Resumen de proyecto y de equipo, según el rol | 12, 18 | Un member no puede generar el de equipo |
| RI-04 | Recomendaciones de productividad dentro del reporte | 15 | El reporte trae recomendaciones con sus hechos |
| RI-05 | Modo Gratis con límites diarios | — | El sexto reporte del día muestra el aviso de límite |
| RI-06 | Modo Clave propia (URL, modelo y clave en formato OpenAI) | — | *Probar conexión* responde bien con una clave válida |
| RI-07 | Modo Manual (copiar el prompt, pegar la respuesta) | — | Un texto inválido se rechaza con un mensaje claro |
| RI-08 | Validador anti-alucinación y plantilla de respaldo | 12 | 20 reportes: cero números inventados |
| RI-09 | Historial de reportes | 12 | El reporte de ayer sigue disponible |
| RI-10 | Exportar el reporte a Markdown, JSON, CSV y PDF | 12 | Los cuatro archivos abren bien |

## G. Tableros y reportes (RF-16, RF-17, RF-18)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| DR-01 | Tablero del equipo: quién está activo, inactivo o en pausa (se actualiza cada 60 s) | 16 | Con dos equipos de cómputo, ver el cambio de estado |
| DR-02 | Tareas abiertas por miembro | 16 | Coincide con el tablero de tareas |
| DR-03 | Uso de IA del equipo | 16, 18 | Coincide con los bloques de IA |
| DR-04 | Gráficas de horas, productividad y apps por periodo | 16 | Pantalla con datos sembrados |
| DR-05 | Reporte individual por día, semana y mes; por proyecto y tarea; apps e IA | 17 | Las cifras coinciden con *Mi día* |
| DR-06 | Exportar el tablero a PDF | 17 | Imprimir el tablero a PDF desde la app |
| DR-07 | Reporte para owner, admin y lead: capacidad usada, comparativa y uso de IA | 18 | Cada rol ve solo su columna de la matriz |

## H. Privacidad y seguridad (RF-21, RF-22, RF-23)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| PS-01 | Pantalla *Qué se mide y quién lo ve* | 21 | Texto revisado contra la matriz de roles |
| PS-02 | Consentimiento explícito y versionado al unirse a un equipo | 21 | Sin aceptar, no se sube actividad |
| PS-03 | Pausa de privacidad | 21 | Durante la pausa no se guardan app ni título |
| PS-04 | Títulos de ventana solo en el equipo y cifrados | 22, 23 | Prueba: ningún envío contiene títulos |
| PS-05 | Opción personal: no compartir nombres de apps, solo categorías | 22 | El admin deja de ver las apps de esa persona |
| PS-06 | Política mínima del equipo, apps ocultas (ADR-0009) y tope diario de pausa | 22 | El tope impide pausar de más |
| PS-07 | Permisos por rol aplicados en la base de datos (RLS) | 23 | `npm run test:db` |
| PS-08 | Sesión y clave de IA en el almacén seguro del sistema | 23 | No aparecen en archivos ni en el almacenamiento del navegador |
| PS-09 | Comunicación cifrada (HTTPS) | 23 | Revisión de seguridad |
| PS-10 | Permisos mínimos de la app y política de contenido (CSP) | 23 | Revisión de seguridad con la app real |
| PS-11 | Sitios no permitidos por el equipo: se marcan como distracción y avisan con sonido (frecuencia elegida por owner/admin); no se bloquean (ADR-0009, ADR-0010) | 22 | El admin marca un sitio; el miembro oye el aviso y lo ve «No permitido» |

## I. Sin conexión y sincronización (RF-26, RF-27)

| ID | Funcionalidad | RF | Cómo se comprueba |
|---|---|---|---|
| SY-01 | Registrar actividad y tiempo sin conexión | 26 | Sin red, *Mi día* sigue registrando |
| SY-02 | Subida automática con reintentos | 27 | 30 min sin red y luego con red: todo llega |
| SY-03 | Subidas repetibles sin duplicar datos | 27 | Prueba: subir dos veces da el mismo resultado |
| SY-04 | Conflictos de tareas: gana la última modificación | 27 | Prueba |
| SY-05 | Indicador del estado de sincronización | 27 | Sin red avisa de que se subirá al volver; con red muestra *Al día* |

## J. Interfaz y diseño

| ID | Funcionalidad | Cómo se comprueba |
|---|---|---|
| UI-01 | Design tokens en tres capas | `npm run check:tokens` |
| UI-02 | Tema claro y oscuro | Botón de tema |
| UI-03 | Atomic design con reglas de importación | `npm run lint` |
| UI-04 | Diseño adaptable a tres anchos de ventana | Cambiar el tamaño de la ventana |
| UI-05 | Galería de componentes | `#/dev/galeria` |
| UI-06 | Accesibilidad: foco visible, contraste AA, uso con teclado | Revisión de accesibilidad |
| UI-07 | Estados de carga, vacío y error en cada pantalla | Pruebas de cada página |
| UI-08 | Español e inglés en toda la app y en las notificaciones (ADR-0015) | *Ajustes → Idioma*: todo cambia al instante; `npm run check:i18n` |

## K. Distribución

| ID | Funcionalidad | Cómo se comprueba |
|---|---|---|
| EN-01 | Instalador para Windows | Instalar en un Windows limpio |
| EN-02 | Datos de demostración: un equipo con todos los roles y dos semanas de actividad | El guion de demo pasa tres veces |
