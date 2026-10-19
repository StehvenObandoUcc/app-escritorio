# Auditoría UX: dónde quedamos (18 de octubre de 2026)

Rama `feat/f6-entrega`. Todos los commits son locales: **nada se ha subido (sin push)**. Autor: `stehven.obando@campusucc.edu.co`, sin co-autor.

## Hecho

| Lote / tema | Hallazgos | Commits |
|---|---|---|
| Lote 1 · Pérdida de datos y errores | F-01, F-04, F-10 | `4979a30` |
| Aviso al cambiar de pantalla con un formulario a medias; botones con texto largo | F-01 | `db8cbda` |
| Lote 2 · Idioma | F-03, F-08, F-20 | `be6174d` |
| Lote 3 · Textos (glosario) | F-02, F-06, F-07, F-11, F-12, F-22 | `b6e9a64` |
| Lote 4 · Accesibilidad | A-01 a A-06, A-09, F-17 | `5a43c0d`, `7128628`, `abf9925`, `f8d07a5`, `7b1f9e5`, `1c4692f` |
| Lote 5 · Orientación y ayuda | F-05, F-09, F-13, F-15, F-16, F-18 | `88cee08`, `8554034`, `619d6a0`, `793df0c`, `f4a3c38`, `e090a03` |
| Estilo inspirado en las imágenes de referencia | Radios 24/12 px, píldoras, sin bordes en tarjetas ni menú, activo relleno de acento | `369eaca`, `c1d42ee` |
| Microanimaciones | Cascada al cambiar de pantalla, indicador deslizante, barras que crecen, plegables y avisos | `061b678` |
| Idioma solo en Ajustes y en el acceso | Se quitó del pie del menú | `f2cdfda` |
| Documentación | F6-8 y F6-9 en `docs/PLAN.md`, fila 13 de `docs/ROLES.md`, notas en la ADR-0021 | `7e86aa7`, `b4687d8`, `6856d5a`, `a61f3dd`, `21c735a` |

## Pruebas

- La última batería completa verificada (`npx vitest run --maxWorkers=1`) dio 579 de 579. Se corrió antes de F-18, los bordes, el idioma y las microanimaciones.
- La batería de después de las microanimaciones (`061b678`) quedó corriendo al cierre; solo se vio que `check:i18n` pasó. **Hay que repetirla.**
- Fallos conocidos por carga de la máquina (pasan al correrlos solos): `PausaConTope` (F6-5), `AjustesPage` por tiempo, y a veces `App.test`, `keyboard.test` y `Proyectos.test`.
- `npm run verify` sin límite de procesos satura la máquina: usar `npx vitest run --maxWorkers=1`.

## Pendiente para mañana

1. **Repetir las pruebas:** `node scripts/check-i18n.mjs` y `npx vitest run --maxWorkers=1`, separando los fallos conocidos de los nuevos.
2. **Prueba manual en la app** (`npm run tauri dev`), en español e inglés:
   - tarjetas sin borde en tema claro (blanco sobre gris muy suave): ¿se distinguen bien?;
   - menú en riel (640-1023 px) con ítems en círculo, y el activo relleno de acento;
   - indicador deslizante en Día/Semana/Mes y en las pestañas de Equipo y Proyecto;
   - cascada al cambiar de pantalla, barras que crecen y aviso que se desvanece;
   - con «Mostrar animaciones» desactivado en Windows, nada se mueve;
   - Ajustes → «Cuenta y preferencias» a 360 px;
   - consentimiento: resumen, «Leer el detalle completo» y «Marca la casilla para continuar»;
   - Equipo sin equipo: dos caminos y «Buscar invitaciones» (con una segunda cuenta que invite).
3. **Aclarar con el usuario** qué quiso decir con «que sea responsive en base a la pantalla» al pedir quitar los bordes.
4. **Lote 6 (no empezado; esperar su aprobación):**
   - F-14: las flechas globales no deben impedir desplazar la página, y Enter debe enviar cuando los campos obligatorios estén llenos;
   - F-17: el resto del formulario de tarea (asterisco sin leyenda, atajos siempre visibles);
   - F-19: menú de 5 ítems + «Más» por debajo de 640 px.
5. **Pendientes del backend, fuera del frontend** (anotados en `docs/PLAN.md`):
   - **F6-9 (P1):** el consentimiento no dice que un líder de proyecto ve las horas de temporizador y de IA de las personas de sus proyectos (Tablero → «Tus proyectos» y Proyecto → Miembros). Hay que corregir `consent.who` y el resumen, subir `CONSENT_VERSION` y pedir una nueva aceptación.
   - **F6-8 (P3):** roles en inglés en cuatro mensajes de `supabase/migrations`.
6. **Por validar con usuarios:** el nombre «Tablero» del panel y el resto de la sección 9 de la auditoría.

## Reglas que pidió el usuario

- Un commit por hallazgo o tema, con su identidad y sin co-autor. Sin push.
- Antes de cambiar tokens o estilos, decir los valores de antes y después y qué pantallas cambian.
- Antes de cambios de disposición, describir la pantalla y esperar su confirmación.
- No cambiar la paleta. Los textos nuevos van en `es.ts` y `en.ts`.
- No modificar el texto íntegro del consentimiento ni `CONSENT_VERSION` sin su permiso.
