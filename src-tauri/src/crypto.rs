//! Cifrado de títulos de ventana con AES-256-GCM (D-05).
//! Formato del resultado: `nonce (12 bytes) || texto cifrado con etiqueta`.
//! Cada cifrado usa un nonce aleatorio nuevo. La clave la entrega `secrets`.

use aes_gcm::aead::{Aead, Generate, Key, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};

const NONCE_LEN: usize = 12;
pub const KEY_LEN: usize = 32;

pub struct TitleCipher {
  cipher: Aes256Gcm,
}

impl TitleCipher {
  pub fn new(key: &[u8; KEY_LEN]) -> Self {
    let key = Key::<Aes256Gcm>::try_from(&key[..]).expect("la clave mide 32 bytes");
    Self { cipher: Aes256Gcm::new(&key) }
  }

  /// Genera una clave aleatoria de 32 bytes.
  pub fn generate_key() -> [u8; KEY_LEN] {
    let key = Key::<Aes256Gcm>::generate();
    let mut out = [0u8; KEY_LEN];
    out.copy_from_slice(key.as_slice());
    out
  }

  pub fn encrypt(&self, plain: &str) -> Result<Vec<u8>, String> {
    let nonce = Nonce::generate();
    let ciphertext = self
      .cipher
      .encrypt(&nonce, plain.as_bytes())
      .map_err(|_| "no se pudo cifrar el título".to_string())?;
    let mut out = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    out.extend_from_slice(nonce.as_slice());
    out.extend_from_slice(&ciphertext);
    Ok(out)
  }

  pub fn decrypt(&self, data: &[u8]) -> Result<String, String> {
    if data.len() <= NONCE_LEN {
      return Err("dato cifrado demasiado corto".to_string());
    }
    let (nonce, ciphertext) = data.split_at(NONCE_LEN);
    let nonce = Nonce::try_from(nonce).map_err(|_| "nonce inválido".to_string())?;
    let plain = self
      .cipher
      .decrypt(&nonce, ciphertext)
      .map_err(|_| "no se pudo descifrar (clave distinta o dato alterado)".to_string())?;
    String::from_utf8(plain).map_err(|_| "el título descifrado no es texto válido".to_string())
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn roundtrip() {
    let c = TitleCipher::new(&TitleCipher::generate_key());
    let enc = c.encrypt("Correo de Cliente SA - Outlook").unwrap();
    assert_eq!(c.decrypt(&enc).unwrap(), "Correo de Cliente SA - Outlook");
  }

  #[test]
  fn ciphertext_does_not_contain_plaintext() {
    let c = TitleCipher::new(&TitleCipher::generate_key());
    let enc = c.encrypt("Presupuesto confidencial").unwrap();
    let hay = String::from_utf8_lossy(&enc).to_lowercase();
    assert!(!hay.contains("presupuesto"));
  }

  #[test]
  fn same_text_gives_different_ciphertext() {
    let c = TitleCipher::new(&TitleCipher::generate_key());
    assert_ne!(c.encrypt("a").unwrap(), c.encrypt("a").unwrap());
  }

  #[test]
  fn wrong_key_or_tampering_fails() {
    let a = TitleCipher::new(&TitleCipher::generate_key());
    let b = TitleCipher::new(&TitleCipher::generate_key());
    let mut enc = a.encrypt("x").unwrap();
    assert!(b.decrypt(&enc).is_err());
    let last = enc.len() - 1;
    enc[last] ^= 1;
    assert!(a.decrypt(&enc).is_err());
    assert!(a.decrypt(&[1, 2, 3]).is_err());
  }
}
