# ADR-0006 · Métrica de memoria del presupuesto de rendimiento

Fecha: 2026-10-05 · Estado: aceptado

## Contexto
`docs/ARQUITECTURA.md` §6 fija un presupuesto de RAM en reposo de menos de 120 MB, y AC-19 de la spec F1
pide «memoria total por debajo de 120 MB». No decía qué se suma ni cuándo se mide. En Windows, la app son
varios procesos: `pulso.exe` y los de WebView2 (seis en la medición del 2026-10-05). Con el conjunto de
trabajo (*working set*) esos procesos cuentan varias veces las mismas páginas compartidas: 395 MB. Con la
memoria privada: 83,5 MB (`docs/spikes/F1-medicion-app-real.md`).

## Decisión
La métrica oficial es la **memoria privada** (*working set* privado): la parte de memoria que ningún otro
proceso comparte.

- **Qué se suma:** el proceso de Pulso (`pulso.exe`) y todos los procesos hijos de WebView2 que Pulso lanza.
  Los de WebView2 se reconocen por llevar `co.pulso.desktop` (la carpeta de datos de la app) en su línea de
  comandos; no se cuentan los de otras aplicaciones.
- **Cuándo se mide:** después de 5 minutos en reposo (ventana abierta, sin interactuar).
- **Cómo:** el contador `WorkingSetPrivate` de `Win32_PerfFormattedData_PerfProc_Process` de cada proceso,
  sumado. Es el mismo valor que el Administrador de tareas muestra por proceso.
- **Meta:** menos de 120 MB.
- El conjunto de trabajo (*working set*) sumado se anota en los informes **solo como dato**; no es criterio.

## Consecuencias
- AC-19 y los informes de F1 y F6 usan esta métrica. Los scripts de medición guardan ambas cifras.
- La cifra puede variar con la versión de WebView2 instalada en el equipo; el informe anota la versión.
- No cambia el presupuesto (120 MB): se acota qué significa.
