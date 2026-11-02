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
