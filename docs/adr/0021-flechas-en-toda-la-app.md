# ADR-0021 · Flechas en toda la app (navegación espacial)

Fecha: 2026-10-08 · Estado: aceptado (por StehvenObando). Reemplaza en parte ADR-0019.

## Contexto
- Las flechas solo funcionaban en las listas marcadas una por una; el resto de la app no se podía recorrer con el teclado.
- El botón «Atajos» y el enlace «Saltar al contenido» aparecían al inicio y estorbaban.

## Decisión
- **Una sola regla global** (`arrowToNearest` en `src/app/keyboard.ts`): las flechas mueven el foco al elemento más cercano en esa dirección, en cualquier pantalla, y Enter lo activa.
  - Dentro de un diálogo abierto, solo se recorre el diálogo.
  - No interfiere con los campos que usan las flechas para su valor (textos, listas desplegables, fechas, números) ni con las pestañas.
- **Se borra el marcado lista por lista** (`arrowNav`, `data-nav-item`).
- **Se quitan** el botón «Atajos» y «Saltar al contenido». La ayuda sigue disponible con «?».
- **Se mantienen:** Enter para pasar de campo, Ctrl+Enter para enviar, Esc y Alt+1…6.

## Consecuencias
- Menos código y funciona en las pantallas nuevas sin hacer nada.
