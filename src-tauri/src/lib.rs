pub mod classifier;
pub mod commands;
pub mod crypto;
pub mod secrets;
pub mod sensor;
pub mod store;
pub mod tracker;
pub mod views;

use chrono::Utc;
use std::sync::Arc;
use std::time::Duration;
use tauri::Manager;

/// Cada cuánto lee el sensor la ventana activa (spec F1).
const SAMPLE_EVERY: Duration = Duration::from_secs(2);

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      let dir = app.path().app_data_dir()?;
      std::fs::create_dir_all(&dir)?;
      let store = store::Store::open(&dir.join("pulso.db"))?;
      let cipher = crypto::TitleCipher::new(&secrets::title_key()?);
      let tracker = Arc::new(tracker::Tracker::new(store, cipher)?);

      spawn_sensor(tracker.clone());
      app.manage(tracker);
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
    .build(tauri::generate_context!())
    .expect("error while building tauri application");

  app.run(|handle, event| {
    // Al salir se cierra el bloque abierto y se vuelca todo a disco (AC-4).
    if let tauri::RunEvent::Exit = event
      && let Some(tracker) = handle.try_state::<Arc<tracker::Tracker>>()
      && let Err(e) = tracker.shutdown(Utc::now())
    {
      log::error!("al salir: {e}");
    }
  });
}
