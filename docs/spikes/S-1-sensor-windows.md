# S-1 · Sensor en Windows

**Pregunta.** ¿Cómo se leen la ventana activa, su título y la inactividad en Windows?

**Qué se probó.** `src-tauri/examples/s1_sensor.rs` llama a `pulso_lib::sensor` cada 2 s durante 30 s
(`cargo run --manifest-path src-tauri/Cargo.toml --example s1_sensor`). El ejemplo se retiró tras la prueba; está en el historial de git.

**Resultado (Windows 11, compilación de desarrollo).**
- Lee proceso, título e inactividad correctamente (proceso: `WindowsTerminal`, título de la ventana, inactividad 0 s con uso activo).
- Lectura más lenta: 646 µs. Con una lectura cada 2 s el costo de CPU es despreciable.

**Decisión.** Crate `windows` 0.62.2 con las funciones `GetForegroundWindow`, `GetWindowTextW`,
`GetWindowThreadProcessId`, `QueryFullProcessImageNameW` y `GetLastInputInfo`. No hace falta otra librería.
Firmas comprobadas en el código fuente del crate instalado (regla R2).

**Pendiente.**
- No se probó con la inactividad real (5 min) ni con ventanas elevadas: `OpenProcess` puede fallar y
  entonces se devuelve `None`; el sensor deberá tratarlo como "sin dato" y no como bloque.
- La medición de RAM y CPU en una hora (AC-19) se hace con el sensor completo, no aquí.
