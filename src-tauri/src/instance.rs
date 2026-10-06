//! Una sola instancia de Pulso por usuario. Dos instancias tendrían dos sensores escribiendo en la
//! misma base y crearían bloques solapados (visto en la prueba real del 2026-10-05).
//! Se usa un archivo con bloqueo exclusivo del sistema (`File::try_lock`): el sistema lo libera solo
//! cuando el proceso termina, aunque sea de golpe.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::{Path, PathBuf};

/// Ruta del archivo de bloqueo para un identificador de app (p. ej. "co.pulso.desktop").
pub fn lock_path(dir: &Path, identifier: &str) -> PathBuf {
  dir.join(format!("{identifier}.lock"))
}

/// Intenta ser la única instancia. `Ok(Some(file))`: lo somos y hay que conservar `file` vivo
/// mientras dure el proceso. `Ok(None)`: ya hay otra instancia abierta.
pub fn acquire(path: &Path) -> std::io::Result<Option<File>> {
  let file = OpenOptions::new().create(true).truncate(false).write(true).open(path)?;
  match file.try_lock() {
    Ok(()) => Ok(Some(file)),
    Err(TryLockError::WouldBlock) => Ok(None),
    Err(TryLockError::Error(e)) => Err(e),
  }
}

/// Avisa a la persona de que Pulso ya está abierto (la segunda instancia se cierra sin abrir ventana).
#[cfg(windows)]
pub fn notify_already_running() {
  use windows::Win32::UI::WindowsAndMessaging::{MB_ICONINFORMATION, MB_OK, MessageBoxW};
  use windows::core::w;
  // SAFETY: cuadro de mensaje modal sin ventana dueña; las cadenas son literales estáticos.
  unsafe {
    MessageBoxW(
      None,
      w!("Pulso ya está abierto. Búscalo en la barra de tareas."),
      w!("Pulso"),
      MB_OK | MB_ICONINFORMATION,
    );
  }
}

#[cfg(not(windows))]
pub fn notify_already_running() {}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn second_instance_is_rejected_until_the_first_ends() {
    let dir = std::env::temp_dir().join(format!("pulso-instance-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = lock_path(&dir, "co.pulso.test");

    let first = acquire(&path).unwrap();
    assert!(first.is_some(), "la primera instancia obtiene el bloqueo");
    assert!(acquire(&path).unwrap().is_none(), "la segunda ve que ya hay una abierta");

    drop(first); // la primera termina
    assert!(acquire(&path).unwrap().is_some(), "al cerrarse la primera, se puede volver a abrir");
    let _ = std::fs::remove_dir_all(&dir);
  }
}
