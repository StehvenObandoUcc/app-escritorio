# Plan por fases — entrega el lunes 19 de octubre de 2026

Cada fase termina en algo que se puede **ver funcionar** y tiene una puerta de calidad:
una lista corta que se comprueba en minutos, sin Docker. No se empieza una fase hasta
que la anterior pasa su puerta.

## 1. Calendario

| Fase | Fechas | Resultado visible |
|---|---|---|
| **F0** Fundaciones | jue 1 – vie 2 | El proyecto arranca, la interfaz base existe y las pruebas corren |
| **F1** Sensor y *Mi día* | sáb 3 – lun 5 | *Mi día* muestra tu actividad real |
| **F2** Cuentas, equipos, roles y sincronización | mar 6 – jue 8 | Dos personas en un equipo; los datos llegan a la nube |
| **F3** Proyectos y tareas | vie 9 – sáb 10 | Tareas en lista y tablero, con tiempo asociado |
| **F4** IA y reportes | dom 11 – mar 13 | Reporte con IA en los tres modos |
| **F5** Tableros, privacidad y avisos | mié 14 – jue 15 | Cada rol ve su tablero. **Congelamiento: jueves 15, 23:59** |
| **F6** Endurecer y entregar | vie 16 – dom 18 | Instalador probado y guion de demo |
| **Entrega** | lun 19 | |
| F7–F9 | después | Ver §5 |

Son 18 días para 86 funcionalidades: el calendario es apretado y solo funciona si se
respetan las puertas y el orden de recorte de §4.

## 2. Cómo se trabaja cada fase

1. Se escribe la spec de la fase en `docs/specs/` a partir de `_PLANTILLA.md` (ya está la de F1).
2. Tres flujos en paralelo, cada uno en su rama y con sus carpetas:
   - **A · Rust**: `src-tauri/**`
   - **B · Datos e IA**: `supabase/**`, `prompts/**`
   - **C · Interfaz**: `src/**`
3. Primero los contratos (`src/bridge/contract.ts`, migración SQL); luego el código. Así los tres flujos no se pisan.
4. Cada cambio entra por un *pull request* pequeño con `npm run verify` en verde.
   Toda pantalla nueva incluye sus estados de carga, vacío y error (UI-07).
5. Al final de la fase se recorre su puerta de calidad.

La interfaz no espera a Rust: se construye contra el puente simulado (`npm run dev`) y se
conecta al comando real cuando el flujo A lo termina.

## 3. Fases

### F0 · Fundaciones (jue 1 – vie 2)

Funcionalidades: UI-01 a UI-06, EQ-04, PS-07 (primera parte) y la base de EQ-01, EQ-05 y EQ-08.

Ya está hecho en este repositorio:
- Estructura del proyecto, guardianes de calidad y CI.
- Design tokens, atomic design, tres anchos de ventana, tema claro y oscuro, galería.
- *Mi día* con datos de ejemplo y el contrato del puente.
- Núcleo Rust generado con la herramienta oficial de Tauri. Compila y pasa el linter en Linux; en Windows se confirma con tu primer `npm run tauri dev` (tarea 3).
- Pruebas de permisos sin Docker y la primera migración (equipos y roles).

Te falta a ti (no se delega en agentes):

| # | Tarea | Listo cuando |
|---|---|---|
| 1 | Instalar Node 22+, Rust y las C++ Build Tools (`docs/COMO-VERIFICAR.md` §1) | `node -v` y `cargo -V` responden |
| 2 | `npm install` y `npm run verify` | Todo en verde |
| 3 | `npm run tauri dev` | Se abre la ventana de Pulso |
| 4 | Activar la carpeta `.github` (pasos en `README.md`), subir el repositorio a GitHub y proteger `main` | El CI pasa en GitHub (es su primera ejecución: aún no se ha probado) |
| 5 | Crear el proyecto de Supabase `pulso-dev` y copiar URL y clave pública a `.env` | `.env` existe y no está en Git |
| 6 | Aplicar la primera migración (`docs/COMO-VERIFICAR.md` §5) | Las tablas aparecen en Supabase |
| 7 | Crear una clave de DeepSeek **exclusiva de Pulso**, con saldo bajo, y guardarla como secreto de Supabase | La clave no está en ningún archivo |

Pruebas técnicas cortas (un agente cada una; informe en `docs/spikes/`):

| ID | Pregunta | Criterio |
|---|---|---|
| S-1 | ¿Cómo leer en Windows la app activa, el título y el tiempo inactivo? Se evalúan las funciones del sistema (`GetForegroundWindow`, `GetWindowTextW`, `GetLastInputInfo`) frente a una librería | Un binario de prueba imprime los tres datos cada 2 s. CPU < 1 % |
| S-2 | ¿Con qué acierto se detecta la IA por el título de la ventana? | 50 cambios entre ChatGPT, Claude, Gemini, DeepSeek y Copilot en Chrome, Edge y Firefox. Meta: 90 % |
| S-4 | ¿DeepSeek devuelve JSON válido con el modelo elegido? | 20 llamadas: esquema válido, costo y latencia anotados |

**Puerta G0**
- [ ] `npm run verify` en verde en tu equipo y en GitHub.
- [ ] La ventana de Pulso abre con `npm run tauri dev`.
- [ ] `docs/STACK.lock.md` tiene las librerías de Rust elegidas en S-1 con su versión.
- [ ] S-1, S-2 y S-4 tienen informe.

### F1 · Sensor y *Mi día* (sáb 3 – lun 5)

Funcionalidades: TA-01 a TA-09, IA-01 a IA-03, PS-03, PS-04, SY-01. Spec: `docs/specs/F1-sensor-y-mi-dia.md`.

| Flujo | Trabajo |
|---|---|
| A · Rust | Sensor, clasificador con `rules/default.json`, SQLite local, cifrado de títulos, comandos de F1 |
| B · Datos | Adelanta F2: migraciones de `activity_blocks`, `time_entries` y `classification_rules` con sus pruebas |
| C · Interfaz | *Mi día* con datos reales, registro manual de tiempo, ajustes locales |

**Puerta G1**
- [x] `npm run verify` y `npm run verify:rust` en verde.
- [x] Una hora de uso real sin cierres inesperados.
- [x] Abrir VS Code, el navegador con ChatGPT y otra app: *Mi día* muestra los tres bloques con su categoría. (Hecho con Claude en Brave y Firefox: el responsable no usa ChatGPT.)
- [x] Dejar el equipo quieto más que el umbral: aparece un bloque sin actividad.
- [x] Pausar: durante la pausa no se guarda ni app ni título.
- [x] Sin red, todo lo anterior sigue funcionando.
- [x] El Administrador de tareas muestra menos de 120 MB de memoria.

### F2 · Cuentas, equipos, roles y sincronización (mar 6 – jue 8)

Funcionalidades: CU-01 a CU-04, EQ-01 a EQ-08, EQ-10 (datos), PS-01, PS-02, PS-08, PS-09, SY-02, SY-03, SY-05.

| Flujo | Trabajo |
|---|---|
| A · Rust | `session_*`, `sync_pending`, `sync_mark_synced`, `rules_set` |
| B · Datos | Invitaciones, auditoría, RLS de actividad y tiempo. **Una prueba por cada celda de `docs/ROLES.md` marcada F2** |
| C · Interfaz | Registro, inicio de sesión, recuperar contraseña, crear equipo, invitar, aceptar con consentimiento, cambiar de equipo, sincronización |

**Puerta G2**
- [ ] `npm run test:db` cubre todas las filas F0 y F2 de la matriz.
- [ ] Dos cuentas reales: una crea el equipo e invita; la otra acepta.
- [ ] La actividad de la segunda cuenta aparece en Supabase **sin títulos**.
- [ ] 30 minutos sin red y luego con red: llega todo, sin duplicados.
- [ ] Un `viewer` no ve la lista de miembros; alguien de otro equipo no ve nada.

### F3 · Proyectos y tareas (vie 9 – sáb 10)

Funcionalidades: PT-01 a PT-09, SY-04.

| Flujo | Trabajo |
|---|---|
| A · Rust | `tasks_cache_*`; el temporizador acepta una tarea |
| B · Datos | Proyectos, miembros de proyecto, tareas y sus políticas, con pruebas de la matriz |
| C · Interfaz | Proyectos, lista con filtros, tablero, detalle de tarea, avance |

**Puerta G3**
- [ ] Pruebas: un `contributor` no edita la tarea de otra persona; un `lead` sí.
- [ ] Un temporizador sobre una tarea suma a su tiempo y al avance del proyecto.
- [ ] Sin red, la lista de tareas sigue visible.

### F4 · IA y reportes (dom 11 – mar 13)

Funcionalidades: RI-01 a RI-10, IA-04. Detalle en `docs/IA.md`.

| Flujo | Trabajo |
|---|---|
| A · Rust | `ai_config_*` y `ai_chat` |
| B · Datos e IA | `get_report_facts`, `save_report`, `consume_ai_trial`, Edge Function `ai-trial`, `prompts/report.v1.md` |
| C · Interfaz | Validador, *Ajustes → IA*, vista de reporte, modo manual, historial, exportación |

**Puerta G4**
- [ ] 20 reportes de prueba: ningún número inventado llega a la pantalla.
- [ ] El sexto reporte gratis del día muestra el aviso de límite.
- [ ] Una clave propia válida pasa *Probar conexión*; una inválida explica qué pasó.
- [ ] En modo manual, un texto que no cumple el formato se rechaza con un mensaje claro.
- [ ] Un `member` no puede generar el reporte del equipo.

### F5 · Tableros, privacidad y avisos (mié 14 – jue 15)

Funcionalidades: DR-01 a DR-07, TA-10, TA-11, IA-02, IA-05, EQ-09, EQ-10 (pantalla), PS-05, PS-06, CU-06, CU-07, NO-01 a NO-03.

**Puerta G5**
- [ ] Una prueba de punta a punta por rol: cada uno ve exactamente su columna de la matriz.
- [ ] Las cifras del tablero coinciden con *Mi día* de cada miembro.
- [ ] Quien oculta sus apps aparece solo con categorías.
- [ ] **Congelamiento el jueves 15 a las 23:59**: desde aquí solo se corrigen errores.

### F6 · Endurecer y entregar (vie 16 – dom 18)

Funcionalidades: EN-01, EN-02, PS-10, TA-12.

- Checklist de seguridad de `docs/ARQUITECTURA.md` §10, punto por punto.
- Instalador de Windows (`npm run tauri build`) probado en un equipo limpio.
- Segundo proyecto de Supabase (`pulso-demo`) con las mismas migraciones y los datos de demostración.
- Clasificación de errores: **P0** (cierre, fuga de datos, un rol ve lo que no debe) se arregla el mismo día; **P1** (rompe el guion) antes del domingo; **P2** después de la entrega.

**Puerta G6 (criterio de entrega)**: el guion de §6 pasa tres veces seguidas en un Windows limpio.

## 4. Si una fase se atrasa

No se mueve el congelamiento: se recorta. En este orden:

1. Avisos del sistema (NO-01 a NO-03) y preferencias de aviso (CU-06).
2. Exportación a CSV (DR-06). Queda PDF y Markdown.
3. Tablero kanban (PT-06). Queda la lista.
4. Abrir con el sistema e icono en la bandeja (TA-12).
5. Reporte de proyecto. Quedan el personal y el de equipo.

**No se recortan**: roles completos, permisos en la base de datos, sensor, sincronización ni la IA en sus tres modos.

## 5. Después de la entrega

| Fase | Contenido |
|---|---|
| F7 | Tareas desde texto (RI-11), clave de IA del equipo (RI-13), foto de perfil, eliminar cuenta, actualizaciones automáticas, macOS y Linux |
| F8 | Asistente del equipo (RI-12), alertas para líderes, tiempo real, tareas sin conexión, reglas de IA por rol, extensión de navegador |
| F9 | Integraciones, API pública y webhooks, plan de ChatGPT, firma de código |

## 6. Guion de demostración (prueba de aceptación final)

1. Instalar Pulso. Crear una cuenta, crear un equipo e invitar a un admin, un member y un viewer.
2. El member acepta el consentimiento y trabaja cinco minutos: editor de código, ChatGPT en el navegador, una pausa, un temporizador sobre una tarea.
3. Desconectar la red dos minutos y reconectar: los datos aparecen en el tablero del admin.
4. El admin ve horas y uso de IA por miembro, sin títulos. El viewer solo ve totales. El lead solo ve su proyecto.
5. Generar un reporte en modo Gratis: las cifras coinciden. El sexto intento del día muestra el límite.
6. Conectar un proveedor propio, generar otro reporte y exportarlo a Markdown y PDF.

## 7. Riesgos

| Riesgo | Respuesta |
|---|---|
| El sensor en Rust se atasca | S-1 antes de F1. Alcance cerrado en `docs/ARQUITECTURA.md` §6. Un agente escribe, una persona revisa |
| La detección de IA por título falla | S-2 con meta medible. Mientras tanto, las reglas se pueden editar |
| Un error de permisos expone datos | Una prueba por celda de la matriz; ninguna migración entra sin su prueba |
| Fuga de la clave de DeepSeek | Clave exclusiva con saldo bajo, solo en el servidor, interruptor de apagado |
| Supabase limita los correos de verificación en el plan gratuito | Para la demo se crean las cuentas con antelación; las invitaciones no envían correos |
| Supabase pausa los proyectos gratuitos sin uso | Abrir el proyecto el día anterior a la demo |
| Windows advierte que el instalador no está firmado | Es esperado sin certificado de pago; se explica en la demo |
| El equipo de desarrollo tiene poca RAM libre | Cerrar apps antes de `npm run verify` y de compilar en release (~3–12 min). Si Vitest no arranca sus procesos, se libera memoria y se repite; no se toca la configuración |
| WebView2 se conecta a servidores de Microsoft por su cuenta | Revisar en F6 junto con la CSP (decisión abierta A-2) |

## 8. Adaptaciones (5 de octubre, al cerrar F1)

Lo de arriba es el plan original y sigue vigente. Esta sección añade lo acordado durante F1.

### 8.1 Forma de trabajo

1. Se trabaja en la rama `feat/f1-sensor-y-mi-dia` hasta nuevo aviso, con commits por partes
   (docs · núcleo Rust · interfaz · base de datos) en español, formato `tipo(ámbito): descripción`,
   **sin líneas de co-autor ni de atribución a herramientas**, y subidos a `origin`.
2. En cada iteración se informa qué se hizo, qué falla y qué falta; lo no verificado se dice como tal.
3. Si algo es ambiguo o falla dos veces, se detiene y se pregunta (R9).
4. Nada contra Supabase en la nube (`db:link`, `db:push`) lo ejecuta un agente: lo hace el responsable al empezar F2.
5. La verificación incluye la app real compilada en release: UI Automation para pulsar botones y lectura de la base
   SQLite para confirmar lo guardado. El responsable sigue usando el equipo con normalidad; no se le pide dejarlo quieto.

### 8.2 Puerta G1: precisiones

- «Menos de 120 MB»: memoria privada de Pulso más sus procesos de WebView2, medida según **ADR-0006**. En la hora
  de uso, además: CPU media < 1 % y la media de los últimos 10 minutos no supera en más de un 15 % a la de los primeros 10.
- Puntos añadidos tras las pruebas reales:
  - [x] Cerrar Pulso detiene el registro en ese momento (no queda un proceso grabando sin ventana).
  - [x] Solo puede haber una instancia abierta.
  - [x] Ningún bloque empieza antes de que termine el anterior (consulta en `docs/spikes/F1-medicion-app-real.md` §3).
  - [x] AC-1 a AC-20 con estado y evidencia en `docs/spikes/F1-medicion-app-real.md` §5.

### 8.3 Avance (al 5 de octubre, cierre de F1)

| Fase | Estado | Puerta |
|---|---|---|
| F0 · Fundaciones | Hecha | G0 incompleta: faltan los informes S-2 (detección de IA por título) y S-4 (DeepSeek) |
| **F1 · Sensor y *Mi día*** | **Hecha. Spec aprobada el 5 oct** | **G1 pasa** (evidencia en `docs/spikes/F1-medicion-app-real.md`) |
| F2 · Cuentas, equipos y sincronización | En curso (rama `feat/f2-cuentas-equipos-sync`): migración, Rust e interfaz hechos con pruebas; falta aplicar la migración en `pulso-dev`, configurar el correo de Supabase y la prueba con dos cuentas reales | G2 pendiente |
| F3 a F6 | Por empezar | — |

Funcionalidades antes de la entrega (`docs/FUNCIONALIDADES.md`): **86**.

| | Cuántas | % de 86 | Cuáles |
|---|---|---|---|
| Completas | 19 | 22 % | UI-01 a UI-05, EQ-04, TA-01 a TA-04, TA-06 a TA-09, IA-01, IA-03, PS-03, PS-04, SY-01 |
| A medias (parte hecha, el resto en su fase) | 8 | 9 % | TA-05 (tarea en F3), IA-02 (pantalla en F5), EQ-01/05/08 (pantalla en F2), PS-07 (sigue hasta F5), UI-06 (revisión en F6), UI-07 (cada fase) |
| Por hacer | 59 | 69 % | F2 a F6 |

Tiempo: van 5 de los 18 días del calendario (28 %) y está hecho el 22–31 % del alcance. Vamos al ritmo
previsto, sin margen: F2 empieza el martes 6.

### 8.4 Decisiones abiertas

| # | Tema | Necesita |
|---|---|---|
| A-1 | **Cierres de Pulso dentro de la jornada.** Cerrar Pulso detiene el registro (hecho en F1), pero si ocurre dentro de la jornada laboral debe quedar reportado. | Definir qué es la jornada (¿horas de `teams.settings`, EQ-09?), qué se guarda (¿un evento «Pulso cerrado» con hora?), quién lo ve (¿la persona, owner y admin?) y si exige una fila nueva en `docs/ROLES.md`. **Acordado: se define en la spec de F2, junto con los roles.** |
| A-2 | Conexiones de WebView2 a servidores de Microsoft vistas en la prueba real (`52.96.185.210:443`) | Revisar en F6 con la CSP: qué las origina y si se pueden desactivar sin dependencias nuevas. |
| A-3 | La regla de salida de equipo (D2: se borran `activity_blocks`, se conservan `time_entries` como «Exmiembro», queda en `audit_log`) contradice la migración `20261005000001`, que hoy borra también `time_entries` y solo al salir por cuenta propia | Corregir con una migración nueva en F2, con sus pruebas. |

### 8.5 Avance de F2 (6 de octubre)

| Parte | Estado |
|---|---|
| Spec `docs/specs/F2-cuentas-equipos-sync.md` | Borrador con A-1 y A-3 resueltos; pendiente de aprobación formal |
| Migración `20261006000001` (invitaciones, auditoría, consentimiento, cierres, regla A-3) | Hecha; 95 pruebas de permisos en verde. **Falta `db:push` en `pulso-dev`** |
| Rust: sesión cifrada, `active_team_set` (ADR-0007), `sync_pending`, `sync_mark_synced`, `rules_set`, cierres | Hecho; 80 pruebas en verde |
| Interfaz: acceso con código, equipos, invitaciones, consentimiento, perfil, privacidad, sincronización | Hecha contra la nube simulada; falta probarla con Supabase real |
| Registro sin verificar el correo y código de invitación (ADR-0008) | Hecho y aplicado en `pulso-dev` |
| Sitios por dominio, sitios no permitidos y política de apps ocultas (ADR-0009, S-5) | Hecho con pruebas; falta aplicar `20261007000001` y probar en la app real |
| Puerta G2 | Pendiente (jueves 8): dos cuentas reales, 30 min sin red, viewer y persona de otro equipo |

Decisiones abiertas:
- **A-4** · *Olvidé mi contraseña* necesita que Supabase envíe correos: hoy responde 504. Hay que revisar o configurar el SMTP del proyecto. El registro ya no depende del correo (ADR-0008).
- **A-5** · Enviar por correo el código de invitación, además de mostrarlo para compartirlo (pedido el 6 oct). Depende de A-4 y necesita una Edge Function o el SMTP del proyecto; se retoma después de G2.
