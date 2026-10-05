# Decisiones de arquitectura (ADR)

Un ADR es una página corta que deja escrita una decisión: contexto, decisión y consecuencias.
Hace falta un ADR para: agregar una dependencia, agregar un comando de Rust, cambiar una
decisión de `docs/ARQUITECTURA.md` §3 o cambiar una celda de `docs/ROLES.md`.

| ADR | Decisión | Estado |
|---|---|---|
| [0001](./0001-sincronizacion-en-typescript.md) | La sincronización vive en TypeScript | Aceptado |
| [0002](./0002-un-solo-formato-de-ia.md) | Un solo formato de IA: compatible con OpenAI | Aceptado |
| [0003](./0003-pruebas-de-base-de-datos-sin-docker.md) | Pruebas de base de datos con PGlite, sin Docker | Aceptado |
| [0004](./0004-invitaciones-sin-envio-de-correos.md) | Invitaciones sin envío de correos | Aceptado |
| [0005](./0005-comando-time-entries.md) | Comando `time_entries(date)` para leer entradas de tiempo | Aceptado |

Plantilla: copia cualquiera de los anteriores. Numeración consecutiva de cuatro dígitos.
