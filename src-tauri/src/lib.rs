pub mod classifier;
pub mod commands;
pub mod crypto;
pub mod instance;
pub mod secrets;
pub mod sensor;
pub mod store;
pub mod tracker;
pub mod views;

use chrono::Utc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

/// Cada cuánto lee el sensor la ventana activa (spec F1).
const SAMPLE_EVERY: Duration = Duration::from_secs(2);
/// Si el proceso sigue vivo este tiempo después de cerrar la ventana, se termina a la fuerza.
const EXIT_WATCHDOG: Duration = Duration::from_secs(5);

/// Hilo del sensor: lee la ventana y la inactividad y alimenta al servicio.
fn spawn_sensor(tracker: Arc<tracker::Tracker>) {
  std::thread::Builder::new()
    .name("pulso-sensor".into())
    .spawn(move || {
      loop {
        let (window, idle) = (sensor::active_window(), sensor::idle_seconds());
        if let Err(e) = tracker.tick(Utc::now(), window, idle) {
          log::error!("sensor: {e}");
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
    .setup(|app| {
      let dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&dir)?;
      let store = store::Store::open(&dir.join("pulso.db"))?;
      let cipher = crypto::TitleCipher::new(&secrets::title_key()?);
      let tracker = Arc::new(tracker::Tracker::new(store, cipher)?);

      spawn_sensor(tracker.clone());
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
