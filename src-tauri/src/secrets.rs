//! Secretos en el almacén seguro del sistema (Credential Manager en Windows).
//! La clave de cifrado se crea en el primer arranque y nunca se guarda en un archivo (AC-10).

use crate::crypto::{KEY_LEN, TitleCipher};
use keyring::Entry;

const SERVICE: &str = "pulso";
const TITLE_KEY_USER: &str = "title-key";

/// Devuelve la clave de cifrado de títulos; la crea si no existe.
pub fn title_key() -> Result<[u8; KEY_LEN], String> {
  let entry = Entry::new(SERVICE, TITLE_KEY_USER).map_err(|e| format!("almacén seguro: {e}"))?;
  match entry.get_secret() {
    Ok(bytes) => <[u8; KEY_LEN]>::try_from(bytes.as_slice())
      .map_err(|_| "la clave guardada tiene un tamaño inválido".to_string()),
    Err(keyring::Error::NoEntry) => {
      let key = TitleCipher::generate_key();
      entry.set_secret(&key).map_err(|e| format!("almacén seguro: {e}"))?;
      Ok(key)
    }
    Err(e) => Err(format!("almacén seguro: {e}")),
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  /// Usa el almacén real del sistema: crea la clave si falta y comprueba que es estable.
  #[test]
  #[cfg(windows)]
  fn key_is_created_once_and_reused() {
    let first = title_key().expect("crear o leer la clave");
    let second = title_key().expect("releer la clave");
    assert_eq!(first, second);
  }
}
