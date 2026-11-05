<div align="center">

<img src="src-tauri/icons/source.svg" alt="Logo de Pulso" width="96" height="96" />

# Pulso

**Entiende cómo trabaja tu equipo con IA, sin vigilarlo.**

App de escritorio para registrar tiempo y actividad, gestionar tareas y generar reportes con IA a partir de cifras calculadas.

![Versión](https://img.shields.io/badge/versión-0.1.3-blue)
![Plataformas](https://img.shields.io/badge/Windows%20·%20macOS%20·%20Linux-informational)
![Tauri](https://img.shields.io/badge/Tauri-2.12-24C8DB?logo=tauri&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)
![Rust](https://img.shields.io/badge/Rust-2024-000000?logo=rust&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3FCF8E?logo=supabase&logoColor=white)

</div>

## Acerca del proyecto

Pulso es una aplicación de escritorio para **equipos pequeños que trabajan con herramientas de IA** y para sus líderes.
Registra en qué se usa el tiempo, organiza proyectos y tareas, y genera reportes en lenguaje natural cuyas cifras salen
de SQL, no de la IA.

- **Privacidad primero:** los títulos de ventana nunca salen del equipo y se guardan cifrados. Nunca se registran
  teclas, capturas de pantalla ni contenido de documentos o de chats.
- **Las cifras salen de SQL:** la IA solo redacta y solo puede citar cifras ya calculadas.
- **Permisos en la base de datos:** cada regla de rol vive en una política RLS de Postgres con su prueba.

## Funcionalidades

- **Mi día, semana y mes:** sensor de actividad (app activa, título e inactividad cada 2 s), clasificación por
  categorías y detección de uso de IA, temporizador por tarea, descansos, pausa de privacidad con tope del equipo y
  registro manual de tiempo. Funciona sin conexión.
- **Cuentas y equipos:** registro, invitaciones con código, roles `owner`, `admin`, `member` y `viewer`, consentimiento
  versionado, auditoría y eliminar mi cuenta.
- **Sincronización:** cada 60 s y al volver la red; sube bloques y entradas **sin títulos de ventana**.
- **Proyectos y tareas:** responsables, apoyos, subtareas, lista y tablero kanban, y revisión con evidencias al estilo
  de un *pull request*.
- **Reportes con IA:** personal, de proyecto y de equipo, en tres modos (*Gratis*, *Clave propia* y *Manual*), con un
  validador que rechaza cifras o hechos inventados. Exporta a Markdown, JSON, CSV y PDF.
- **Panel del equipo** según el rol, presencia, reglas por app, sitios no permitidos y exportar mis datos.
- Interfaz en español e inglés.

Detalle por funcionalidad en [`docs/FUNCIONALIDADES.md`](docs/FUNCIONALIDADES.md).

## Así se ve

Recorrido por la aplicación de escritorio, con sensor real y un equipo de demostración. Cada imagen se abre a tamaño completo y todas están en [`docs/capturas/`](docs/capturas/).

<details open>
<summary><b>Cuenta, invitaciones y consentimiento</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/01-acceso.png"><img src="docs/capturas/01-acceso.png" alt="Acceso" /></a><br /><sub>Acceso</sub></td><td width="50%"><a href="docs/capturas/02-registro.png"><img src="docs/capturas/02-registro.png" alt="Crear cuenta" /></a><br /><sub>Crear cuenta</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/55-recuperar-contrasena.png"><img src="docs/capturas/55-recuperar-contrasena.png" alt="Recuperar la contraseña" /></a><br /><sub>Recuperar la contraseña</sub></td><td width="50%"><a href="docs/capturas/03-bienvenida.png"><img src="docs/capturas/03-bienvenida.png" alt="Bienvenida: crear un equipo o unirse" /></a><br /><sub>Bienvenida: crear un equipo o unirse</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/24-invitacion-recibida.png"><img src="docs/capturas/24-invitacion-recibida.png" alt="Invitación recibida" /></a><br /><sub>Invitación recibida</sub></td><td width="50%"><a href="docs/capturas/35-invitacion-aceptar.png"><img src="docs/capturas/35-invitacion-aceptar.png" alt="Aceptar con el código y el consentimiento" /></a><br /><sub>Aceptar con el código y el consentimiento</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/04-consentimiento.png"><img src="docs/capturas/04-consentimiento.png" alt="Qué se mide y quién lo ve" /></a><br /><sub>Qué se mide y quién lo ve</sub></td><td width="50%"><a href="docs/capturas/22-privacidad.png"><img src="docs/capturas/22-privacidad.png" alt="Pantalla de privacidad" /></a><br /><sub>Pantalla de privacidad</sub></td></tr>
</table>

</details>

<details open>
<summary><b>Mi día: actividad, temporizador, descansos y pausa</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/12-mi-dia-semana.png"><img src="docs/capturas/12-mi-dia-semana.png" alt="Mi semana: horas por día" /></a><br /><sub>Mi semana: horas por día</sub></td><td width="50%"><a href="docs/capturas/11-mi-dia-temporizador.png"><img src="docs/capturas/11-mi-dia-temporizador.png" alt="Mi día con el temporizador en marcha" /></a><br /><sub>Mi día con el temporizador en marcha</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/42-pausa-privacidad.png"><img src="docs/capturas/42-pausa-privacidad.png" alt="Pausa de privacidad" /></a><br /><sub>Pausa de privacidad</sub></td><td width="50%"><a href="docs/capturas/40-registro-manual.png"><img src="docs/capturas/40-registro-manual.png" alt="Registro manual de tiempo" /></a><br /><sub>Registro manual de tiempo</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/14-mi-dia-por-app.png"><img src="docs/capturas/14-mi-dia-por-app.png" alt="Actividad por app, detectada por el sensor" /></a><br /><sub>Actividad por app, detectada por el sensor</sub></td><td width="50%"><a href="docs/capturas/43-mi-dia-por-sitio.png"><img src="docs/capturas/43-mi-dia-por-sitio.png" alt="Por sitio (solo el dominio)" /></a><br /><sub>Por sitio (solo el dominio)</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/15-mi-dia-linea.png"><img src="docs/capturas/15-mi-dia-linea.png" alt="Línea de tiempo" /></a><br /><sub>Línea de tiempo</sub></td><td width="50%"><a href="docs/capturas/13-mi-dia-mes.png"><img src="docs/capturas/13-mi-dia-mes.png" alt="Vista del mes" /></a><br /><sub>Vista del mes</sub></td></tr>
</table>

</details>

<details open>
<summary><b>Proyectos, tareas y revisión con evidencias</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/08-proyecto-tablero.png"><img src="docs/capturas/08-proyecto-tablero.png" alt="Tablero kanban" /></a><br /><sub>Tablero kanban</sub></td><td width="50%"><a href="docs/capturas/09-proyecto-lista.png"><img src="docs/capturas/09-proyecto-lista.png" alt="Lista con filtros" /></a><br /><sub>Lista con filtros</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/29-proyecto-miembros.png"><img src="docs/capturas/29-proyecto-miembros.png" alt="Miembros del proyecto: líder y colaboradores" /></a><br /><sub>Miembros del proyecto: líder y colaboradores</sub></td><td width="50%"><a href="docs/capturas/30-proyecto-ajustes.png"><img src="docs/capturas/30-proyecto-ajustes.png" alt="Ajustes del proyecto" /></a><br /><sub>Ajustes del proyecto</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/31-nueva-tarea-evidencia.png"><img src="docs/capturas/31-nueva-tarea-evidencia.png" alt="Nueva tarea con criterios y evidencia requerida" /></a><br /><sub>Nueva tarea con criterios y evidencia requerida</sub></td><td width="50%"><a href="docs/capturas/10-tarea.png"><img src="docs/capturas/10-tarea.png" alt="Detalle de la tarea y subtareas" /></a><br /><sub>Detalle de la tarea y subtareas</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/32-mis-tareas-bea.png"><img src="docs/capturas/32-mis-tareas-bea.png" alt="Mis tareas (vista de una persona del equipo)" /></a><br /><sub>Mis tareas (vista de una persona del equipo)</sub></td><td width="50%"><a href="docs/capturas/16-mis-tareas.png"><img src="docs/capturas/16-mis-tareas.png" alt="Mis tareas" /></a><br /><sub>Mis tareas</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/33b-entrega-completa.png"><img src="docs/capturas/33b-entrega-completa.png" alt="Entrega con evidencias" /></a><br /><sub>Entrega con evidencias</sub></td><td width="50%"><a href="docs/capturas/36-revisiones.png"><img src="docs/capturas/36-revisiones.png" alt="Revisiones pendientes y aviso al revisor" /></a><br /><sub>Revisiones pendientes y aviso al revisor</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/37-revision-detalle.png"><img src="docs/capturas/37-revision-detalle.png" alt="Revisión: aprobar o pedir cambios" /></a><br /><sub>Revisión: aprobar o pedir cambios</sub></td><td width="50%"><a href="docs/capturas/38-revision-aprobada.png"><img src="docs/capturas/38-revision-aprobada.png" alt="Tarea aprobada" /></a><br /><sub>Tarea aprobada</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/39-historial-tarea.png"><img src="docs/capturas/39-historial-tarea.png" alt="Historial de la tarea" /></a><br /><sub>Historial de la tarea</sub></td><td width="50%"><a href="docs/capturas/34-invitacion-responder.png"><img src="docs/capturas/34-invitacion-responder.png" alt="Responder una invitación" /></a><br /><sub>Responder una invitación</sub></td></tr>
</table>

</details>

<details>
<summary><b>Equipo, roles y reglas</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/25-equipo-miembros-roles.png"><img src="docs/capturas/25-equipo-miembros-roles.png" alt="Miembros y cambio de roles" /></a><br /><sub>Miembros y cambio de roles</sub></td><td width="50%"><a href="docs/capturas/23-equipo-invitacion.png"><img src="docs/capturas/23-equipo-invitacion.png" alt="Invitar con código" /></a><br /><sub>Invitar con código</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/26-equipo-auditoria.png"><img src="docs/capturas/26-equipo-auditoria.png" alt="Registro de auditoría" /></a><br /><sub>Registro de auditoría</sub></td><td width="50%"><a href="docs/capturas/27-equipo-general.png"><img src="docs/capturas/27-equipo-general.png" alt="Ajustes del equipo, jornada y tope de pausa" /></a><br /><sub>Ajustes del equipo, jornada y tope de pausa</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/28-equipo-reglas.png"><img src="docs/capturas/28-equipo-reglas.png" alt="Reglas por app y sitios no permitidos" /></a><br /><sub>Reglas por app y sitios no permitidos</sub></td><td width="50%"><a href="docs/capturas/54-panel-equipo.png"><img src="docs/capturas/54-panel-equipo.png" alt="Panel del equipo" /></a><br /><sub>Panel del equipo</sub></td></tr>
</table>

</details>

<details>
<summary><b>Reportes con IA</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/18-reportes.png"><img src="docs/capturas/18-reportes.png" alt="Generar un reporte (modo Gratis)" /></a><br /><sub>Generar un reporte (modo Gratis)</sub></td><td width="50%"><a href="docs/capturas/45-reportes-clave-propia.png"><img src="docs/capturas/45-reportes-clave-propia.png" alt="Modo Mi proveedor de IA (clave propia)" /></a><br /><sub>Modo Mi proveedor de IA (clave propia)</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/46-reportes-manual.png"><img src="docs/capturas/46-reportes-manual.png" alt="Modo Manual: copiar el prompt y pegar la respuesta" /></a><br /><sub>Modo Manual: copiar el prompt y pegar la respuesta</sub></td><td width="50%"><a href="docs/capturas/47-reportes-equipo.png"><img src="docs/capturas/47-reportes-equipo.png" alt="Reporte de todo el equipo" /></a><br /><sub>Reporte de todo el equipo</sub></td></tr>
</table>

</details>

<details>
<summary><b>Ajustes, privacidad y datos</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/19-ajustes.png"><img src="docs/capturas/19-ajustes.png" alt="Ajustes" /></a><br /><sub>Ajustes</sub></td><td width="50%"><a href="docs/capturas/49-eliminar-cuenta.png"><img src="docs/capturas/49-eliminar-cuenta.png" alt="Eliminar mi cuenta" /></a><br /><sub>Eliminar mi cuenta</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/48-ajustes-completo.png"><img src="docs/capturas/48-ajustes-completo.png" alt="Ajustes completos: cuenta, aplicación, privacidad, IA y equipo" /></a><br /><sub>Ajustes completos: cuenta, aplicación, privacidad, IA y equipo</sub></td><td width="50%"><a href="docs/capturas/21-atajos.png"><img src="docs/capturas/21-atajos.png" alt="Atajos de teclado" /></a><br /><sub>Atajos de teclado</sub></td></tr>
</table>

</details>

<details>
<summary><b>Interfaz: tema, idioma y tamaños de ventana</b></summary>

<table>
  <tr><td width="50%"><a href="docs/capturas/20-mi-dia-oscuro.png"><img src="docs/capturas/20-mi-dia-oscuro.png" alt="Tema oscuro" /></a><br /><sub>Tema oscuro</sub></td><td width="50%"><a href="docs/capturas/50-ingles.png"><img src="docs/capturas/50-ingles.png" alt="Interfaz en inglés" /></a><br /><sub>Interfaz en inglés</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/51-ancho-medio.png"><img src="docs/capturas/51-ancho-medio.png" alt="Ancho medio" /></a><br /><sub>Ancho medio</sub></td><td width="50%"><a href="docs/capturas/52-ancho-estrecho.png"><img src="docs/capturas/52-ancho-estrecho.png" alt="Ancho estrecho" /></a><br /><sub>Ancho estrecho</sub></td></tr>
  <tr><td width="50%"><a href="docs/capturas/53-galeria-componentes.png"><img src="docs/capturas/53-galeria-componentes.png" alt="Galería de componentes (modo desarrollo)" /></a><br /><sub>Galería de componentes (modo desarrollo)</sub></td><td width="50%"><a href="docs/capturas/33-entrega-formulario.png"><img src="docs/capturas/33-entrega-formulario.png" alt="Formulario de entrega" /></a><br /><sub>Formulario de entrega a revisión</sub></td></tr>
</table>

</details>

## Instalación

### [⬇ Descargar Pulso](https://github.com/StehvenObandoUcc/app-escritorio/releases/latest)

Elige el archivo de tu sistema. Los instaladores no están firmados con certificado de código.

| Sistema | Archivo | Primera vez |
|---|---|---|
| Windows 10/11 | `Pulso_<versión>_x64-setup.exe` o `.msi` | SmartScreen: «Más información» → «Ejecutar de todas formas» |
| macOS (Apple Silicon e Intel) | `Pulso_<versión>_universal.dmg` | Clic derecho sobre Pulso → «Abrir» (o `xattr -cr /Applications/Pulso.app`). Para ver títulos de ventana, da el permiso «Grabación de pantalla» |
| Linux | `.deb`, `.rpm` o `.AppImage` | Requiere una sesión **X11** y un almacén de claves (gnome-keyring o KWallet) |

En macOS y Linux no se registra el dominio del navegador, y en Wayland no se registra actividad
([ADR-0024](docs/adr/0024-macos-y-linux.md)).

## Arquitectura

Un solo repositorio con una interfaz React y un **núcleo Rust delgado**. La interfaz no ejecuta SQL ni ve secretos:
habla con Rust solo a través del **puente** (`src/bridge/contract.ts`), validado con Zod.

```
┌──────────────── Pulso (app de escritorio, Tauri v2) ────────────────┐
│  Núcleo Rust                       Interfaz React + TypeScript      │
│   sensor ─► SQLite local (títulos   pages ─► bridge (contrato+zod)  │
│   cifrados) · crypto · secrets       sync: pendientes sin títulos   │
│   ai_chat (clave propia)             ─► supabase-js                 │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS con el JWT del usuario
┌───────────────────────────────▼─────────────────────────────────────┐
│  Supabase: Auth · Postgres + RLS · funciones SQL · Edge Functions    │
│  ai-trial (modo Gratis) y delete-account                             │
└──────────────────────────────────────────────────────────────────────┘
```

| Capa | Tecnología |
|---|---|
| Escritorio | Tauri 2 · Rust (edición 2024) · SQLite · AES-256-GCM · almacén seguro del sistema |
| Interfaz | React 19 · TypeScript · Tailwind CSS 4 · React Router · TanStack Query · Zod |
| Backend | Supabase (Auth, Postgres con RLS, Edge Functions) |
| Pruebas | Vitest · Testing Library · PGlite (Postgres en memoria) · pruebas de Rust |

## Desarrollo

Requisitos: Node.js 22+, Git y, para la app de escritorio, [Rust](https://rustup.rs) con las dependencias de Tauri
de tu sistema (en Windows, las *Microsoft C++ Build Tools*).

```bash
git clone https://github.com/StehvenObandoUcc/app-escritorio.git
cd app-escritorio
npm install
cp .env.example .env   # VITE_BRIDGE, VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev            # interfaz en el navegador con datos de ejemplo (http://localhost:1420)
npm run tauri dev      # app de escritorio real
```

| Comando | Qué hace |
|---|---|
| `npm run verify` | Lint, tipos, tokens de diseño, textos i18n y todas las pruebas |
| `npm run verify:rust` | Clippy y pruebas del núcleo Rust |
| `npm run test:db` | Solo las pruebas de permisos (Postgres en memoria, sin Docker) |
| `npm run db:push` | Aplica las migraciones al proyecto de Supabase enlazado |
| `npm run tauri build` | Genera el instalador del sistema donde se ejecuta |

Las versiones publicadas las genera `.github/workflows/release.yml` al subir una etiqueta `v*`, para Windows, macOS y
Linux. Nunca pongas en `.env` la clave `service_role` ni una clave de IA.

## Estructura

```
.github/      CI en Windows, macOS y Linux, y publicación de instaladores
docs/         arquitectura, decisiones (ADR), specs, roles, diseño e IA
prompts/      prompt versionado de los reportes
scripts/      comprobaciones de tokens de diseño y de textos i18n
src/          interfaz React: app, bridge, cloud, i18n, lib, pages y ui
src-tauri/    núcleo Rust (Tauri v2): sensor, almacenamiento local y comandos
supabase/     migraciones SQL, pruebas de permisos y Edge Functions
```

## Documentación

| Quiero… | Leo… |
|---|---|
| Ver las funcionalidades | [`docs/FUNCIONALIDADES.md`](docs/FUNCIONALIDADES.md) |
| Entender la arquitectura | [`docs/ARQUITECTURA.md`](docs/ARQUITECTURA.md) y [`docs/adr/`](docs/adr/) |
| Saber quién puede hacer qué | [`docs/ROLES.md`](docs/ROLES.md) |
| Entender la IA y las claves | [`docs/IA.md`](docs/IA.md) |
| Hacer interfaz | [`docs/DISENO.md`](docs/DISENO.md) |
| Comprobar que algo funciona | [`docs/COMO-VERIFICAR.md`](docs/COMO-VERIFICAR.md) |

## Notas de plataforma

- Los instaladores no llevan firma de código: Windows y macOS piden confirmar la apertura la primera vez.
- En Linux el sensor necesita una sesión X11; en una sesión Wayland no registra actividad.
- En macOS y Linux no se registra el dominio del navegador; solo en Windows.
- El plan gratuito de Supabase pausa los proyectos sin uso.
