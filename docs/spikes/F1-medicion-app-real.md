# F1 · Medición y prueba con la app real

Fecha: 2026-10-05 · Equipo: Windows 11, 8 núcleos · Compilación: `npx tauri build --no-bundle` con `VITE_BRIDGE=tauri`.

## Rendimiento (AC-19)

Medido tras ~80 s de uso con la ventana abierta. **No es todavía la medición de una hora que pide la spec.**

| Métrica | Resultado | Meta | Estado |
|---|---|---|---|
| Tamaño de `pulso.exe` | 12 MB | instalador < 20 MB | Falta compilar el instalador |
| CPU media (`pulso.exe`) | 0,01 % | < 1 % | Cumple |
| CPU media (WebView2, 6 procesos) | 0,17 % | < 1 % | Cumple |
| Memoria **privada** total (pulso + WebView2) | 83,5 MB | < 120 MB | Cumple |
| Conjunto de trabajo total (cuenta páginas compartidas varias veces) | 395 MB | < 120 MB | No cumple con esta métrica |

Decisión pendiente: qué métrica define «memoria total» en la spec. La privada es la que muestra el
Administrador de tareas por proceso; el conjunto de trabajo suma páginas que los procesos de WebView2 comparten.

## Prueba con la app real (AC-16, AC-3, AC-4, AC-8, AC-9, AC-12, AC-14)

- *Mi día* muestra datos reales de la sesión (jornada 16:53–17:24), no los del simulador.
- Botones pulsados por UI Automation: pausa de privacidad (13 s, `paused`, sin título), reanudar, descanso (12 s, `break`),
  terminar descanso, iniciar y detener el temporizador (entrada `timer` de 8 s).
- Inactividad real: el equipo quedó sin uso y se registró un bloque «Sin actividad».
- Cierre con la X: el último bloque termina exactamente al cerrar (volcado final).
- Base SQLite: 0 títulos legibles, 0 bloques menores de 10 s.

## Fallo encontrado y corregido

Al reabrir la app con el equipo ya inactivo, el bloque «Sin actividad» retrocedía hasta la última interacción
y se **solapaba** con bloques ya guardados de la sesión anterior (22:19:22–22:25:25 sobre 22:22:40–22:24:49).
Lo mismo podía pasar al despertar de una suspensión o tras terminar un descanso o pausa.
Corrección: el motor tiene un «piso» (fin del último bloque guardado, del último cierre o de la última lectura
antes de un hueco) y ningún bloque nuevo empieza antes. Cuatro pruebas nuevas lo cubren.

## Sin comprobar todavía

- La corrección del solapamiento no se ha vuelto a ver en la app real (solo en pruebas); requiere recompilar el release (~12 min).
- Una hora de uso continuo (AC-19 completo).
- Inactividad con umbral de 3 a 15 min configurado desde Ajustes, y apps ocultas, en la app real.
