//! Sensor: lee cada 2 s la app activa, su título y la inactividad.
//! No registra teclas ni pantalla (D-14): solo el nombre del proceso, el título y cuánto
//! tiempo lleva el usuario sin interactuar.

pub mod engine;

#[cfg(windows)]
mod windows_impl;

/// Ventana en primer plano en un instante.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveWindow {
  /// Nombre del ejecutable sin ruta ni `.exe` (p. ej. "chrome").
  pub process: String,
  pub title: String,
}

/// Ventana activa, o `None` si no hay ninguna (escritorio bloqueado, cambio de ventana).
#[cfg(windows)]
pub fn active_window() -> Option<ActiveWindow> {
  windows_impl::active_window()
}

/// Segundos desde la última interacción con teclado o ratón.
#[cfg(windows)]
pub fn idle_seconds() -> Option<u64> {
  windows_impl::idle_seconds()
}

#[cfg(not(windows))]
pub fn active_window() -> Option<ActiveWindow> {
  None
}

#[cfg(not(windows))]
pub fn idle_seconds() -> Option<u64> {
  None
}
