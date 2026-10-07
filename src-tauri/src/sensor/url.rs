//! Lectura de la barra de direcciones del navegador con UI Automation (ADR-0009).
//! Solo se usa para sacar el **dominio**; la URL completa no sale de esta función.
//! Los objetos COM viven en el hilo del sensor, que es el único que llama a `read`.

use windows::Win32::Foundation::HWND;
use windows::Win32::System::Com::{CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx};
use windows::Win32::System::Variant::VARIANT;
use windows::Win32::UI::Accessibility::{
  CUIAutomation, IUIAutomation, IUIAutomationCondition, IUIAutomationElement, TreeScope_Descendants,
  UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_ValueValuePropertyId,
};
use windows::core::BSTR;

pub struct UrlReader {
  automation: IUIAutomation,
  edit: IUIAutomationCondition,
  /// Barra de direcciones de la última ventana leída: buscarla en el árbol es lo caro.
  cached: Option<(isize, IUIAutomationElement)>,
}

impl UrlReader {
  pub fn new() -> Option<Self> {
    // SAFETY: inicializa COM en este hilo y crea el cliente de UI Automation; sin punteros propios.
    unsafe {
      // Si COM ya estaba inicializado en el hilo, devuelve un aviso que no impide seguir.
      let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
      let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER).ok()?;
      let edit = automation
        .CreatePropertyCondition(UIA_ControlTypePropertyId, &VARIANT::from(UIA_EditControlTypeId.0))
        .ok()?;
      Some(Self { automation, edit, cached: None })
    }
  }

  /// Texto de la barra de direcciones de la ventana `hwnd`, o `None` si no se pudo leer.
  pub fn read(&mut self, hwnd: HWND) -> Option<String> {
    let key = hwnd.0 as isize;
    let element = match &self.cached {
      Some((k, element)) if *k == key => element.clone(),
      _ => {
        // SAFETY: `hwnd` es la ventana en primer plano que acaba de devolver el sistema.
        let found = unsafe {
          let root = self.automation.ElementFromHandle(hwnd).ok()?;
          root.FindFirst(TreeScope_Descendants, &self.edit).ok()?
        };
        self.cached = Some((key, found.clone()));
        found
      }
    };
    // SAFETY: lectura de una propiedad de un elemento de UI Automation válido.
    let value = unsafe { element.GetCurrentPropertyValue(UIA_ValueValuePropertyId) };
    match value.ok().and_then(|v| BSTR::try_from(&v).ok()).map(|b| b.to_string()) {
      Some(text) if !text.is_empty() => Some(text),
      _ => {
        // El elemento pudo cambiar (la ventana se recreó): se vuelve a buscar la próxima vez.
        self.cached = None;
        None
      }
    }
  }
}
