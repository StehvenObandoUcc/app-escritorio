# ADR-0022 · IA y reportes: reqwest, validación doble y etiquetado de IA

Fecha: 2026-10-08 · Estado: propuesto.

## Contexto
- F4 llama a la IA con la clave del usuario desde Rust (D-02 de la arquitectura) y `docs/STACK.lock.md` deja `reqwest` como pendiente.
- El validador anti-alucinación corre en la app, pero la app no es de fiar: alguien podría guardar en el historial del equipo un texto con cifras inventadas.
- IA-04 pide etiquetar una sesión de IA por tipo de uso y no hay comando para hacerlo.
- El prompt v1 solo pide respuestas en español y la app ya está en dos idiomas (ADR-0015).

## Decisión
- **`reqwest` 0.13.5** para `ai_chat`, con el TLS de Windows (`native-tls`, que usa SChannel) en lugar de `rustls` como decía `STACK.lock.md`.
  - `reqwest` ya está en `Cargo.lock` por otras dependencias, pero sin TLS.
  - `rustls` traería su propia criptografía (`aws-lc-rs`, que en Windows pide CMake y NASM para compilar). SChannel viene con el sistema, usa sus certificados y pesa menos en el instalador.
- **El validador corre dos veces:** en TypeScript (`supabase/functions/_shared/report-validator.ts`), para decidir el reintento, y en SQL dentro de `save_report`, que es la barrera real. Un mismo archivo de casos prueba los dos.
- **Comando nuevo `block_set_ai_usage(id, usage)`** en el puente para IA-04. Solo vale para bloques de categoría IA; el bloque vuelve a quedar pendiente de subir.
- **Prompt `report.v2.md`** con el idioma de la respuesta. La v1 no se borra.
- **El día del cupo gratis es UTC**, el mismo para todos.

## Consecuencias
- La lógica del validador vive en dos lenguajes; los casos compartidos impiden que se separen.
- Se actualiza la tabla del puente de `docs/ARQUITECTURA.md` §5 y `docs/STACK.lock.md`.
