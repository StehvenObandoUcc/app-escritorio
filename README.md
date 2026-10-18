<div align="center">

<img src="src-tauri/icons/128x128.png" alt="Logo de Pulso" width="96" height="96" />

# Pulso

**Entiende cómo trabaja tu equipo con IA, sin vigilarlo.**

App de escritorio para registrar tiempo y actividad, gestionar tareas y generar reportes con IA a partir de cifras calculadas.

![Estado](https://img.shields.io/badge/estado-entrega%2019%20oct%202026-orange)
![Tauri](https://img.shields.io/badge/Tauri-2.12-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19.3-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.3-06B6D4?logo=tailwindcss&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-2024-000000?logo=rust&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)

</div>

> **Versión 0.1.0 para Windows 10/11, con entrega el lunes 19 de octubre de 2026.** Las fases F0 a F5 están hechas;
> F6 (endurecer y entregar) está en curso y su puerta G6 sigue pendiente (ver [Estado del proyecto](#estado-del-proyecto)).
> Lo que no entra en la entrega está en [Fuera de alcance](#fuera-de-alcance-y-después-de-la-entrega).

## Tabla de contenido

- [Acerca del proyecto](#acerca-del-proyecto)
- [Funcionalidades](#funcionalidades)
- [Fuera de alcance y después de la entrega](#fuera-de-alcance-y-después-de-la-entrega)
- [Privacidad y seguridad](#privacidad-y-seguridad)
- [Roles: qué ve cada uno](#roles-qué-ve-cada-uno)
- [Stack tecnológico](#stack-tecnológico)
- [Arquitectura](#arquitectura)
- [Estado del proyecto](#estado-del-proyecto)
- [Instalación para usuarios](#instalación-para-usuarios)
- [Desarrollo](#desarrollo)
- [Estructura de carpetas](#estructura-de-carpetas)
- [Limitaciones conocidas y pendientes](#limitaciones-conocidas-y-pendientes)
- [Hoja de ruta](#hoja-de-ruta)
- [Documentación](#documentación)
- [Cómo contribuir](#cómo-contribuir)
- [Licencia](#licencia)

## Acerca del proyecto

Pulso es una aplicación de escritorio para **equipos pequeños que trabajan con herramientas de IA** y para sus líderes.
Registra en qué se usa el tiempo, organiza proyectos y tareas, y genera reportes en lenguaje natural cuyas cifras
salen de SQL, no de la IA.

**Qué problema resuelve:** los equipos no saben cuánto tiempo dedican a cada tipo de trabajo ni cómo usan la IA, y
las herramientas de monitoreo habituales invaden la privacidad. Pulso mide lo necesario y limita lo que se ve.

**Principios de diseño** (decisiones cerradas en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md)):

- **Privacidad primero:** los títulos de ventana nunca salen del equipo y se guardan cifrados. Nunca se registran
  teclas, capturas de pantalla ni contenido de documentos o de chats de IA.
- **Las cifras salen de SQL, no de la IA.** La IA redacta la narrativa y solo puede citar cifras ya calculadas.
- **Los reportes son indicativos**, no prueba disciplinaria.
- **Permisos en la base de datos:** las reglas de roles viven en políticas RLS de Postgres y cada una tiene su prueba.

## Funcionalidades

**F1 · Sensor y *Mi día***

- Sensor de actividad en Windows (app activa, título e inactividad cada 2 s) con clasificación por reglas
  (`productive`, `neutral`, `distraction`, `ai`, `break`, `idle`, `paused`) y detección de uso de IA. Funciona sin conexión.
- *Mi día* con datos reales: franja del día, totales por categoría, temporizador, descansos, pausa de privacidad y
  registro manual de tiempo (crear, editar y eliminar).
- *Mi semana* y *Mi mes* con totales por día (sin desglose por app).
- Ajustes locales: umbral de inactividad, apps ocultas e idioma (español e inglés en toda la app).

**F2 · Cuentas, equipos, roles y sincronización**

- Registro e inicio de sesión (sin verificar el correo), recuperación de contraseña con código por correo y perfil.
- Equipos: crear, invitar por correo con un rol y un código para compartir, aceptar con consentimiento versionado,
  cambiar de equipo activo, ceder la propiedad y salir.
- Roles `owner`, `admin`, `member` y `viewer`, con registro de auditoría para owner y admin.
- Sincronización automática con la nube cada 60 s y al recuperar la conexión: sube bloques y entradas **sin títulos de
  ventana**, de forma idempotente, con indicador de estado.
- Tiempo por sitio web (solo el dominio), sitios no permitidos por el equipo (se marcan, no se bloquean) y política de apps ocultas.

**F3 · Proyectos y tareas**

- Proyectos archivables con miembros `lead` o `contributor`; tareas con responsable, apoyos, estado, fecha límite,
  etiquetas, estimación y subtareas de un nivel.
- Lista con filtros y tablero kanban; avance de tarea y de proyecto con el tiempo del temporizador; tareas visibles sin conexión (solo lectura).
- Revisión al estilo de un *pull request*: formulario de entrega configurable, criterios, evidencia (archivos y
  enlaces), aprobar o pedir cambios, e historial. Una tarea solo llega a *Hecha* aprobando su revisión.

**F4 · IA y reportes**

- Reportes personal, de proyecto y de equipo, con historial.
- **Tres modos:** *Gratis* (Edge Function `ai-trial`, límite de 5 reportes al día por usuario), *Proveedor propio*
  (URL, modelo y clave en formato OpenAI; la clave vive en el Administrador de credenciales de Windows) y *Manual* (copiar el prompt y pegar la respuesta).
- Cifras calculadas en SQL y **validador anti-alucinación** que rechaza números, hechos o nombres que no estén en los
  hechos; si falla, se usa una plantilla fija sin IA.
- Etiquetado de las sesiones de IA por tipo de uso (código, redacción, análisis u otro).
- Exportación a Markdown, JSON, CSV (solo hechos) y PDF (vista de impresión). Detalle en [`docs/IA.md`](docs/IA.md).

**F5 · Tableros, privacidad y ajustes**

- *Tablero* según el rol: totales del equipo, horas por día, uso de IA, presencia (quién está activo, inactivo o en
  pausa), personas con capacidad usada y tareas en curso, y apps más usadas; exportable a PDF por impresión.
- Ajustes del equipo (umbral de inactividad, jornada, regla de IA, presencia visible, tope de pausa) y pestaña de **auditoría del equipo**.
- Reglas de clasificación por app (aplican solo a lo nuevo) y regla del equipo sobre si la IA cuenta como tiempo productivo.
- Interruptor personal **«No compartir nombres de mis apps»**: el equipo ve solo categorías.
- Exportar mis datos a un archivo en *Descargas*.

## Fuera de alcance y después de la entrega

Recortado el 12 de octubre ([`docs/PLAN.md`](docs/PLAN.md) §9.2) o planificado para después. **No forma parte de la entrega:**

- Avisos del sistema: fin de jornada, inactividad prolongada y tarea por vencer (NO-01 a NO-03), y preferencias de aviso (CU-06).
- Exportación a CSV del tablero (DR-06): del tablero solo se exporta PDF.
- Abrir con el sistema e icono en la bandeja (TA-12): no está hecho (no hay icono de bandeja ni arranque con el sistema en el código).
- Segundo proyecto de Supabase con datos de demostración (`pulso-demo`): no se creó; la demo usa un equipo y cuentas nuevos creados desde la app.
- Edición de la lista de apps de lectura y reunión sin teclado (TA-15).
- Todo lo de la [hoja de ruta](#hoja-de-ruta) (F7 a F9).

## Privacidad y seguridad

- **Títulos de ventana solo locales y cifrados:** se guardan con AES-256-GCM, con la clave en el almacén seguro del
  sistema. Ningún envío a la red los incluye; del navegador solo sale el **dominio**, nunca la página ni la búsqueda.
- **Consentimiento explícito y versionado** al unirse a un equipo; sin él no se sube actividad, tiempo ni cierres.
- **Pausa de privacidad:** durante la pausa solo se registra un bloque `paused`, sin detalle.
- **Permisos en la base de datos (RLS):** cada tabla tiene RLS, el rol `anon` no accede a nada y las escrituras
  sensibles pasan por funciones `SECURITY DEFINER`. Cada celda de la matriz de [`docs/ROLES.md`](docs/ROLES.md) tiene una prueba en `supabase/tests`.
- **Secretos fuera del código:** la sesión y la clave de IA propia están en el almacén seguro del sistema (la
  interfaz nunca recibe la clave); la clave del modo Gratis es un secreto del servidor. Los nombres de las variables de entorno están en `.env.example`.
- **Tauri con permisos mínimos:** sin plugins `shell`, `fs` ni `http` hacia la interfaz y con política CSP activa.
- Al salir de un equipo se borran los bloques de actividad de la persona en ese equipo; sus entradas de tiempo se conservan como «Exmiembro».
- El checklist de seguridad de [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §10 es parte de F6 y sigue sin marcarse.

## Roles: qué ve cada uno

Resumen de [`docs/ROLES.md`](docs/ROLES.md) y de la spec de F5. Roles de equipo: `owner`, `admin`, `member`, `viewer`; rol de proyecto: `lead`.

| Rol | Qué ve en el tablero y los reportes |
|---|---|
| `owner` | Todo: totales, personas con apps, sitios, categorías, IA y capacidad usada, presencia, auditoría y ajustes del equipo. Es el único que renombra o elimina el equipo y gestiona admins y owners |
| `admin` | Lo mismo que el owner, sin poder renombrar ni eliminar el equipo, nombrar ni quitar admins u owners, ni expulsar a owners ni a admins |
| `member` + `lead` | Totales del equipo sin nombres y, de **sus proyectos**, solo horas de temporizador y horas de IA por persona, tareas en curso y presencia. **No ve apps, sitios ni categorías** de nadie |
| `member` | Sus propios datos completos (con títulos, solo en su equipo), totales del equipo sin nombres y presencia solo si el equipo lo permite |
| `viewer` | Solo totales del equipo sin nombres. En la lista de miembros solo ve su propia fila; no ve presencia, personas ni proyectos |

Reglas comunes: cada persona decide si comparte los nombres de sus apps; los reportes de proyecto y de equipo solo llevan totales del
grupo y exigen al menos 2 miembros; nadie edita el tiempo de otra persona.

## Stack tecnológico

Versiones copiadas de [`docs/STACK.lock.md`](docs/STACK.lock.md) (fuente de verdad).

| Capa | Tecnología | Versión |
|---|---|---|
| Shell de escritorio | Tauri | 2.12.1 |
| Interfaz | React / React DOM | 19.3.0 |
| Lenguaje | TypeScript | 6.0.3 |
| Estilos | Tailwind CSS (con design tokens propios) | 4.3.3 |
| Rutas | React Router (HashRouter) | 8.4.0 |
| Validación de contratos | Zod | 4.6.5 |
| Iconos y tipografías | lucide-react · Bricolage Grotesque · Figtree | 1.49.0 · 5.3.0 · 5.3.0 |
| Empaquetado | Vite | 8.3.2 |
| Datos remotos | `@supabase/supabase-js` · `@tanstack/react-query` | 2.117.2 · 5.104.1 |
| Núcleo nativo | Rust (edición 2024, mínimo 1.90) | estable |
| Crates principales | `windows` · `rusqlite` · `aes-gcm` · `keyring` · `reqwest` | 0.62.2 · 0.40.2 · 0.11.1 · 4.2.0 · 0.13.5 |
| Backend | Supabase (Auth, Postgres con RLS, Edge Functions) | CLI 2.119.0 vía `npx` |
| Pruebas | Vitest · Testing Library · PGlite (Postgres en memoria) | 5.0.3 · 16.3.3 · 0.5.8 |
| Calidad | ESLint · typescript-eslint | 10.11.0 · 8.71.0 |
| Entorno | Node.js | 22 o superior |

## Arquitectura

Un solo repositorio con una interfaz React y un **núcleo Rust deliberadamente delgado**. La interfaz no ejecuta SQL ni
ve secretos: habla con Rust solo a través del **puente** (`src/bridge/contract.ts`), validado con Zod.

```
┌──────────────── Pulso (app de escritorio, Tauri v2) ────────────────┐
│  Núcleo Rust                       Interfaz React + TypeScript      │
│   sensor ─► SQLite local (títulos   pages ─► bridge (contrato+zod)  │
│   cifrados) · crypto · secrets       sync (TS): pendientes sin      │
│   ai_chat (proveedor propio)         títulos ─► supabase-js         │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS con el JWT del usuario
┌───────────────────────────────▼─────────────────────────────────────┐
│  Supabase: Auth · Postgres + RLS · funciones SQL · Edge Function     │
│  ai-trial (modo Gratis, con cuotas)                                  │
└──────────────────────────────────────────────────────────────────────┘
```

- `npm run dev` ejecuta la interfaz en el navegador con el **puente simulado** (`src/bridge/mock.ts`); muestra «Datos de ejemplo».
- `npm run tauri dev` ejecuta la app real, con los comandos de Rust (lista cerrada en [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) §6).
- El backend es Supabase, incluido en `supabase/`; no hay un repositorio de backend separado. Más detalle en [`supabase/README.md`](supabase/README.md).

## Estado del proyecto

Calendario y puertas en [`docs/PLAN.md`](docs/PLAN.md). Estado al domingo 18 de octubre de 2026; **entrega: lunes 19 de octubre de 2026**.

| Fase | Contenido | Estado |
|---|---|---|
| F0 · Fundaciones | Estructura, tokens, atomic design, galería, CI, primera migración | Hecha. Los informes S-2 y S-4 de G0 siguen pendientes |
| F1 · Sensor y *Mi día* | Sensor, SQLite local, *Mi día* | Hecha. **G1 superada** |
| F2 · Cuentas, equipos y sincronización | Auth, equipos, roles, invitaciones, sincronización | Hecha. **G2 superada** |
| F3 · Proyectos y tareas | Proyectos, lista, tablero, revisión con evidencias | Hecha. **G3 superada** |
| F4 · IA y reportes | Tres modos, validador, historial, exportación | Hecha. **G4 superada** (el paso 4.20 de calidad se omitió por decisión del responsable) |
| F5 · Tableros, privacidad y ajustes | Tablero por rol, presencia, auditoría, reglas por app | Hecha. **G5 superada** |
| F6 · Endurecer y entregar | Checklist de seguridad, instalador, guion de demostración | En curso. Instalador `0.1.0` generado; **G6 pendiente** (el guion de demostración debe pasar tres veces seguidas en un Windows limpio) |

## Instalación para usuarios

### [⬇ Descargar Pulso para Windows](https://github.com/StehvenObandoUcc/app-escritorio/releases/latest/download/Pulso_0.1.0_x64-setup.exe)

También en la página de [versiones publicadas](https://github.com/StehvenObandoUcc/app-escritorio/releases).

1. Descarga y ejecuta **`Pulso_0.1.0_x64-setup.exe`** (unos 4 MB). Si compilas tú con `npm run tauri build`, queda en
   `src-tauri/target/release/bundle/nsis/`.
2. Windows mostrará un aviso porque el instalador **no está firmado** (no hay certificado de código). Pulsa **«Más información»** y luego **«Ejecutar de todas formas»**.
3. Abre Pulso, crea una cuenta o inicia sesión y, si te invitan a un equipo, acepta el consentimiento.

**Requisitos:** Windows 10 u 11 con WebView2 (ya viene en las versiones actualizadas). Pulso registra tu actividad también sin conexión y la sincroniza cuando vuelve la red.

## Desarrollo

**Requisitos**

- [Node.js 22 o superior](https://nodejs.org) y Git.
- Para la app de escritorio: [Rust](https://rustup.rs) y las *Microsoft C++ Build Tools* (ver [`docs/COMO-VERIFICAR.md`](docs/COMO-VERIFICAR.md)).
- Para usar Supabase: un archivo `.env` propio. No se versiona.

**Pasos**

```bash
git clone https://github.com/StehvenObandoUcc/app-escritorio.git
cd app-escritorio
npm install
cp .env.example .env   # y completa los valores
npm run verify
npm run dev
```

Variables de `.env.example`: `VITE_BRIDGE`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Solo las que empiezan por
`VITE_` llegan a la app. **Nunca** pongas ahí la clave `service_role` de Supabase ni una clave de IA.

**Comandos** (los de `package.json`)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Interfaz en el navegador con datos de ejemplo, en <http://localhost:1420> (galería en `#/dev/galeria`) |
| `npm run tauri dev` | App de escritorio real (la primera compilación tarda unos minutos) |
| `npm run verify` | Lint + tipos + tokens + i18n + pruebas. **Obligatorio antes de cada entrega** |
| `npm run verify:rust` | Clippy + pruebas de Rust (al tocar `src-tauri`) |
| `npm run test:ui` | Solo pruebas de interfaz |
| `npm run test:db` | Solo pruebas de permisos (Postgres en memoria, sin Docker) |
| `npm run db:push` | Aplica las migraciones al proyecto de Supabase enlazado |
| `npm run db:types` | Regenera `src/lib/database.types.ts` desde el proyecto enlazado |
| `npm run tauri build` | Genera el instalador de Windows |

## Estructura de carpetas

```
.github/          CI (GitHub Actions), CODEOWNERS y plantilla de pull request
docs/             plan, arquitectura, ADR, specs, diseño, roles, IA y validación
prompts/          prompts versionados de los reportes (report.v1.md y report.v2.md)
scripts/          guardianes de calidad (tokens, i18n) y scripts de validación contra la nube
src/              interfaz React: app, bridge, cloud, i18n, lib, pages y ui (tokens → atoms → … → templates)
src-tauri/        núcleo Rust (Tauri v2), capacidades, iconos y configuración del instalador
supabase/         migraciones SQL (fuente de verdad de permisos), pruebas de permisos y Edge Function ai-trial
```

## Limitaciones conocidas y pendientes

Pendientes anotados en [`docs/PLAN.md`](docs/PLAN.md) §9.3 (todos P2, no bloquean la entrega):

- **F6-1:** los campos nativos de fecha y hora muestran el formato de EE. UU. aunque la app esté en español.
- **F6-2:** el perfil lo crea la app al iniciar sesión; las cuentas creadas fuera de ella salen como «Persona sin nombre» hasta su primer acceso.
- **F6-3:** quien recibe una petición de cambios en una tarea no recibe aviso; lo ve al abrirla.
- **F6-4:** al pasar a alguien a `viewer`, su tarea queda sin responsable y no se avisa a quien hace el cambio.
- **F6-5:** una prueba de interfaz (`PausaConTope.test.tsx`) falló una vez bajo carga y pasa aislada.
- **F6-6:** el reporte de «Hoy» en modo Manual suele dar «Los datos cambiaron…»; conviene usar un periodo cerrado.
- **F6-7:** ChatGPT no siempre respeta el formato JSON del modo Manual; Claude sí.

Limitaciones generales:

- Instalador sin firma de código (Windows muestra un aviso).
- Sin actualizaciones automáticas.
- Solo Windows 10/11.
- El plan gratuito de Supabase pausa los proyectos sin uso: conviene abrir el proyecto el día antes de una demostración.
- Con exactamente 2 miembros, quien solo ve totales podría deducir las cifras del otro (riesgo aceptado).
- El tope diario de pausa se aplica en la interfaz, no en Rust.

## Hoja de ruta

Después de la entrega ([`docs/PLAN.md`](docs/PLAN.md) §5):

| Fase | Contenido |
|---|---|
| F7 | Tareas desde texto, clave de IA del equipo, foto de perfil, eliminar cuenta, actualizaciones automáticas, macOS y Linux |
| F8 | Asistente del equipo, alertas para líderes, tiempo real, tareas sin conexión, reglas de IA por rol, extensión de navegador |
| F9 | Integraciones, API pública y webhooks, plan de ChatGPT, firma de código |

## Documentación

| Quiero… | Leo… |
|---|---|
| Saber qué se construye y cuándo | [`docs/PLAN.md`](docs/PLAN.md) |
| Ver todas las funcionalidades y su fase | [`docs/FUNCIONALIDADES.md`](docs/FUNCIONALIDADES.md) |
| Entender la arquitectura y las decisiones cerradas | [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) |
| Saber quién puede hacer qué | [`docs/ROLES.md`](docs/ROLES.md) |
| Entender cómo se usa la IA y las claves | [`docs/IA.md`](docs/IA.md) |
| Hacer interfaz (tokens, atomic design, responsive) | [`docs/DISENO.md`](docs/DISENO.md) |
| Comprobar que algo funciona | [`docs/COMO-VERIFICAR.md`](docs/COMO-VERIFICAR.md) |
| Ver la validación real de F1 a F5 | [`docs/VALIDACION.md`](docs/VALIDACION.md) |
| Saber qué versiones usar | [`docs/STACK.lock.md`](docs/STACK.lock.md) |
| Trabajar con agentes de IA | [`AGENTS.md`](AGENTS.md) |

## Cómo contribuir

1. Lee [`AGENTS.md`](AGENTS.md) y [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md): si algo no está en la arquitectura ni en una spec, **no se implementa**; se pregunta.
2. Trabaja contra la spec de tu tarea en `docs/specs/` (plantilla en `docs/specs/_PLANTILLA.md`).
3. Crea una rama a partir de `main` y mantén los cambios pequeños y limitados a los archivos de tu tarea.
4. No agregues dependencias sin un ADR aprobado en `docs/adr/`; actualiza `docs/STACK.lock.md` en el mismo cambio.
5. Ningún color, tamaño o radio se escribe a mano fuera de `src/ui/tokens/`.
6. Antes de abrir el *pull request* ejecuta `npm run verify` (y `npm run verify:rust` si tocaste Rust). Usa la plantilla de PR del repositorio.
7. Nunca incluyas secretos en código, pruebas, registros ni prompts.

Convención de commits usada en el historial: `tipo(ámbito): descripción` (por ejemplo `feat(mi-dia): …`, `docs: …`).

## Licencia

**Por confirmar.** El repositorio no incluye un archivo `LICENSE`.
