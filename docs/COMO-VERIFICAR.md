# Cómo comprobar que todo funciona (sin Docker)

## 1. Preparar el equipo (una sola vez, Windows)

| Qué | Para qué | Cómo comprobar |
|---|---|---|
| [Node.js](https://nodejs.org) 22 o superior | Interfaz y pruebas | `node -v` |
| Git | Control de versiones | `git --version` |
| [Rust](https://rustup.rs) | Compilar el núcleo de la app | `cargo -V` |
| Microsoft C++ Build Tools (carga "Desarrollo para el escritorio con C++") | Lo exige Rust en Windows | `npm run tauri dev` compila |
| WebView2 | Ya viene en Windows 10 y 11 actualizados | — |

Sin Rust todavía puedes trabajar en la interfaz y en la base de datos: todo lo de las secciones 2, 3 y 4 funciona solo con Node.

## 2. La comprobación de siempre

```bash
npm install        # la primera vez, o cuando cambie package.json
npm run verify
```

`verify` ejecuta, en orden:

| Paso | Qué comprueba | Solo ese paso |
|---|---|---|
| Lint | Errores de código y capas de atomic design | `npm run lint` |
| Tipos | TypeScript estricto | `npm run typecheck` |
| Tokens | Ningún color ni medida escrita a mano | `npm run check:tokens` |
| Pruebas de interfaz | Componentes, páginas y utilidades | `npm run test:ui` |
| Pruebas de permisos | Roles y RLS sobre un Postgres en memoria | `npm run test:db` |

Si `verify` termina sin errores, el cambio se puede entregar.

## 3. Ver la interfaz

```bash
npm run dev
```

- App con datos de ejemplo: <http://localhost:1420>
- Galería de componentes: <http://localhost:1420/#/dev/galeria>

Qué revisar en cada pantalla nueva:
1. Estrecha la ventana del navegador hasta unos 380 px, luego 800 y luego 1280.
2. Cambia el tema con el botón de la barra lateral.
3. Recorre la pantalla solo con el teclado (Tab, Enter, Espacio).

## 4. Probar permisos sin Docker ni conexión

```bash
npm run test:db
```

Qué hace: arranca un Postgres real dentro de Node (PGlite), aplica todas las migraciones de
`supabase/migrations` y ejecuta consultas como cada rol, igual que la API de Supabase.
Tarda unos segundos.

Para probar una regla nueva: copia un caso de `supabase/tests/identidad_y_equipos.test.ts`.

Límite de este método: comprueba tablas, políticas y funciones SQL. No comprueba el servicio
de cuentas de Supabase ni las Edge Functions; eso se revisa a mano en las puertas de F2 y F4.

## 5. Supabase en la nube

No se instala nada en el equipo: se usa el proyecto `pulso-dev` de Supabase.

Aplicar migraciones, opción A (la más simple): en el panel de Supabase, abre *SQL Editor*,
pega el contenido de cada archivo de `supabase/migrations` en orden y ejecútalo.

Opción B (recomendada desde F2, deja registro de lo aplicado):

```bash
npx supabase@2.119.0 login
npm run db:link      # pide el identificador del proyecto
npm run db:push      # aplica las migraciones que falten
npm run db:types     # genera src/lib/database.types.ts (nunca se edita a mano)
```

Edge Functions (desde F4), sin Docker:

```bash
npx supabase@2.119.0 secrets set DEEPSEEK_API_KEY=... AI_TRIAL_ENABLED=true AI_TRIAL_MODEL=...
npx supabase@2.119.0 functions deploy ai-trial --use-api
```

La clave se escribe en la terminal en ese momento. No se guarda en ningún archivo del proyecto.

## 6. La app de escritorio

```bash
npm run tauri dev      # ventana real; la primera compilación tarda varios minutos
npm run verify:rust    # linter y pruebas de Rust
npm run tauri build    # instalador (F6)
```

Para usar el sensor real en lugar de los datos de ejemplo (desde F1): crea `.env` a partir de
`.env.example` y pon `VITE_BRIDGE=tauri`.

## 7. Problemas frecuentes

| Síntoma | Causa y solución |
|---|---|
| `npm run dev` dice que el puerto 1420 está ocupado | Hay otra instancia abierta. Ciérrala |
| `npm run tauri dev` falla con `link.exe not found` | Faltan las C++ Build Tools |
| *Mi día* muestra "Datos de ejemplo" dentro de la app | Falta `VITE_BRIDGE=tauri` en `.env`, o aún no está F1 |
| `check:tokens` falla | Hay un color o medida escrita a mano: usa un token (`docs/DISENO.md`) |
| El lint dice "Atomic design: esta capa no puede importar…" | El componente está en la capa equivocada o importa hacia arriba |
| `test:db` falla con "La migración … falló" | Error de SQL en esa migración: el mensaje indica cuál |
