# Pulso — Plan de entrega v1

> Creado el 5 de octubre de 2026, al cerrar F1. Lo citan `docs/FUNCIONALIDADES.md`, las specs y `README.md`.
> Orden de autoridad: `docs/ARQUITECTURA.md` > `docs/specs/*` > este plan. Si una fecha de aquí choca con
> una decisión de la arquitectura, manda la arquitectura.

## 1. Fechas que no se mueven

| Hito | Fecha |
|---|---|
| Hoy (creación del plan) | lunes 5 de octubre |
| **Congelamiento** (nada nuevo entra después) | **jueves 15 de octubre, 23:59** |
| Ensayo de la demo (3 pasadas del guion, EN-02) | viernes 16 y sábado 17 |
| Colchón para fallos de última hora | domingo 18 |
| **Entrega** | **lunes 19 de octubre** |

Plataforma v1: Windows 10/11. macOS y Linux: F7.

## 2. Calendario por fase

Quedan 10 días de trabajo hasta el congelamiento (6 al 15). Cada fase empieza por su spec en
`docs/specs/` (plantilla `_PLANTILLA.md`) y termina cuando pasa su puerta (§4).

| Fase | Días | Contenido (IDs en `docs/FUNCIONALIDADES.md`) |
|---|---|---|
| F0 · Fundaciones | hecha | Tokens, atomic design, galería, identidad y equipos en la base (UI-01..05, EQ-01/04/05/08, PS-07) |
| **F1 · Sensor y *Mi día*** | **5–6 oct** | TA-01..09, IA-01..03, PS-03, PS-04, SY-01 · spec `F1-sensor-y-mi-dia.md` |
| F2 · Cuentas, equipos y sincronización | 7–9 oct | CU-01..04, EQ-02/03/05..08/10, PS-01/02/08/09, SY-02/03/05; regla de salida de equipo (D2) |
| F3 · Proyectos y tareas | 10–11 oct | PT-01..05, PT-07..09, SY-04, TA-05 con tarea · PT-06 ✂ |
| F4 · IA y reportes | 12–13 oct | RI-01..10, IA-04 · `docs/IA.md` |
| F5 · Tableros, reglas y avisos | 14 oct | TA-10/11, IA-02 (pantalla), IA-05, DR-01..07, EQ-09/10 (pantalla), PS-05/06, CU-07 · NO-01..03 ✂, CU-06 ✂, DR-06 ✂ |
| F6 · Seguridad, instalador y demo | 15 oct | PS-10, UI-06, EN-01, EN-02, checklist de seguridad (ARQUITECTURA §10), TA-12 ✂ |

El calendario es apretado a propósito: F5 y F6 tienen un día cada una. Si una fase se atrasa, se
recorta según §5 antes de mover el congelamiento.

## 3. Cómo se trabaja (acuerdos con el responsable del proyecto)

1. **Una rama por bloque de trabajo**, a partir de `main`. F1 vive en `feat/f1-sensor-y-mi-dia`.
2. **Commits por partes** (docs · núcleo Rust · interfaz · base de datos), en español con el formato
   `tipo(ámbito): descripción`. **Sin líneas de co-autor ni de atribución a herramientas.**
3. **Antes de cada entrega:** `npm run verify` y `npm run verify:rust` en verde, con el resumen pegado.
   Si el equipo va justo de memoria y Vitest no arranca sus procesos, se libera RAM y se repite; no se toca la configuración.
4. **En cada iteración se informa:** qué se hizo, qué falla y qué falta. Lo no verificado se dice como tal.
5. **Si algo es ambiguo o falla dos veces, se detiene y se pregunta** (regla R9 de `AGENTS.md`).
6. **Nada contra Supabase en la nube** (`db:push`, `db:link`) lo ejecuta el agente: lo hace el responsable al empezar F2.
7. **Sin dependencias nuevas sin ADR** (regla R1) y sin tocar `src-tauri/capabilities/`.
8. **Prueba en la app real** además de las pruebas automáticas: compilación release, UI Automation para pulsar
   botones y lectura de la base SQLite para confirmar lo guardado. El equipo se puede seguir usando con normalidad;
   no se le pide al responsable dejarlo quieto.

## 4. Puertas de calidad

Una fase está terminada cuando pasa su puerta. Cada punto se comprueba y se anota con evidencia.

### Puerta común (todas las fases)
- C1. `npm run verify` y `npm run verify:rust` en verde.
- C2. Cada criterio de aceptación de la spec tiene una prueba automática con nombre, o evidencia en la app real.
- C3. Si hay interfaz: aparece en la galería y se revisó en 380, 800 y 1280 px, en tema claro y oscuro.
- C4. Ningún secreto en código, pruebas, registros ni prompts.
- C5. La spec pasa de «borrador» a «aprobada» (por el responsable, con fecha).
- C6. Commits por partes en la rama y subidos a `origin`.

### G1 · Sensor y *Mi día*
- G1-1. Puerta común (C1–C6).
- G1-2. AC-1 a AC-20 con estado y evidencia en `docs/spikes/F1-medicion-app-real.md`.
- G1-3. Prueba S-1 documentada (`docs/spikes/S-1-sensor-windows.md`).
- G1-4. Rendimiento según ADR-0006: memoria privada < 120 MB y CPU media < 1 % en una hora de uso real, sin cierres
  inesperados y sin crecer más de un 15 % entre los primeros y los últimos 10 minutos (CSV en `docs/spikes/`).
- G1-5. Instalador de Windows < 20 MB.
- G1-6. Ningún título de ventana legible en la base local (AC-9) y ningún bloque solapado en uso real.
- G1-7. Cerrar Pulso detiene el registro en ese momento, y solo puede haber una instancia abierta.
- G1-8. Sin conexión, la app registra y muestra *Mi día* igual (AC-18).

### G2 · Cuentas, equipos y sincronización
- Registro, inicio y cierre de sesión con la sesión en el almacén seguro (CU-01/02, PS-08).
- Invitación por correo sin envío de correos, con consentimiento (ADR-0004, EQ-02/03, PS-02): sin consentimiento no se sube actividad.
- Sincronización: 30 min sin red y luego con red, todo llega; subir dos veces no duplica (SY-02/03).
- Ningún payload de sincronización contiene títulos: prueba automática (ARQUITECTURA §10).
- Regla de salida de equipo (D2) implementada con su prueba y registro en `audit_log`.
- Cada fila nueva de `docs/ROLES.md` tiene prueba en `supabase/tests`.

### G3 · Proyectos y tareas
- Permisos de proyecto (`lead` / `contributor`) probados contra la matriz (filas 16–19).
- Tareas visibles sin conexión en solo lectura (PT-09); conflicto: gana la última modificación (SY-04).

### G4 · IA y reportes
- 20 reportes de prueba con **cero** números inventados en pantalla (`docs/IA.md` §3).
- El sexto reporte gratis del día muestra el aviso de límite; la clave propia nunca llega a la interfaz.

### G5 · Tableros y reglas
- Cada rol ve solo su columna de la matriz; las cifras coinciden con *Mi día*.

### G6 · Entrega
- Checklist de seguridad de ARQUITECTURA §10 completo; CSP activada y probada con la app real.
- Instalador probado en un Windows limpio; guion de demo pasa tres veces.

## 5. Orden de recorte (si una fase se atrasa)

Primero sale lo marcado ✂ en `docs/FUNCIONALIDADES.md`, en este orden:
1. Avisos del sistema (NO-01, NO-02, NO-03).
2. Preferencias de notificación (CU-06).
3. Tablero kanban (PT-06): queda la lista con filtros.
4. Abrir con el sistema e icono en la bandeja (TA-12).
5. Exportar a CSV (DR-06).

Nunca se recorta: privacidad (PS-*), permisos (PS-07), cifras por SQL (RI-01) ni el validador anti-alucinación (RI-08).

## 6. Pruebas técnicas (spikes)

| Prueba | Pregunta | Estado |
|---|---|---|
| S-1 | ¿Cómo leer ventana activa e inactividad en Windows? | Hecha: crate `windows` |
| S-2 | ¿Detectar uso de IA por título de ventana acierta al menos el 90 %? Si no, entra la extensión de navegador (IA-07, F8) | Pendiente: hacer con datos reales de F1 antes de F4 |

## 7. Decisiones abiertas

| # | Tema | Necesita |
|---|---|---|
| A-1 | **Cierres de Pulso dentro de la jornada.** Pedido del responsable: cerrar Pulso detiene el registro (hecho en F1), pero si ocurre dentro de la jornada laboral debe quedar reportado. | Definir: qué cuenta como jornada (¿`teams.settings` horas de jornada, EQ-09?), qué se guarda (¿un evento local «Pulso cerrado» con hora?), quién lo ve (¿la persona y owner/admin en F5?) y si requiere una fila nueva en ROLES. Spec propia antes de implementarlo. |
| A-2 | Conexiones de WebView2 a servidores de Microsoft observadas en la prueba real | Revisar en F6 junto con la CSP: qué las origina y si se pueden desactivar sin dependencias nuevas. |

## 8. Riesgos

| Riesgo | Mitigación |
|---|---|
| Calendario apretado (10 días, 5 fases) | Recorte de §5; specs cortas; pruebas automáticas primero |
| Equipo de desarrollo con poca RAM libre | Cerrar apps antes de `verify` y de compilar en release (~12 min) |
| WebView2 consume la mayor parte de la memoria | Métrica oficial de ADR-0006; vigilar en G1 y G6 |
| Rust es lento de compilar y nuevo para el equipo | Rust delgado (D-02); lógica pura y probada (`sensor/engine.rs`) |
