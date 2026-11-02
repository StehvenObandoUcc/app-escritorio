//! Ventana activa e inactividad en macOS con Core Graphics (ADR-0024).
//! La app en primer plano es la dueña de la primera ventana normal (capa 0) de la lista de ventanas
//! visibles, que va de delante hacia atrás. Así no se usa AppKit, que pide el hilo principal.
//! El título (`kCGWindowName`) llega vacío si Pulso no tiene el permiso «Grabación de pantalla».

use super::ActiveWindow;
use objc2_core_foundation::{CFDictionary, CFNumber, CFString, CFType};
use objc2_core_graphics::{
  CGEventSource, CGEventSourceStateID, CGEventType, CGWindowListCopyWindowInfo, CGWindowListOption, kCGNullWindowID,
  kCGWindowLayer, kCGWindowName, kCGWindowOwnerName,
};

/// `kCGAnyInputEventType`: cualquier evento de teclado, ratón o trackpad.
const ANY_INPUT: CGEventType = CGEventType(u32::MAX);

/// Valor de una clave del diccionario de una ventana, si existe.
fn value<'a>(info: &'a CFDictionary, key: &CFString) -> Option<&'a CFType> {
  // SAFETY: la clave es un CFString válido; el valor vive mientras el diccionario.
  unsafe { info.value((key as *const CFString).cast()).cast::<CFType>().as_ref() }
}

fn text(info: &CFDictionary, key: &CFString) -> Option<String> {
  value(info, key)?.downcast_ref::<CFString>().map(|s| s.to_string())
}

pub fn foreground() -> Option<ActiveWindow> {
  let options = CGWindowListOption::OptionOnScreenOnly | CGWindowListOption::ExcludeDesktopElements;
  let windows = CGWindowListCopyWindowInfo(options, kCGNullWindowID)?;
  // SAFETY: las claves son constantes de Core Graphics que viven todo el proceso.
  let (layer_key, owner_key, name_key) = unsafe { (kCGWindowLayer, kCGWindowOwnerName, kCGWindowName) };
  (0..windows.count()).find_map(|i| {
    // SAFETY: índice dentro del rango; cada elemento es un CFDictionary que vive mientras `windows`.
    let info = unsafe { windows.value_at_index(i).cast::<CFDictionary>().as_ref() }?;
    let layer = value(info, layer_key)?.downcast_ref::<CFNumber>()?.as_i32()?;
    let process = text(info, owner_key).filter(|p| layer == 0 && !p.is_empty())?;
    let title = text(info, name_key).unwrap_or_default();
    Some(ActiveWindow { process, title, domain: None })
  })
}

pub fn idle_seconds() -> Option<u64> {
  let seconds = CGEventSource::seconds_since_last_event_type(CGEventSourceStateID::CombinedSessionState, ANY_INPUT);
  (seconds.is_finite() && seconds >= 0.0).then_some(seconds as u64)
}

#[cfg(test)]
mod tests {
  /// En CI (macos-latest) hay sesión gráfica: la inactividad responde y leer la ventana no rompe.
  /// El contenido de la ventana no se comprueba: depende de lo que tenga delante el runner.
  #[test]
  fn reads_the_session() {
    assert!(crate::sensor::idle_seconds().is_some(), "Core Graphics responde");
    if let Some(window) = crate::sensor::Sensor::new().read() {
      assert!(!window.process.is_empty());
      assert_eq!(window.domain, None);
    }
  }
}
