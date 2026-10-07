//! Sensor: lee cada 2 s la app activa, su título, el dominio del navegador y la inactividad.
//! No registra teclas ni pantalla (D-14): solo el nombre del proceso, el título, el dominio
//! del sitio (nunca la ruta ni la búsqueda, ADR-0009) y cuánto tiempo lleva el usuario sin interactuar.

pub mod engine;

#[cfg(windows)]
mod url;
#[cfg(windows)]
mod windows_impl;

/// Ventana en primer plano en un instante.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveWindow {
  /// Nombre del ejecutable sin ruta ni `.exe` (p. ej. "chrome").
  pub process: String,
  pub title: String,
  /// Dominio del sitio si la ventana es un navegador (p. ej. "perplexity.ai").
  pub domain: Option<String>,
}

/// Navegadores de los que se lee la barra de direcciones.
const BROWSERS: &[&str] = &["brave", "chrome", "msedge", "opera", "vivaldi", "firefox"];

pub fn is_browser(process: &str) -> bool {
  BROWSERS.iter().any(|b| process.eq_ignore_ascii_case(b))
}

/// Dominio de lo que hay en la barra de direcciones: sin esquema, `www.`, usuario, puerto, ruta,
/// consulta ni fragmento, y en minúsculas. `None` si no parece una dirección (p. ej. mientras se escribe
/// una búsqueda) o si es una página interna del navegador.
pub fn host_of(address: &str) -> Option<String> {
  let text = address.trim();
  if text.is_empty() || text.contains(char::is_whitespace) {
    return None;
  }
  let lower = text.to_lowercase();
  let rest = match lower.split_once("://") {
    Some((scheme, rest)) if scheme == "http" || scheme == "https" => rest,
    Some(_) => return None, // chrome://, edge://, about:, file:// …
    None if lower.starts_with("about:") => return None,
    None => lower.as_str(),
  };
  let authority = rest.split(['/', '?', '#']).next()?;
  let host_port = authority.rsplit('@').next()?;
  let host = host_port.split(':').next()?;
  let host = host.strip_prefix("www.").unwrap_or(host);
  let valid = host.len() <= 253
    && host.contains('.')
    && !host.starts_with('.')
    && !host.ends_with('.')
    && host.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-');
  valid.then(|| host.to_string())
}

/// Lector del sensor. En Windows guarda el cliente de UI Automation entre lecturas; vive en el
/// hilo del sensor.
pub struct Sensor {
  #[cfg(windows)]
  url: Option<url::UrlReader>,
}

impl Sensor {
  pub fn new() -> Self {
    Self {
      #[cfg(windows)]
      url: url::UrlReader::new(),
    }
  }

  /// Ventana activa con el dominio si es un navegador, o `None` si no hay ventana.
  pub fn read(&mut self) -> Option<ActiveWindow> {
    #[cfg(windows)]
    {
      let (hwnd, mut window) = windows_impl::foreground()?;
      if is_browser(&window.process)
        && let Some(reader) = self.url.as_mut()
      {
        window.domain = reader.read(hwnd).as_deref().and_then(host_of);
      }
      Some(window)
    }
    #[cfg(not(windows))]
    {
      None
    }
  }
}

impl Sensor {
  /// Solo para la prueba S-5: dominio de una ventana concreta (aunque no esté en primer plano).
  #[cfg(windows)]
  pub fn domain_of_window(&mut self, hwnd: isize) -> Option<String> {
    let hwnd = windows::Win32::Foundation::HWND(hwnd as *mut core::ffi::c_void);
    self.url.as_mut()?.read(hwnd).as_deref().and_then(host_of)
  }
}

impl Default for Sensor {
  fn default() -> Self {
    Self::new()
  }
}

/// Ventana activa sin dominio (prueba S-1). El sensor de la app usa `Sensor::read`.
#[cfg(windows)]
pub fn active_window() -> Option<ActiveWindow> {
  windows_impl::foreground().map(|(_, w)| w)
}

/// Nombre del ejecutable de un proceso (también lo usa la lista de apps abiertas, ADR-0010).
/// SAFETY: debe llamarse con un `pid` obtenido del sistema.
#[cfg(windows)]
pub(crate) unsafe fn process_name(pid: u32) -> Option<String> {
  // SAFETY: lo garantiza quien llama.
  unsafe { windows_impl::process_name(pid) }
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

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn host_of_keeps_only_the_domain() {
    let cases = [
      ("https://www.perplexity.ai/search?q=secreto", Some("perplexity.ai")),
      ("perplexity.ai/search/abc", Some("perplexity.ai")),
      ("http://user:clave@intranet.empresa.co:8080/ruta#x", Some("intranet.empresa.co")),
      ("https://Claude.AI/chat/123", Some("claude.ai")),
      ("gemini.google.com", Some("gemini.google.com")),
      ("chrome://settings", None),
      ("edge://newtab", None),
      ("about:blank", None),
      ("file:///C:/secreto.pdf", None),
      ("cómo hacer pan", None),
      ("localhost:1420", None),
      ("", None),
    ];
    for (input, expected) in cases {
      assert_eq!(host_of(input).as_deref(), expected, "{input}");
    }
  }

  #[test]
  fn browsers_are_recognized_by_process_name() {
    assert!(is_browser("brave"));
    assert!(is_browser("MSEdge"));
    assert!(!is_browser("code"));
  }
}
