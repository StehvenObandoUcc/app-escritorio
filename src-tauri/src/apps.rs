//! Apps instaladas y abiertas, para elegir cuáles ocultar (ADR-0010).
//! Se leen del registro de Windows y de las ventanas visibles. La lista nunca sale del equipo.

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppEntry {
  /// Nombre del ejecutable sin `.exe`, en minúsculas (lo que guarda la lista de apps ocultas).
  pub process: String,
  /// Nombre legible (p. ej. «Google Chrome»).
  pub label: String,
  /// `open`: tiene una ventana abierta ahora · `installed`: aparece en el registro.
  pub source: &'static str,
}

/// Nombre del ejecutable de una ruta o línea de icono del registro:
/// `"C:\Program Files\App\app.exe",0` → `app`. `None` si no apunta a un `.exe`.
pub fn exe_stem(raw: &str) -> Option<String> {
  let lower = raw.trim().to_lowercase();
  let end = lower.find(".exe")?;
  let path = lower[..end].trim_matches('"');
  let file = path.rsplit(['\\', '/']).next()?.trim();
  (!file.is_empty()).then(|| file.to_string())
}

/// Instaladores, desinstaladores y procesos auxiliares que no tiene sentido ocultar.
pub fn is_noise(process: &str) -> bool {
  const NOISE: &[&str] = &[
    "unins", "uninst", "uninstall", "setup", "install", "update", "updater", "helper", "crashpad", "crashhandler",
    "elevation", "notification_helper", "msiexec", "rundll32", "applicationframehost", "textinputhost", "shellexperiencehost",
    "searchhost", "startmenuexperiencehost", "systemsettings", "pulso", "webview2", "askpass", "ssh-proxy", "cmmgr32",
    "rtkuwp",
  ];
  let p = process.to_lowercase();
  NOISE.iter().any(|n| p.contains(n))
}

/// Une las listas: una entrada por proceso; si está abierta se marca `open`, y el nombre legible
/// del registro gana al nombre de proceso.
pub fn merge(entries: impl IntoIterator<Item = AppEntry>) -> Vec<AppEntry> {
  let mut map: BTreeMap<String, AppEntry> = BTreeMap::new();
  for e in entries {
    if e.process.is_empty() || is_noise(&e.process) {
      continue;
    }
    map
      .entry(e.process.clone())
      .and_modify(|cur| {
        if e.source == "open" {
          cur.source = "open";
        }
        if e.source == "installed" && cur.label.eq_ignore_ascii_case(&cur.process) {
          cur.label = e.label.clone();
        }
      })
      .or_insert(e);
  }
  let mut out: Vec<AppEntry> = map.into_values().collect();
  out.sort_by_key(|e| e.label.to_lowercase());
  out
}

#[cfg(windows)]
pub fn installed_apps() -> Vec<AppEntry> {
  let mut all = registry::installed();
  all.extend(open_windows());
  merge(all)
}

#[cfg(not(windows))]
pub fn installed_apps() -> Vec<AppEntry> {
  Vec::new()
}

/// Procesos con una ventana visible y con título en este momento.
#[cfg(windows)]
fn open_windows() -> Vec<AppEntry> {
  use windows::Win32::Foundation::{HWND, LPARAM};
  use windows::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible};
  use windows::core::BOOL;

  unsafe extern "system" fn collect(hwnd: HWND, data: LPARAM) -> BOOL {
    // SAFETY: `data` es el puntero al Vec que vive durante toda la llamada a EnumWindows.
    unsafe {
      let pids = &mut *(data.0 as *mut Vec<u32>);
      if IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid != 0 && !pids.contains(&pid) {
          pids.push(pid);
        }
      }
    }
    BOOL(1)
  }

  let mut pids: Vec<u32> = Vec::new();
  // SAFETY: la función de retorno solo escribe en `pids`, que sigue vivo hasta que EnumWindows termina.
  let _ = unsafe { EnumWindows(Some(collect), LPARAM(&mut pids as *mut Vec<u32> as isize)) };
  pids
    .into_iter()
    // SAFETY: los pid vienen del sistema.
    .filter_map(|pid| unsafe { crate::sensor::process_name(pid) })
    .map(|name| AppEntry { process: name.to_lowercase(), label: name, source: "open" })
    .collect()
}

#[cfg(windows)]
mod registry {
  use super::{AppEntry, exe_stem};
  use windows::Win32::Foundation::ERROR_SUCCESS;
  use windows::Win32::System::Registry::{
    HKEY, HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_SZ, RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW,
  };
  use windows::core::{HSTRING, PWSTR};

  const UNINSTALL: &[&str] = &[
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall",
    r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall",
  ];
  const APP_PATHS: &str = r"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths";

  pub fn installed() -> Vec<AppEntry> {
    let mut out = Vec::new();
    for root in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
      for path in UNINSTALL {
        for sub in subkeys(root, path) {
          let key = format!(r"{path}\{sub}");
          let (Some(name), Some(icon)) = (read(root, &key, "DisplayName"), read(root, &key, "DisplayIcon")) else { continue };
          if let Some(process) = exe_stem(&icon) {
            out.push(AppEntry { process, label: name, source: "installed" });
          }
        }
      }
      for sub in subkeys(root, APP_PATHS) {
        if let Some(process) = exe_stem(&sub) {
          out.push(AppEntry { label: process.clone(), process, source: "installed" });
        }
      }
    }
    out
  }

  /// Nombres de las subclaves de `path`.
  fn subkeys(root: HKEY, path: &str) -> Vec<String> {
    let mut names = Vec::new();
    let mut key = HKEY::default();
    // SAFETY: abre una clave para lectura y la cierra al final; los búferes viven durante cada llamada.
    unsafe {
      if RegOpenKeyExW(root, &HSTRING::from(path), None, KEY_READ, &mut key) != ERROR_SUCCESS {
        return names;
      }
      let mut buf = [0u16; 512];
      for index in 0.. {
        let mut len = buf.len() as u32;
        if RegEnumKeyExW(key, index, Some(PWSTR(buf.as_mut_ptr())), &mut len, None, None, None, None) != ERROR_SUCCESS {
          break;
        }
        names.push(String::from_utf16_lossy(&buf[..len as usize]));
      }
      let _ = RegCloseKey(key);
    }
    names
  }

  /// Valor de texto de una clave (los REG_EXPAND_SZ llegan ya expandidos).
  fn read(root: HKEY, key: &str, value: &str) -> Option<String> {
    let (key, value) = (HSTRING::from(key), HSTRING::from(value));
    let mut size = 0u32;
    // SAFETY: primero se pide el tamaño y luego se llena un búfer de ese tamaño.
    unsafe {
      if RegGetValueW(root, &key, &value, RRF_RT_REG_SZ, None, None, Some(&mut size)) != ERROR_SUCCESS || size == 0 {
        return None;
      }
      let mut buf = vec![0u16; (size as usize).div_ceil(2)];
      if RegGetValueW(root, &key, &value, RRF_RT_REG_SZ, None, Some(buf.as_mut_ptr().cast()), Some(&mut size)) != ERROR_SUCCESS {
        return None;
      }
      let text = String::from_utf16_lossy(&buf);
      let text = text.trim_end_matches('\0').trim().to_string();
      (!text.is_empty()).then_some(text)
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn exe_stem_reads_registry_icons_and_app_paths() {
    assert_eq!(exe_stem(r#""C:\Program Files\Google\Chrome\Application\chrome.exe",0"#).as_deref(), Some("chrome"));
    assert_eq!(exe_stem(r"C:\Users\x\AppData\Local\Programs\Microsoft VS Code\Code.exe").as_deref(), Some("code"));
    assert_eq!(exe_stem("WINWORD.EXE").as_deref(), Some("winword"));
    assert_eq!(exe_stem(r"C:\Windows\system32\shell32.dll,-16").as_deref(), None);
    assert_eq!(exe_stem("").as_deref(), None);
  }

  #[test]
  fn merge_dedupes_marks_open_and_prefers_readable_names() {
    let list = merge([
      AppEntry { process: "chrome".into(), label: "chrome".into(), source: "open" },
      AppEntry { process: "chrome".into(), label: "Google Chrome".into(), source: "installed" },
      AppEntry { process: "unins000".into(), label: "Desinstalar".into(), source: "installed" },
      AppEntry { process: "code".into(), label: "Visual Studio Code".into(), source: "installed" },
    ]);
    assert_eq!(list.len(), 2);
    assert_eq!(list[0], AppEntry { process: "chrome".into(), label: "Google Chrome".into(), source: "open" });
    assert_eq!(list[1].label, "Visual Studio Code");
  }
}
