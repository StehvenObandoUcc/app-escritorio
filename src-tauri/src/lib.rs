pub mod apps;
pub mod classifier;
pub mod commands;
pub mod crypto;
pub mod instance;
pub mod links;
pub mod secrets;
pub mod sensor;
pub mod store;
pub mod sync;
pub mod system;
pub mod tracker;
pub mod views;

use chrono::Utc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

/// Evento local hacia la interfaz cuando se entra a un sitio no permitido (ADR-0012).
const ALERT_EVENT: &str = "not-allowed-alert";
/// Cada cuánto lee el sensor la ventana activa (spec F1).
const SAMPLE_EVERY: Duration = Duration::from_secs(2);
/// Si el proceso sigue vivo este tiempo después de cerrar la ventana, se termina a la fuerza.
const EXIT_WATCHDOG: Duration = Duration::from_secs(5);

/// Aviso de sitio no permitido (ADR-0010, ADR-0011). Solo local:
/// - sonido propio y parpadeo del icono en la barra de tareas, que funcionan aunque Windows tenga las
///   notificaciones apagadas;
/// - y la notificación de Windows, que solo se ve si están encendidas.
fn notify_not_allowed(handle: &AppHandle, alert: &tracker::Alert) {
  use tauri_plugin_notification::NotificationExt;
  system::beep();
  if let Some(window) = handle.get_webview_window("main")
    && let Err(e) = window.request_user_attention(Some(tauri::UserAttentionType::Informational))
  {
    log::error!("aviso: no se pudo hacer parpadear la ventana: {e}");
  }
  // Sin el dominio: los registros no llevan datos personales (ARQUITECTURA §10).
  log::info!("aviso de sitio no permitido enviado");
  // Aviso dentro de la app (ADR-0012): la interfaz lo muestra en cualquier pantalla. Solo viaja a la ventana local.
  let payload = serde_json::json!({ "domain": alert.domain, "at": Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Secs, true) });
  if let Err(e) = handle.emit(ALERT_EVENT, payload) {
    log::error!("aviso: no se pudo avisar a la interfaz: {e}");
  }
  // ADR-0015: la notificación sale en el idioma elegido en Ajustes.
  let (title, body) = match alert.language.as_str() {
    "en" => (
      format!("Site not allowed: {}", alert.domain),
      "Your team marked this site as not allowed. Pulso does not block it: the time counts as distraction.",
    ),
    _ => (
      format!("Sitio no permitido: {}", alert.domain),
      "Tu equipo marcó este sitio como no permitido. Pulso no lo bloquea: el tiempo cuenta como distracción.",
    ),
  };
  let shown = handle
    .notification()
    .builder()
    .title(title)
    .body(body)
    .sound("Default")
    .show();
  if let Err(e) = shown {
    log::error!("aviso de sitio no permitido: {e}");
  }
}

/// Hilo del sensor: lee la ventana y la inactividad y alimenta al servicio.
fn spawn_sensor(tracker: Arc<tracker::Tracker>, handle: AppHandle) {
  std::thread::Builder::new()
    .name("pulso-sensor".into())
    .spawn(move || {
      // El lector de la barra de direcciones (UI Automation) vive en este hilo.
      let mut reader = sensor::Sensor::new();
      loop {
        let (window, idle) = (reader.read(), sensor::idle_seconds());
        match tracker.tick(Utc::now(), window, idle) {
          Ok(Some(alert)) => notify_not_allowed(&handle, &alert),
          Ok(None) => {}
          Err(e) => log::error!("sensor: {e}"),
        }
        std::thread::sleep(SAMPLE_EVERY);
      }
    })
    .expect("no se pudo iniciar el hilo del sensor");
}

/// Cerrar Pulso significa dejar de registrar en ese mismo momento (promesa de «sin vigilar»).
/// Se llama al pedir el cierre de la ventana, al pedir la salida y al salir; solo actúa la primera vez.
fn stop_tracking(handle: &AppHandle, reason: &str) {
  static STOPPED: AtomicBool = AtomicBool::new(false);
  if STOPPED.swap(true, Ordering::SeqCst) {
    return;
  }
  log::info!("cierre: {reason}; se detiene el sensor");
  if let Some(tracker) = handle.try_state::<Arc<tracker::Tracker>>()
    && let Err(e) = tracker.shutdown(Utc::now())
  {
    log::error!("al detener el sensor: {e}");
  }
  // Red de seguridad: en una prueba real el proceso siguió vivo sin ventana tras cerrar.
  // El sensor ya está detenido; esto además garantiza que el proceso termine.
  std::thread::spawn(|| {
    std::thread::sleep(EXIT_WATCHDOG);
    log::warn!("el proceso seguía vivo {}s después del cierre; se termina", EXIT_WATCHDOG.as_secs());
    std::process::exit(0);
  });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let context = tauri::generate_context!();

  // Una sola instancia: se comprueba antes de crear la ventana. El archivo queda bloqueado
  // mientras viva este proceso (`run` no retorna).
  let lock_path = instance::lock_path(&std::env::temp_dir(), &context.config().identifier);
  let _instance_lock = match instance::acquire(&lock_path) {
    Ok(Some(lock)) => Some(lock),
    Ok(None) => {
      instance::notify_already_running();
      return;
    }
    // Si el bloqueo no se puede crear, Pulso arranca igual: es mejor que no abrir.
    Err(_) => None,
  };

  let app = tauri::Builder::default()
    // Registro también en release, solo con eventos del ciclo de vida y errores: nunca títulos
    // ni datos personales (ARQUITECTURA §10).
    .plugin(
      tauri_plugin_log::Builder::default()
        .level(log::LevelFilter::Info)
        .build(),
    )
    // Avisos de sitio no permitido (ADR-0010): se usan solo desde Rust, sin permisos para la interfaz.
    .plugin(tauri_plugin_notification::init())
    // ADR-0017: solo lo usa el comando open_external, que valida https; la interfaz no tiene sus permisos.
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&dir)?;
      let store = store::Store::open(&dir.join("pulso.db"))?;
      let cipher = crypto::TitleCipher::new(&secrets::title_key()?);
      let tracker = Arc::new(tracker::Tracker::new(store, cipher)?);
      // A-1: antes de que el sensor escriba, se guarda el hueco desde la última vez (si lo hubo).
      if let Err(e) = tracker.record_closure_since_last_run(Utc::now()) {
        log::error!("al registrar el cierre anterior: {e}");
      }

      spawn_sensor(tracker.clone(), app.handle().clone());
      app.manage(tracker);
      log::info!("inicio: sensor en marcha");
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::sensor_status,
      commands::day_view,
      commands::range_view,
      commands::timer_start,
      commands::timer_stop,
      commands::break_start,
      commands::break_end,
      commands::privacy_pause,
      commands::privacy_resume,
      commands::time_entries,
      commands::time_entry_add,
      commands::time_entry_update,
      commands::time_entry_delete,
      commands::settings_get,
      commands::settings_set,
      commands::session_get,
      commands::session_set,
      commands::session_clear,
      commands::active_team_set,
      commands::sync_pending,
      commands::sync_mark_synced,
      commands::rules_set,
      commands::team_policy_set,
      commands::installed_apps,
      commands::notifications_status,
      commands::tasks_cache_put,
      commands::tasks_cache_get,
      commands::open_external,
    ])
    .build(context)
    .expect("error while building tauri application");

  app.run(|handle, event| match event {
    // Pulso tiene una sola ventana: cerrarla es cerrar la app.
    RunEvent::WindowEvent { event: WindowEvent::CloseRequested { .. }, .. } => {
      stop_tracking(handle, "ventana cerrada");
    }
    RunEvent::ExitRequested { .. } => stop_tracking(handle, "salida solicitada"),
    RunEvent::Exit => {
      stop_tracking(handle, "salida");
      log::info!("salida completa");
    }
    _ => {}
  });
}
