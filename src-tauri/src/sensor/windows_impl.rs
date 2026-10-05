//! Lectura de ventana activa e inactividad con funciones de Win32 (crate `windows`).

use super::ActiveWindow;
use windows::Win32::Foundation::CloseHandle;
use windows::Win32::System::SystemInformation::GetTickCount64;
use windows::Win32::System::Threading::{
  OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
};
use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
use windows::Win32::UI::WindowsAndMessaging::{
  GetForegroundWindow, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId,
};
use windows::core::PWSTR;

pub fn active_window() -> Option<ActiveWindow> {
  // SAFETY: llamadas de solo lectura al sistema; los búferes viven durante cada llamada.
  unsafe {
    let hwnd = GetForegroundWindow();
    if hwnd.is_invalid() {
      return None;
    }

    let len = GetWindowTextLengthW(hwnd).max(0) as usize;
    let mut buf = vec![0u16; len + 1];
    let copied = GetWindowTextW(hwnd, &mut buf).max(0) as usize;
    let title = String::from_utf16_lossy(&buf[..copied]);

    let mut pid = 0u32;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == 0 {
      return None;
    }

    let process = process_name(pid)?;
    Some(ActiveWindow { process, title })
  }
}

/// SAFETY: debe llamarse con un `pid` obtenido del sistema.
unsafe fn process_name(pid: u32) -> Option<String> {
  unsafe {
    let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
    let mut buf = [0u16; 1024];
    let mut size = buf.len() as u32;
    let result =
      QueryFullProcessImageNameW(handle, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut size);
    let _ = CloseHandle(handle);
    result.ok()?;

    let path = String::from_utf16_lossy(&buf[..size as usize]);
    let file = path.rsplit(['\\', '/']).next()?;
    let stem = file.strip_suffix(".exe").or_else(|| file.strip_suffix(".EXE")).unwrap_or(file);
    Some(stem.to_string())
  }
}

pub fn idle_seconds() -> Option<u64> {
  // SAFETY: `info` es un LASTINPUTINFO válido con `cbSize` inicializado.
  unsafe {
    let mut info = LASTINPUTINFO { cbSize: size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
    if !GetLastInputInfo(&mut info).as_bool() {
      return None;
    }
    // `dwTime` es un contador de 32 bits que da la vuelta cada ~49 días.
    let now = GetTickCount64() as u32;
    Some(u64::from(now.wrapping_sub(info.dwTime)) / 1000)
  }
}
