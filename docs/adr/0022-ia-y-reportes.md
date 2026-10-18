# ADR-0022 · IA y reportes: reqwest, un solo validador y etiquetado de IA

Fecha: 2026-10-08 · Estado: aceptado (por StehvenObando).

## Contexto
- F4 llama a la IA con la clave del usuario desde Rust (D-02 de la arquitectura) y `docs/STACK.lock.md` deja `reqwest` como pendiente.
- El validador anti-alucinación tiene que correr donde llega la respuesta de la IA: en el servidor (modo Gratis) o en la app (Clave propia y Manual). Repetirlo en SQL duplicaría la lógica en dos lenguajes.
- IA-04 pide etiquetar una sesión de IA por tipo de uso y no hay comando para hacerlo.
- El prompt v1 solo pide respuestas en español y la app ya está en dos idiomas (ADR-0015).

## Decisión
- **`reqwest` 0.13.5** para `ai_chat`, con el TLS de Windows (`native-tls`, que usa SChannel) en lugar de `rustls` como decía `STACK.lock.md`.
  - `reqwest` ya está en `Cargo.lock` por otras dependencias, pero sin TLS.
  - `rustls` traería su propia criptografía (`aws-lc-rs`, que en Windows pide CMake y NASM para compilar). SChannel viene con el sistema, usa sus certificados y pesa menos en el instalador.
- **Un solo validador completo, en TypeScript** (`supabase/functions/_shared/report-validator.ts`, sin importaciones). Lo ejecuta la Edge Function en modo Gratis y la app en Clave propia y Manual. `save_report` solo comprueba la forma (esquema, `fact_id` existentes y longitudes) sobre los hechos que recalcula; `save_report` guarda siempre `validated_by = 'client'`; la Edge Function lo pasa a `server` con `mark_trial_report(id)` (solo `service_role`, reportes `free` de menos de 5 minutos). Sin tabla de vales.
- **IA-04:** comando nuevo `block_set_ai_usage(id, usage)` en el puente y función `set_block_ai_usage(id, usage)` en Supabase (dueño del bloque y `category = 'ai'`, con `CHECK`). Si el bloque aún no se subió, la etiqueta viaja con él; la función solo se usa para bloques ya sincronizados (también para quitar la etiqueta).
- **Prompt `report.v2.md`** con el idioma de la respuesta. La v1 no se borra.
- **El día del cupo gratis se cuenta en `America/Bogota`.**
- **Sin desglose por persona** en los reportes de proyecto y de equipo, y por eso sin seudónimos (la comparación entre miembros es de F5). Exigen al menos 2 miembros.
- **`ai_tool` cerrado en los hechos:** solo `chatgpt`, `claude`, `gemini`, `deepseek`, `copilot`, `ollama`, `lmstudio` u `other`, para que ningún texto libre llegue al prompt.

## Consecuencias
- Un texto validado en la app no se vuelve a validar en el servidor: `validated_by = 'client'` lo deja a la vista; solo `mark_trial_report` puede ponerlo en `server`.
- Se actualiza la tabla del puente de `docs/ARQUITECTURA.md` §5 y `docs/STACK.lock.md`.
