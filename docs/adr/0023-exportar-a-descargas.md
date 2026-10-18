# ADR-0023 · Exportar mis datos a Descargas, sin argumento

Fecha: 2026-10-13 · Estado: aceptado (por StehvenObando).

## Contexto
- CU-07 (F5) pide que la persona se lleve sus datos locales. `docs/ARQUITECTURA.md` §6 decía `export_my_data(path)`: la interfaz tendría que elegir la ruta.
- No hay plugin de diálogo de archivos instalado y añadirlo exige un ADR y cambiar `capabilities/` (R1).
- F4 ya guarda sus archivos en Descargas sin diálogo.

## Decisión
- `export_my_data()` **sin argumento**: escribe `%USERPROFILE%\Downloads\pulso-mis-datos-AAAA-MM-DD.json` (fecha local) y devuelve la ruta completa. Si el archivo ya existe ese día, se sobrescribe.
- La lógica vive en una función interna que recibe el directorio, para probarla con una carpeta temporal; el comando solo le pasa Descargas.
- El JSON trae `blocks` (con el título descifrado: es de la propia persona y no sale a la red), `time_entries` y `closures`, solo de la cuenta activa y de todos sus equipos. Sin cuenta activa devuelve un error claro.
- Sin crates nuevos.

## Consecuencias
- La persona no elige dónde se guarda; la interfaz debe mostrar la ruta devuelta.
- El archivo contiene títulos de ventana en claro: la interfaz debe avisarlo antes de exportar.
- Se actualiza la fila de `export_my_data` en `docs/ARQUITECTURA.md` §6.
