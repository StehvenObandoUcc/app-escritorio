# Diseño de interfaz: tokens, atomic design y ventana adaptable

Cuatro reglas sostienen la interfaz de Pulso. Las cuatro se verifican solas con `npm run verify`.

1. **Ningún valor de diseño fuera de `src/ui/tokens/`.** → `npm run check:tokens`
2. **Cada capa solo importa de las capas inferiores.** → `npm run lint`
3. **Toda pantalla funciona en tres anchos de ventana y en dos temas.** → galería + revisión de cada fase
4. **Ningún texto visible escrito a mano: todo sale de `src/i18n` en español e inglés (ADR-0015).** → `npm run check:i18n`

## 1. Dirección visual

- **La pieza distintiva es la franja de pulso** (`PulseStrip`): el día dibujado como un latido. El trabajo enfocado es un latido alto; la distracción, bajo; sin actividad, la línea base. El resto de la interfaz es sobrio para que la franja destaque.
- **Color**: neutros fríos (azul pizarra) y un solo acento, frambuesa, reservado para la acción principal, el elemento activo y la marca. Nada más va en acento: un estado correcto («Al día») va en tinta. Las categorías tienen su propio color y **nunca dependen solo del color**: la altura en la franja, la leyenda y el nombre en texto repiten la información.
- **Error y foco no se parecen al acento**: el error es bermellón (`danger`), lejos del frambuesa, para que un error no parezca la acción principal. El anillo de foco es de tinta (`focus`: casi negro en claro, casi blanco en oscuro), así se ve también sobre un elemento activo relleno de acento.
- **Tipografía**: *Bricolage Grotesque* para títulos y cifras grandes; *Figtree* para todo lo demás. Las dos van dentro de la app (no se descargan de internet). Las cifras que cambian usan `tabular-nums` para que no bailen.
- **Jerarquía por fondo, sin borde ni sombra**: las superficies (`Surface`, `bg-surface`, radio `rounded-lg` de 24 px) se separan del lienzo (`bg-canvas`) solo por el fondo. Sin tarjetas dentro de tarjetas. La sombra queda para lo que flota (menús, diálogos, avisos). El borde se reserva para campos y botones secundarios.
- **Movimiento**: poco y con propósito. Entradas cortas de opacidad y desplazamiento (`motion-enter`, `motion-stagger`), barras que crecen al mostrarse (`motion-grow-x/y`), el aviso breve (`motion-toast`) y un solo gesto de marca: el latido doble del temporizador en marcha (`motion-pulse`). Con «reducir movimiento» se apagan; lo que se repite se queda quieto en vez de parpadear.
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
| Foco | `--sem-focus` (anillo global de `index.css`; tinta, no acento) |
| Borde | `border-line` · `border-line-strong` |
| Categorías | `bg-cat-productive` · `-neutral` · `-distraction` · `-ai` · `-break` · `-idle` · `pattern-paused` |
| Apps | `bg-app-1` … `bg-app-8`: un color por app en «Tiempo por app» (`appColor` en `lib/apps.ts`). La categoría se sigue diciendo con su marca y en texto |
| Tamaño de texto | `text-xs` (12) · `text-sm` (13) · `text-base` (15) · `text-lg` (18) · `text-xl` (22) · `text-2xl` (28) · `text-display` (44) |
| Fuente | `font-sans` · `font-display` |
| Espacio | múltiplos de 4 px: `p-1` = 4 px, `gap-4` = 16 px… |
| Medidas de pieza | `h-control` · `h-control-sm` · `min-h-touch` · `w-nav` · `w-rail` · `h-strip` · `max-w-content` · `max-w-auth` |
| Radio | `rounded-xs` (4) · `rounded-sm` (6) · `rounded-md` (12) · `rounded-lg` (24, superficies) · `rounded-full` (botones, campos, píldoras) |
| Sombra | `shadow-overlay` (solo elementos flotantes) |
| Movimiento | `motion-enter` · `motion-stagger` · `motion-grow-x` · `motion-grow-y` · `motion-toast` · `motion-pulse` (en `components.css`) |

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
- Solo existen esos dos puntos de corte. `sm:`, `xl:` y `2xl:` **no existen** en este tema: una clase con ellos no hace nada (para «desde 640 px» se usa `md:`; para «por debajo», `max-md:`).
- Las filas usan `flex-wrap` y `min-w-0` + `truncate` para que nada se desborde.
- Ninguna pantalla tiene desplazamiento horizontal.
- Área mínima de clic: `min-h-touch` (44 px) en la navegación compacta.

## 5. Patrones de pantalla

- **Un solo botón principal por pantalla**: el siguiente paso de quien mira. Lo demás es secundario o fantasma. Deshacer algo terminado («Reabrir») nunca es principal.
- **Lo destructivo, lejos y confirmado**: «Borrar tarea» y «Borrar proyecto» van al final de su página, no junto a Editar o Archivar, y piden confirmación (el proyecto, escribir su nombre).
- **Volver arriba a la izquierda**: `PageLayout` recibe `back` y lo pone sobre el título.
- **Revelación progresiva**: a la vista solo lo que casi siempre se usa; el resto plegado («Más detalles» en el formulario de tarea, «Evidencia requerida», el texto completo del consentimiento). Si el primer error de validación está en algo plegado, se abre y recibe el foco.
- **Estados vacíos con salida**: dicen qué falta y, si hay algo que hacer, llevan el botón que lo hace («Ir a Equipo», «Crear el primer proyecto»). El estado vacío de primera vez da la bienvenida y explica que la actividad ya se registra y se queda en el computador.
- **Formularios**: error junto al campo y foco en el primero; el error se va al escribir en ese campo y se revalida al enviar. Enter pasa al siguiente campo vacío; Ctrl+Enter guarda desde cualquier campo; Esc cancela (con aviso si hay cambios).
- **Fechas y horas**: la hora siempre en 24 h («13:30»); `formatDate` lo fuerza cuando la opción lleva hora.
- **Avisos**: el `Toast` confirma lo que hizo quien usa la app; `TaskNoticeBanner` avisa de lo que hicieron otras personas. Nunca los dos por lo mismo. En compacto suben por encima de la barra inferior (y de la franja del temporizador).
- **Temporizador en marcha**: siempre visible en la navegación (`RunningTimer`) con tiempo, tarea y detener. Al entregar o completar su tarea se detiene solo.

## 6. Accesibilidad mínima

- Foco de teclado siempre visible (definido una sola vez en `index.css`), en tinta para que se vea sobre el acento.
- Contraste AA para texto. El acento sobre blanco y el blanco sobre el acento cumplen 4.5:1.
- Los iconos decorativos llevan `aria-hidden`; un botón de solo icono lleva texto para lectores de pantalla.
- Los gráficos tienen un resumen en texto (`aria-label`) y su detalle en una lista.
- Se respeta `prefers-reduced-motion`.

## 7. Lista de comprobación de un componente nuevo

- [ ] Está en la capa correcta y exportado en su `index.ts`.
- [ ] Solo usa utilidades de tokens (`npm run check:tokens`).
- [ ] Aparece en la galería (`src/dev/GaleriaPage.tsx`) con sus variantes y estados.
- [ ] Se ve bien a 380, 800 y 1280 px de ancho, en tema claro y oscuro.
- [ ] Se puede usar con teclado.
- [ ] No añade un segundo botón principal a la pantalla, y lo destructivo pide confirmación.
- [ ] Tiene prueba si contiene lógica o interacción.
