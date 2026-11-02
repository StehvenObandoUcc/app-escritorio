# ADR-0024 · macOS y Linux (X11): sensor por sistema e instaladores en GitHub

Fecha: 2026-11-02 · Estado: propuesto (pendiente de aprobación de StehvenObando).

## Contexto
- TA-13 (F7) pide Pulso en macOS y Linux. La v1 era solo Windows (`docs/ARQUITECTURA.md` §1).
- El código ya aislaba Windows con `#[cfg(windows)]`: en otros sistemas el sensor devolvía `None` y Pulso no registraba nada.
- No hay equipos con macOS ni Linux: todo se verifica en los runners de GitHub Actions.
- Lo demás ya funciona fuera de Windows: `keyring` 4.2.0 (modo `v1`) trae el Llavero de macOS y Secret Service de Linux; `reqwest` con `native-tls` usa Security.framework en macOS y OpenSSL en Linux; el bloqueo de instancia usa `File::try_lock`.

## Decisión
- **Linux (X11)** · `src-tauri/src/sensor/linux_impl.rs`:
  - Ventana activa por EWMH: `_NET_ACTIVE_WINDOW` en la raíz; título de `_NET_WM_NAME` (UTF-8) o `WM_NAME`; proceso por `_NET_WM_PID` → `/proc/<pid>/comm` (hasta 15 caracteres, sin ruta).
  - Inactividad con la extensión MIT-SCREEN-SAVER (`XScreenSaverQueryInfo`, campo `idle`).
  - Crate **`x11-dl` 2.21.0**, que ya estaba en `Cargo.lock` (lo trae GTK). Carga libX11 y libXss al vuelo: el binario no enlaza con X, arranca igual en Wayland y, si falta libXss, solo se pierde la inactividad. Se descartó `x11rb` (puro Rust, mejor manejo de errores) porque añadía 3–4 crates nuevos al árbol.
  - Xlib termina el proceso ante un error del servidor (p. ej. `BadWindow` si la ventana se cierra entre dos lecturas). Se instala un manejador que ignora solo los errores de **nuestra** conexión y pasa los demás al manejador anterior (el de GTK).
  - Sin `DISPLAY` (Wayland sin XWayland) todo devuelve `None` sin fallar.
  - Paquetes: el `.deb` depende de `libxss1` y el `.rpm` de `libXScrnSaver`.
- **macOS** · `src-tauri/src/sensor/macos_impl.rs`:
  - App en primer plano: dueña de la primera ventana de capa 0 en `CGWindowListCopyWindowInfo` (ventanas visibles, sin escritorio, de delante hacia atrás). El proceso es `kCGWindowOwnerName` (el nombre de la app, p. ej. «Google Chrome»; las reglas buscan por «contiene» y en minúsculas). Se evita `NSWorkspace` para no depender del hilo principal ni de AppKit.
  - Título: `kCGWindowName`, vacío si Pulso no tiene el permiso «Grabación de pantalla».
  - Inactividad: `CGEventSourceSecondsSinceLastEventType(CombinedSessionState, kCGAnyInputEventType)`.
  - Crates **`objc2-core-graphics` 0.3.2** y **`objc2-core-foundation` 0.3.2**, ya en `Cargo.lock` (los trae Tauri), como dependencias solo de macOS y sin *features* por defecto.
- **Dominio del navegador:** solo en Windows (UI Automation). En macOS y Linux `domain` es siempre `None`; los avisos de sitio no permitido no saltan allí.
- **Exportar mis datos** (ADR-0023): en macOS y Linux la carpeta es `$HOME/Downloads`.
- **Textos:** «notificaciones de Windows» y «almacén seguro de Windows» pasan a «del sistema» donde aplica a todos.
- **CI:** jobs «Núcleo Rust (Linux)» (ubuntu-22.04; pruebas dentro de `xvfb-run` con openbox y una xterm activa) y «Núcleo Rust (macOS)».
- **Publicación:** `.github/workflows/release.yml` con `tauri-apps/tauri-action` v0.6.2 al subir una etiqueta `v*` (o a mano). Crea un **borrador** «Pulso vX.Y.Z» con el instalador de Windows (NSIS/MSI), el `.dmg` universal (Apple Silicon e Intel) y `.deb`/`.rpm`/`.AppImage`. Las variables `VITE_*` salen de los secretos del repositorio.

## Consecuencias
- Limitaciones aceptadas: sin dominio del navegador fuera de Windows; Wayland no soportado (en XWayland solo se ven las apps X11); título vacío en macOS sin «Grabación de pantalla»; instaladores sin firma (macOS pide «Abrir» con clic derecho o `xattr -cr`).
- `/proc/<pid>/comm` corta los nombres largos a 15 caracteres (p. ej. `gnome-terminal-`); las reglas por «contiene» siguen funcionando.
- Lo que se comprueba en CI: en Linux, que la inactividad responde bajo Xvfb y que el sensor ve la xterm activa (proceso `xterm`, sin dominio); en macOS, que la inactividad responde y que leer la ventana no falla. No se prueba a mano en un equipo real.
- La segunda instancia en macOS y Linux se cierra sin mensaje (el aviso es un cuadro de Windows).
