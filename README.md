# Pulso

App de escritorio para que un equipo entienda cómo usa su tiempo y sus herramientas de IA,
sin vigilar a nadie: registra actividad, gestiona tareas y genera reportes con IA a partir de
cifras calculadas.

**Entrega:** lunes 19 de octubre de 2026 · **Plataforma v1:** Windows 10/11 · **Stack:** Tauri v2 + React + TypeScript + Tailwind + Rust + SQLite + Supabase.

## Empezar (5 minutos, sin Docker)

Requisitos: [Node.js 22 o superior](https://nodejs.org) y Git. Para abrir la app de escritorio,
además [Rust](https://rustup.rs) y las *Microsoft C++ Build Tools* (ver `docs/COMO-VERIFICAR.md`).

```bash
npm install
npm run verify     # lint + tipos + guardián de tokens + pruebas de interfaz y de base de datos
npm run dev        # interfaz en el navegador con datos de ejemplo → http://localhost:1420
npm run tauri dev  # la app de escritorio real (la primera compilación tarda unos minutos)
```

Galería de componentes (solo en desarrollo): <http://localhost:1420/#/dev/galeria>

## Activar la integración continua (una sola vez)

Los archivos de GitHub (CI, plantilla de *pull request* y CODEOWNERS) están en la carpeta
`_github` porque deben activarse a mano. En PowerShell, dentro de la carpeta del proyecto:

```powershell
Move-Item _github\CODEOWNERS, _github\pull_request_template.md .github\
Move-Item _github\workflows\ci.yml .github\workflows\
Remove-Item _github -Recurse
```

Desde ese momento, cada subida a GitHub ejecuta `npm run verify` y el linter de Rust en Windows.

## Dónde está cada cosa

| Quiero… | Leo… |
|---|---|
| Saber qué se construye y cuándo | `docs/PLAN.md` |
| Ver TODAS las funcionalidades y su fase | `docs/FUNCIONALIDADES.md` |
| Entender la arquitectura y las decisiones cerradas | `docs/ARQUITECTURA.md` |
| Saber quién puede hacer qué | `docs/ROLES.md` |
| Entender cómo se usa la IA y las claves | `docs/IA.md` |
| Hacer interfaz (tokens, atomic design, responsive) | `docs/DISENO.md` |
| Comprobar que algo funciona | `docs/COMO-VERIFICAR.md` |
| Saber qué versiones usar | `docs/STACK.lock.md` |
| Trabajar con agentes de IA | `AGENTS.md` |

## Estructura

```
src/
  ui/tokens/      design tokens (único lugar con valores de diseño)
  ui/atoms/       piezas mínimas: Button, Input, Badge…
  ui/molecules/   combinaciones pequeñas: FormField, TimerControl…
  ui/organisms/   bloques completos: PulseStrip, ActivityList, AppNav
  ui/templates/   estructuras de página: AppShell, PageLayout
  pages/          páginas: conectan datos con la interfaz
  bridge/         contrato con Rust + implementación simulada y real
  lib/            utilidades sin interfaz
  dev/            galería de componentes
src-tauri/        núcleo Rust (sensor, SQLite, secretos)
supabase/
  migrations/     SQL: tablas, RLS y funciones (la fuente de verdad de permisos)
  tests/          pruebas de permisos con Postgres en memoria (sin Docker)
  functions/      Edge Functions (IA gratuita con cuotas, desde F4)
prompts/          prompts versionados
docs/             plan, arquitectura, decisiones y specs
scripts/          guardianes de calidad
```
