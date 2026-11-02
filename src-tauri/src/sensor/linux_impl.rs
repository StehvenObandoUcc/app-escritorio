//! Ventana activa e inactividad en Linux con X11 (ADR-0024): la ventana activa sale de EWMH
//! (`_NET_ACTIVE_WINDOW`, `_NET_WM_NAME`, `_NET_WM_PID`) y la inactividad de la extensión MIT-SCREEN-SAVER.
//! Las librerías de X se cargan al vuelo (crate `x11-dl`): sin sesión X (Wayland sin XWayland) o sin
//! libXss todo devuelve `None` y Pulso sigue funcionando.

use super::ActiveWindow;
use std::ffi::{CStr, c_int, c_long, c_uchar, c_ulong};
use std::ptr;
use std::sync::atomic::{AtomicPtr, Ordering};
use std::sync::{Mutex, Once, OnceLock};
use x11_dl::xlib::{self, Display, XErrorEvent, Xlib};
use x11_dl::xss::{XScreenSaverInfo, Xss};

/// Máximo de unidades de 32 bits que se leen de una propiedad (títulos largos se recortan).
const MAX_LONGS: c_long = 1024;

type ErrorHandler = unsafe extern "C" fn(*mut Display, *mut XErrorEvent) -> c_int;

/// Conexión propia con el servidor X. Se abre la primera vez que se necesita y vive mientras el proceso.
struct Connection {
  xlib: Xlib,
  /// `None` si libXss no está instalada: entonces no hay inactividad.
  xss: Option<Xss>,
  display: *mut Display,
  root: xlib::Window,
  net_active_window: xlib::Atom,
  net_wm_name: xlib::Atom,
  net_wm_pid: xlib::Atom,
  utf8_string: xlib::Atom,
}

// SAFETY: la conexión solo se usa con el candado `CONNECTION` tomado, nunca desde dos hilos a la vez.
unsafe impl Send for Connection {}

static CONNECTION: Mutex<Option<Connection>> = Mutex::new(None);
/// Nuestra conexión, para reconocer sus errores en `ignore_own_errors`.
static OWN_DISPLAY: AtomicPtr<Display> = AtomicPtr::new(ptr::null_mut());
static PREVIOUS_HANDLER: OnceLock<Option<ErrorHandler>> = OnceLock::new();
static INSTALL_HANDLER: Once = Once::new();

/// El manejador de errores por defecto de Xlib termina el proceso. Una ventana que se cierra entre dos
/// lecturas produce `BadWindow` en nuestra conexión: esos errores se ignoran (la lectura devuelve `None`).
/// Los de otras conexiones (p. ej. la de GTK) siguen yendo al manejador que había antes.
unsafe extern "C" fn ignore_own_errors(display: *mut Display, event: *mut XErrorEvent) -> c_int {
  if display == OWN_DISPLAY.load(Ordering::Relaxed) {
    return 0;
  }
  match PREVIOUS_HANDLER.get().copied().flatten() {
    // SAFETY: es el manejador que había antes, llamado con los mismos argumentos que recibimos.
    Some(previous) => unsafe { previous(display, event) },
    None => 0,
  }
}

fn is_wayland() -> bool {
  std::env::var_os("WAYLAND_DISPLAY").is_some()
    || std::env::var("XDG_SESSION_TYPE").is_ok_and(|v| v.eq_ignore_ascii_case("wayland"))
}

impl Connection {
  fn open() -> Option<Self> {
    // Sin DISPLAY no hay sesión X: ni siquiera se carga libX11.
    std::env::var_os("DISPLAY")?;
    // En Wayland, XWayland solo ve las apps X11 y su contador de inactividad no cuenta la entrada a las apps
    // nativas: se registraría «sin actividad» a quien trabaja. Mejor no registrar (ADR-0024).
    if is_wayland() {
      return None;
    }
    let xlib = Xlib::open().ok()?;
    // SAFETY: funciones de Xlib cargadas arriba; `display` se comprueba antes de usarla y las cadenas
    // son literales terminados en cero.
    unsafe {
      let display = (xlib.XOpenDisplay)(ptr::null());
      if display.is_null() {
        return None;
      }
      OWN_DISPLAY.store(display, Ordering::Relaxed);
      INSTALL_HANDLER.call_once(|| {
        let _ = PREVIOUS_HANDLER.set((xlib.XSetErrorHandler)(Some(ignore_own_errors)));
      });
      let atom = |name: &CStr| (xlib.XInternAtom)(display, name.as_ptr(), xlib::False);
      let net_active_window = atom(c"_NET_ACTIVE_WINDOW");
      let net_wm_name = atom(c"_NET_WM_NAME");
      let net_wm_pid = atom(c"_NET_WM_PID");
      let utf8_string = atom(c"UTF8_STRING");
      let root = (xlib.XDefaultRootWindow)(display);
      Some(Self { xss: Xss::open().ok(), xlib, display, root, net_active_window, net_wm_name, net_wm_pid, utf8_string })
    }
  }

  /// Lee una propiedad de `window` y la pasa a `read` como (datos, elementos, formato).
  fn property<T>(
    &self,
    window: xlib::Window,
    name: xlib::Atom,
    kind: xlib::Atom,
    read: impl FnOnce(*const c_uchar, usize, c_int) -> Option<T>,
  ) -> Option<T> {
    let (mut actual_type, mut format, mut items, mut after) = (0, 0, 0, 0);
    let mut data: *mut c_uchar = ptr::null_mut();
    // SAFETY: todos los punteros de salida apuntan a variables locales; `data` lo reserva Xlib y se
    // libera con XFree después de copiarlo en `read`.
    unsafe {
      let status = (self.xlib.XGetWindowProperty)(
        self.display,
        window,
        name,
        0,
        MAX_LONGS,
        xlib::False,
        kind,
        &mut actual_type,
        &mut format,
        &mut items,
        &mut after,
        &mut data,
      );
      if data.is_null() {
        return None;
      }
      let value = if status == c_int::from(xlib::Success) && items > 0 { read(data, items as usize, format) } else { None };
      (self.xlib.XFree)(data.cast());
      value
    }
  }

  /// Primer valor de una propiedad de 32 bits (Xlib la entrega como `c_ulong`).
  fn property_u32(&self, window: xlib::Window, name: xlib::Atom, kind: xlib::Atom) -> Option<c_ulong> {
    // SAFETY: con formato 32 y al menos un elemento, `data` apunta a un `c_ulong`.
    self.property(window, name, kind, |data, _, format| (format == 32).then(|| unsafe { *data.cast::<c_ulong>() }))
  }

  fn property_text(&self, window: xlib::Window, name: xlib::Atom, kind: xlib::Atom) -> Option<String> {
    self.property(window, name, kind, |data, items, format| {
      // SAFETY: con formato 8, `data` tiene `items` bytes.
      let bytes = unsafe { std::slice::from_raw_parts(data, items) };
      (format == 8).then(|| String::from_utf8_lossy(bytes).into_owned())
    })
  }

  fn foreground(&self) -> Option<ActiveWindow> {
    let window = self.property_u32(self.root, self.net_active_window, xlib::XA_WINDOW).filter(|w| *w != 0)?;
    let pid = self.property_u32(window, self.net_wm_pid, xlib::XA_CARDINAL).filter(|p| *p != 0)?;
    let process = process_name(u32::try_from(pid).ok()?)?;
    let title = self
      .property_text(window, self.net_wm_name, self.utf8_string)
      .or_else(|| self.property_text(window, xlib::XA_WM_NAME, xlib::AnyPropertyType as xlib::Atom))
      .unwrap_or_default();
    Some(ActiveWindow { process, title, domain: None })
  }

  // `c_ulong` es u64 en 64 bits (la conversión sobra ahí) y u32 en 32 bits.
  #[allow(clippy::useless_conversion)]
  fn idle_seconds(&self) -> Option<u64> {
    let xss = self.xss.as_ref()?;
    // SAFETY: `info` es un XScreenSaverInfo local que la llamada rellena.
    unsafe {
      let mut info: XScreenSaverInfo = std::mem::zeroed();
      if (xss.XScreenSaverQueryInfo)(self.display, self.root, &mut info) == 0 {
        return None;
      }
      Some(u64::from(info.idle) / 1000)
    }
  }
}

/// Usa la conexión (abriéndola si hace falta). Si no se puede abrir, se reintenta en la próxima lectura.
fn with_connection<T>(f: impl FnOnce(&Connection) -> Option<T>) -> Option<T> {
  let mut guard = CONNECTION.lock().ok()?;
  if guard.is_none() {
    *guard = Connection::open();
  }
  f(guard.as_ref()?)
}

/// Nombre del proceso como lo ve el sistema (`/proc/<pid>/comm`, hasta 15 caracteres), p. ej. "firefox".
fn process_name(pid: u32) -> Option<String> {
  let name = std::fs::read_to_string(format!("/proc/{pid}/comm")).ok()?;
  let name = name.trim();
  (!name.is_empty()).then(|| name.to_string())
}

pub fn foreground() -> Option<ActiveWindow> {
  with_connection(Connection::foreground)
}

pub fn idle_seconds() -> Option<u64> {
  with_connection(Connection::idle_seconds)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn own_process_name_is_read_from_proc() {
    let name = process_name(std::process::id()).expect("nombre del proceso de pruebas");
    assert!(!name.is_empty());
  }

  /// Con sesión X (en CI: `xvfb-run` con openbox y una xterm) lee la inactividad y la ventana activa.
  /// Sin DISPLAY no comprueba nada más que no romper. `PULSO_SENSOR_EXPECT` (opcional) es el proceso
  /// que debe estar en primer plano.
  #[test]
  fn reads_the_x11_session() {
    let window = crate::sensor::Sensor::new().read();
    if std::env::var_os("DISPLAY").is_none() {
      assert_eq!(window, None);
      assert_eq!(crate::sensor::idle_seconds(), None);
      return;
    }
    assert!(crate::sensor::idle_seconds().is_some(), "MIT-SCREEN-SAVER responde");
    if let Some(expected) = std::env::var("PULSO_SENSOR_EXPECT").ok().filter(|e| !e.is_empty()) {
      // El gestor de ventanas puede tardar en activar la ventana: se reintenta unos segundos.
      let mut seen = window;
      for _ in 0..10 {
        if seen.as_ref().is_some_and(|w| w.process == expected) {
          break;
        }
        std::thread::sleep(std::time::Duration::from_millis(500));
        seen = crate::sensor::Sensor::new().read();
      }
      let seen = seen.expect("hay ventana activa");
      assert_eq!(seen.process, expected);
      assert_eq!(seen.domain, None);
    }
  }
}
