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
| [0006](./0006-metrica-de-memoria.md) | Métrica de memoria: privada, suma de Pulso y WebView2, tras 5 min en reposo | Aceptado |
| [0007](./0007-equipo-activo-en-rust.md) | Equipo activo en Rust: comando `active_team_set` | Aceptado |
| [0008](./0008-registro-sin-verificacion-y-codigo-de-invitacion.md) | Registro sin verificar el correo; las invitaciones llevan un código | Aceptado |
| [0009](./0009-dominio-del-sitio-y-politicas-del-equipo.md) | Dominio del sitio web, sitios no permitidos y política de apps ocultas | Aceptado |

Plantilla: copia cualquiera de los anteriores. Numeración consecutiva de cuatro dígitos.
