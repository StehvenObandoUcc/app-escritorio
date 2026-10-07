//! Estado del sistema que la interfaz necesita para explicar los avisos (ADR-0011).

use serde::Serialize;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NotificationsStatus {
  /// `false` si Windows tiene apagado «Recibir notificaciones de apps y otros remitentes».
  pub windows_toasts_enabled: bool,
}

/// `ToastEnabled = 0` significa apagadas; si el valor no existe, Windows las tiene encendidas.
pub fn toasts_enabled_from(value: Option<u32>) -> bool {
  value != Some(0)
}

#[cfg(windows)]
pub fn notifications_status() -> NotificationsStatus {
  use windows::Win32::Foundation::ERROR_SUCCESS;
  use windows::Win32::System::Registry::{HKEY_CURRENT_USER, RRF_RT_REG_DWORD, RegGetValueW};
  use windows::core::w;

  let mut data = 0u32;
  let mut size = size_of::<u32>() as u32;
  // SAFETY: lectura de un DWORD a un búfer de 4 bytes que vive durante la llamada.
  let read = unsafe {
    RegGetValueW(
      HKEY_CURRENT_USER,
      w!(r"Software\Microsoft\Windows\CurrentVersion\PushNotifications"),
      w!("ToastEnabled"),
      RRF_RT_REG_DWORD,
      None,
      Some((&mut data as *mut u32).cast()),
      Some(&mut size),
    )
  };
  NotificationsStatus { windows_toasts_enabled: toasts_enabled_from((read == ERROR_SUCCESS).then_some(data)) }
}

#[cfg(not(windows))]
pub fn notifications_status() -> NotificationsStatus {
  NotificationsStatus { windows_toasts_enabled: true }
}

/// Sonido de aviso del sistema. Suena aunque las notificaciones de Windows estén apagadas.
#[cfg(windows)]
pub fn beep() {
  use windows::Win32::System::Diagnostics::Debug::MessageBeep;
  use windows::Win32::UI::WindowsAndMessaging::MB_ICONEXCLAMATION;
  // SAFETY: llamada sin punteros; si falla solo no suena.
  let _ = unsafe { MessageBeep(MB_ICONEXCLAMATION) };
}

#[cfg(not(windows))]
pub fn beep() {}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn toasts_are_off_only_when_windows_says_zero() {
    assert!(!toasts_enabled_from(Some(0)));
    assert!(toasts_enabled_from(Some(1)));
    assert!(toasts_enabled_from(None));
  }

  #[test]
  #[cfg(windows)]
  fn reading_the_real_setting_does_not_fail() {
    // En el equipo de desarrollo el valor existe o no; lo importante es que la lectura no rompe.
    let _ = notifications_status();
  }
}
