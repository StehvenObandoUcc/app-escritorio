# Diseño de interfaz: tokens, atomic design y ventana adaptable

Tres reglas sostienen la interfaz de Pulso. Las tres se verifican solas con `npm run verify`.

1. **Ningún valor de diseño fuera de `src/ui/tokens/`.** → `npm run check:tokens`
2. **Cada capa solo importa de las capas inferiores.** → `npm run lint`
3. **Toda pantalla funciona en tres anchos de ventana y en dos temas.** → galería + revisión de cada fase

## 1. Dirección visual

- **La pieza distintiva es la franja de pulso** (`PulseStrip`): el día dibujado como un latido. El trabajo enfocado es un latido alto; la distracción, bajo; sin actividad, la línea base. El resto de la interfaz es sobrio para que la franja destaque.
- **Color**: neutros fríos (azul pizarra) y un solo acento, frambuesa, reservado para la acción principal, el elemento activo y la marca. Las categorías tienen su propio color y **nunca dependen solo del color**: la altura en la franja y el nombre en texto repiten la información.
- **Tipografía**: *Bricolage Grotesque* para títulos y cifras grandes; *Figtree* para todo lo demás. Las dos van dentro de la app (no se descargan de internet). Las cifras que cambian usan `tabular-nums` para que no bailen.
- **Jerarquía por borde, no por sombra**: las superficies son planas con borde. La sombra queda para lo que flota (menús, diálogos).
- **Texto**: español, frases cortas, mayúscula solo al inicio. Un botón dice exactamente lo que hace (*Guardar cambios*, no *Enviar*) y conserva su nombre en todo el flujo. Un error dice qué pasó y cómo arreglarlo, sin pedir perdón.

## 2. Design tokens (tres capas)

```
src/ui/tokens/
  primitives.css   Capa 1 · valores crudos        --prim-ink-900: #141a26
  semantic.css     Capa 2 · significado y tema    --sem-fg: var(--prim-ink-900)
  components.css   Capa 3 · medidas de piezas     --cmp-nav-width: 13.5rem
  theme.css        Puente a Tailwind              --color-fg: var(--sem-fg)  →  text-fg
  index.css        Importa todo en orden + estilos base
```

- Los componentes solo usan **utilidades de Tailwind generadas desde tokens**: `bg-surface`, `text-fg-muted`, `border-line`, `rounded-lg`, `h-control`, `w-nav`.
- La paleta por defecto de Tailwind está desactivada: `bg-blue-500` no existe.
- El tema oscuro vive solo en `semantic.css`. Un componente nunca pregunta por el tema.

### Tokens disponibles

| Tipo | Utilidades |
|---|---|
| Fondo | `bg-canvas` · `bg-surface` · `bg-sunken` · `bg-accent` · `bg-accent-soft` · `bg-danger-soft` |
| Texto | `text-fg` · `text-fg-muted` · `text-on-accent` · `text-accent-text` · `text-danger` |
| Borde | `border-line` · `border-line-strong` |
| Categorías | `bg-cat-productive` · `-neutral` · `-distraction` · `-ai` · `-break` · `-idle` · `pattern-paused` |
| Tamaño de texto | `text-xs` (12) · `text-sm` (13) · `text-base` (15) · `text-lg` (18) · `text-xl` (22) · `text-2xl` (28) · `text-display` (44) |
| Fuente | `font-sans` · `font-display` |
| Espacio | múltiplos de 4 px: `p-1` = 4 px, `gap-4` = 16 px… |
| Medidas de pieza | `h-control` · `h-control-sm` · `min-h-touch` · `w-nav` · `w-rail` · `h-strip` · `max-w-content` · `max-w-auth` |
| Radio | `rounded-xs` (4) · `rounded-sm` (6) · `rounded-md` (8) · `rounded-lg` (12) · `rounded-full` |
| Sombra | `shadow-overlay` (solo elementos flotantes) |

### Cómo agregar un token

1. ¿Es un valor nuevo? Agrégalo a `primitives.css`.
2. Dale significado en `semantic.css` (y su valor en tema oscuro, en los **dos** bloques).
3. Exponlo en `theme.css` dentro de `@theme inline`.
4. Añádelo a la tabla de arriba y a la galería.

### Prohibido (lo detecta `check:tokens`)

```tsx
<div className="bg-[#1b2333]" />        // color escrito a mano
<div className="text-gray-500" />       // paleta por defecto de Tailwind
<div className="w-[220px]" />           // valor arbitrario
<div style={{ color: 'rgb(0,0,0)' }} /> // color en estilos en línea
```

Sí se permite `style` para valores **calculados con datos**, como la posición de un bloque en la franja (`left: 12.5%`).

## 3. Atomic design

| Capa | Carpeta | Qué es | Puede importar de | Ejemplos |
|---|---|---|---|---|
| Tokens | `src/ui/tokens` | Valores | — | colores, tamaños |
| Átomos | `src/ui/atoms` | Pieza mínima, sin lógica de negocio | tokens, `lib` | `Button`, `Input`, `Badge`, `Surface`, `Heading`, `Avatar`, `ProgressBar`, `CategoryMark` |
| Moléculas | `src/ui/molecules` | Pocos átomos con un propósito | átomos | `FormField`, `TimerControl`, `CategoryBreakdown`, `EmptyState`, `ThemeToggle` |
| Organismos | `src/ui/organisms` | Sección completa de una pantalla | moléculas, átomos | `PulseStrip`, `ActivityList`, `AppNav` |
| Plantillas | `src/ui/templates` | Estructura de página, sin datos | organismos y capas inferiores | `AppShell`, `PageLayout` |
| Páginas | `src/pages` | Conectan datos con plantillas | todo, incluido el puente | `MiDiaPage` |

Reglas:
- Los componentes de `src/ui` **reciben todo por props**. No llaman al puente ni a Supabase. Solo las páginas lo hacen.
- Un componente nuevo va en la capa más baja en la que quepa.
- Cada carpeta tiene un `index.ts` que exporta sus componentes.
- La lógica que no es visual (cálculos, formato) va en `src/lib` o en un archivo `.ts` junto al componente, con su prueba (`pulseLayout.ts`).

## 4. Ventana adaptable

La ventana de Pulso se puede estrechar hasta 360 × 560 px para tenerla a un lado mientras se trabaja.

| Tamaño | Ancho | Navegación | Contenido |
|---|---|---|---|
| Compacto | menos de 640 px | Barra inferior con icono y texto | Una columna |
| Medio | 640 a 1023 px (`md:`) | Riel lateral de iconos | Una columna |
| Expandido | 1024 px o más (`lg:`) | Barra lateral con texto | Dos columnas donde ayude |

Reglas:
- Se diseña primero el tamaño compacto; `md:` y `lg:` amplían.
- Solo existen esos dos puntos de corte.
- Las filas usan `flex-wrap` y `min-w-0` + `truncate` para que nada se desborde.
- Ninguna pantalla tiene desplazamiento horizontal.
- Área mínima de clic: `min-h-touch` (44 px) en la navegación compacta.

## 5. Accesibilidad mínima

- Foco de teclado siempre visible (definido una sola vez en `index.css`).
- Contraste AA para texto. El acento sobre blanco y el blanco sobre el acento cumplen 4.5:1.
- Los iconos decorativos llevan `aria-hidden`; un botón de solo icono lleva texto para lectores de pantalla.
- Los gráficos tienen un resumen en texto (`aria-label`) y su detalle en una lista.
- Se respeta `prefers-reduced-motion`.

## 6. Lista de comprobación de un componente nuevo

- [ ] Está en la capa correcta y exportado en su `index.ts`.
- [ ] Solo usa utilidades de tokens (`npm run check:tokens`).
- [ ] Aparece en la galería (`src/dev/GaleriaPage.tsx`) con sus variantes y estados.
- [ ] Se ve bien a 380, 800 y 1280 px de ancho, en tema claro y oscuro.
- [ ] Se puede usar con teclado.
- [ ] Tiene prueba si contiene lógica o interacción.
