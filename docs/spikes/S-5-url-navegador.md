# S-5 · Dominio del sitio desde la barra de direcciones

**Pregunta.** ¿Se puede leer el dominio del sitio que se ve en el navegador cada 2 s sin pasar el
presupuesto de CPU (<1 %) ni de memoria (<120 MB, ADR-0006)?

**Cómo se lee.** UI Automation de Windows (crate `windows` ya aprobado, *features* `Win32_UI_Accessibility`,
`Win32_System_Com`, `Win32_System_Variant` y `Win32_System_Ole`):
- `CoInitializeEx(MTA)` en el hilo del sensor y `CoCreateInstance(CUIAutomation)`.
- `ElementFromHandle(hwnd)` y luego `FindFirst(TreeScope_Descendants, ControlType = Edit)`: es la barra de direcciones.
- `GetCurrentPropertyValue(UIA_ValueValuePropertyId)` da el texto. `host_of` (en `sensor/mod.rs`) deja solo el dominio.
- El elemento se guarda en caché por ventana: buscarlo es lo caro.

**Qué se probó.** `src-tauri/examples/s5_url.rs`, compilado en *release*, leyendo cada 2 s durante 120 s la
ventana de Brave abierta, sin traerla al frente. Antes, 120 s de referencia sin leer. Medición con
`TotalProcessorTime` (script de PowerShell en el informe de la sesión). Windows 11, 8 núcleos, 6 de octubre de 2026.

**Resultado.**

| Medida | Valor |
|---|---|
| Lecturas con dominio | 60 de 60 |
| Tiempo por lectura | mediana 1,0 ms · p95 7,2 ms · máximo 85 ms (la primera, que busca la barra) |
| CPU del lector | 0,02 % (0,23 s en 120 s) |
| Memoria del lector | 14 MB |
| CPU de Brave sin leer / leyendo | 5,8 % / 4,6 %: sin aumento (la diferencia es el uso normal del navegador) |

**Decisión.** Se adopta. Cumple el presupuesto con mucho margen. Solo se guarda el dominio; la URL completa
no sale de la función de lectura (ADR-0009).

**Pendiente.**
- Medido solo con Brave (Chromium). Chrome, Edge, Opera y Vivaldi comparten el mismo control; **Firefox no se midió**.
- Mientras se escribe en la barra, el texto no es una dirección: `host_of` devuelve `None` y el bloque queda sin dominio.
- La memoria total de la app con el lector se vuelve a medir en F6 (ADR-0006).
