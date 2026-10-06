# ADR-0005 · Comando `time_entries(date)`

Fecha: 2026-10-05 · Estado: aceptado

## Contexto
TA-06 exige que cada persona pueda editar y eliminar sus entradas de tiempo. La lista de
comandos de F1 (`docs/ARQUITECTURA.md` §6) permite crear, editar y borrar, pero ninguno devuelve
las entradas existentes, y la spec F1 fija que `DayView` no cambia. Sin poder leerlas, la
interfaz no sabe qué `id` editar o borrar.

## Decisión
Se agrega el comando `time_entries(date)`: devuelve las entradas de tiempo del día local
(no borradas, incluida la del temporizador en marcha), ordenadas por inicio.
`DayView`, `ActivityBlock` y `SensorStatus` no cambian.

## Consecuencias
- Un comando más en Rust, en `src/bridge/contract.ts` y en `mock.ts` (§6 queda actualizada en el mismo cambio).
- No toca la base: usa la tabla `time_entries_local` que ya existía.
