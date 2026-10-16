# Pulso — instrucciones para agentes de IA (y personas)

Antes de escribir código, lee en este orden:
1. `docs/ARQUITECTURA.md` — fuente de verdad. Si algo no está ahí ni en una spec, **no se implementa**.
2. La spec de tu tarea en `docs/specs/`.
3. `docs/DISENO.md` si tocas interfaz · `docs/ROLES.md` si tocas permisos · `docs/IA.md` si tocas IA.

Orden de autoridad: `docs/ARQUITECTURA.md` > `docs/specs/*` > contratos (`src/bridge/contract.ts`, `supabase/migrations`) > código > conversación.

## Comandos

```bash
npm run verify        # OBLIGATORIO antes de cada entrega: lint + tipos + tokens + pruebas
npm run test:ui       # solo pruebas de interfaz
npm run test:db       # solo pruebas de permisos (Postgres en memoria, sin Docker)
npm run dev           # interfaz con datos de ejemplo en http://localhost:1420
npm run tauri dev     # app real
npm run verify:rust   # clippy + pruebas de Rust (cuando toques src-tauri)
```

## Reglas duras

- **R1. Versiones.** Usa solo lo que está en `docs/STACK.lock.md`. No agregues dependencias sin un ADR aprobado en `docs/adr/`.
- **R2. No inventes APIs.** Antes de usar una función de una librería, compruébala en los tipos instalados (`node_modules/<paquete>`) o con `cargo doc`. El conocimiento de memoria puede estar desactualizado: varias librerías de este proyecto son versiones recientes. Si no puedes comprobarla, escribe `BLOQUEADO: <qué falta>` y detente.
- **R3. No inventes nombres.** Tablas, columnas, comandos de Rust, roles y categorías son los de `docs/ARQUITECTURA.md`, `docs/ROLES.md` y `src/bridge/contract.ts`. Ninguno más.
- **R4. Toca solo los archivos de tu tarea.** No modifiques pruebas, specs, migraciones ya aplicadas ni `src-tauri/capabilities/` para hacer pasar algo.
- **R5. Las cifras no las calcula la IA.** Todo número que ve el usuario sale de SQL o de código probado.
- **R6. Secretos.** Nunca en código, pruebas, registros ni prompts. Los nombres de variables están en `.env.example`.
- **R7. Diseño.** Ningún color, tamaño o radio escrito a mano fuera de `src/ui/tokens/`. Respeta las capas de atomic design. `npm run check:tokens` y ESLint lo verifican.
- **R8. Privacidad.** Los títulos de ventana nunca salen del equipo: ningún payload de red los incluye.
- **R9. Ambigüedad.** Si la spec es ambigua o contradice la arquitectura, pregunta. No elijas por tu cuenta.
- **R10. Idioma.** Código (nombres, tipos) en inglés. Comentarios y documentos en español. Los textos de la interfaz van en `src/i18n/es.ts` y `en.ts` y se usan con `t('clave')` (ADR-0015); `npm run check:i18n` lo verifica.

## Qué significa "terminado"

1. `npm run verify` en verde (y `npm run verify:rust` si tocaste Rust).
2. Cada criterio de aceptación de la spec tiene una prueba.
3. Si hay interfaz: aparece en la galería, se ve bien en los 3 anchos y en tema claro y oscuro.
4. La entrega lista: comandos ejecutados y su resultado, supuestos, y lo que NO se hizo.

## Plantilla de tarea

```
ID: PUL-<n> · Fase: F<n> · Funcionalidades: <IDs de docs/FUNCIONALIDADES.md>
Spec: docs/specs/<archivo>.md (criterios AC-1..AC-n)
Archivos permitidos: <rutas exactas>
Contratos de solo lectura: <archivos>
Debe pasar: npm run verify [+ npm run verify:rust]
Fuera de alcance: <lista>
```
