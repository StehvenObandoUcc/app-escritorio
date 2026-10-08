//! Enlaces externos (ADR-0017): solo se abren direcciones `https://` en el navegador del sistema.
//! La interfaz no tiene permisos del plugin opener; todo pasa por aquí.

/// Largo máximo de un enlace (igual que en la base: `links` hasta 2000 caracteres).
const MAX_URL: usize = 2000;

/// `Ok` si la dirección es `https://` con un servidor y sin espacios ni caracteres de control.
pub fn check_https(url: &str) -> Result<(), String> {
  let rest = url.strip_prefix("https://").ok_or("Solo se abren enlaces https://.")?;
  let host = rest.split(['/', '?', '#']).next().unwrap_or_default();
  if url.len() > MAX_URL || host.is_empty() || url.chars().any(|c| c.is_whitespace() || c.is_control()) {
    return Err("El enlace no es válido.".into());
  }
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn only_https_links_with_a_host_are_opened() {
    assert!(check_https("https://docs.ejemplo.com/informe?x=1").is_ok());
    for bad in ["http://ejemplo.com", "file:///C:/Windows/system32", "javascript:alert(1)", "https://", "https:// ejemplo.com", "ms-settings:"] {
      assert!(check_https(bad).is_err(), "{bad}");
    }
    assert!(check_https(&format!("https://a.com/{}", "x".repeat(MAX_URL))).is_err());
  }
}
