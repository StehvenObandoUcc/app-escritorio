//! Comandos de Tauri de las fases F1 a F4 (nombres de docs/ARQUITECTURA.md §6).
//! Son una capa fina: la lógica y las pruebas viven en `tracker`.
//! Los argumentos llegan en camelCase desde la interfaz (`taskId` → `task_id`).

use crate::ai::{self, AiConfig, ChatMessage};
use crate::sync::SyncBatch;
use crate::tracker::{Result, SensorStatus, Settings, SettingsPatch, TeamPolicy, Tracker};
use crate::views::{DayView, RangeView, TimeEntryView};
use chrono::{Local, Utc};
use std::sync::Arc;
use tauri::State;

type Tr<'a> = State<'a, Arc<Tracker>>;

#[tauri::command]
pub fn sensor_status(t: Tr) -> Result<SensorStatus> {
  t.status(Utc::now())
}

#[tauri::command]
pub fn day_view(t: Tr, date: String) -> Result<DayView> {
  t.day_view(Utc::now(), &date, &Local)
}

#[tauri::command]
pub fn range_view(t: Tr, from: String, to: String) -> Result<RangeView> {
  t.range_view(Utc::now(), &from, &to, &Local)
}

#[tauri::command]
pub fn timer_start(t: Tr, task_id: Option<String>) -> Result<SensorStatus> {
  t.timer_start(Utc::now(), task_id.as_deref())
}

#[tauri::command]
pub fn timer_stop(t: Tr) -> Result<SensorStatus> {
  t.timer_stop(Utc::now())
}

#[tauri::command]
pub fn break_start(t: Tr) -> Result<SensorStatus> {
  t.break_start(Utc::now())
}

#[tauri::command]
pub fn break_end(t: Tr) -> Result<SensorStatus> {
  t.break_end(Utc::now())
}

#[tauri::command]
pub fn privacy_pause(t: Tr, minutes: u32) -> Result<SensorStatus> {
  t.privacy_pause(Utc::now(), minutes)
}

#[tauri::command]
pub fn privacy_resume(t: Tr) -> Result<SensorStatus> {
  t.privacy_resume(Utc::now())
}

#[tauri::command]
pub fn time_entries(t: Tr, date: String) -> Result<Vec<TimeEntryView>> {
  t.time_entries(&date, &Local)
}

#[tauri::command]
pub fn time_entry_add(t: Tr, start: String, end: String, task_id: Option<String>) -> Result<TimeEntryView> {
  t.time_entry_add(Utc::now(), &start, &end, task_id.as_deref())
}

#[tauri::command]
pub fn time_entry_update(t: Tr, id: String, start: String, end: String, task_id: Option<String>) -> Result<()> {
  t.time_entry_update(Utc::now(), &id, &start, &end, task_id.as_deref())
}

#[tauri::command]
pub fn time_entry_delete(t: Tr, id: String) -> Result<()> {
  t.time_entry_delete(Utc::now(), &id)
}

#[tauri::command]
pub fn settings_get(t: Tr) -> Result<Settings> {
  t.settings_get()
}

#[tauri::command]
pub fn settings_set(t: Tr, patch: SettingsPatch) -> Result<Settings> {
  t.settings_set(patch)
}

// ---- F2 ----

#[tauri::command]
pub fn session_get(t: Tr) -> Result<Option<String>> {
  t.session_get()
}

#[tauri::command]
pub fn session_set(t: Tr, json: String) -> Result<()> {
  t.session_set(&json)
}

#[tauri::command]
pub fn session_clear(t: Tr) -> Result<()> {
  t.session_clear()
}

#[tauri::command]
pub fn active_team_set(t: Tr, team_id: Option<String>, user_id: Option<String>) -> Result<()> {
  t.active_team_set(Utc::now(), team_id.as_deref(), user_id.as_deref())
}

#[tauri::command]
pub fn sync_pending(t: Tr, limit: u32) -> Result<SyncBatch> {
  t.sync_pending(Utc::now(), limit)
}

#[tauri::command]
pub fn sync_mark_synced(t: Tr, kind: String, ids: Vec<String>) -> Result<()> {
  t.sync_mark_synced(Utc::now(), &kind, &ids)
}

#[tauri::command]
pub fn rules_set(t: Tr, json: String) -> Result<()> {
  t.rules_set(&json)
}

// ---- F3 ----

#[tauri::command]
pub fn tasks_cache_put(t: Tr, json: String) -> Result<()> {
  t.tasks_cache_put(Utc::now(), &json)
}

#[tauri::command]
pub fn tasks_cache_get(t: Tr) -> Result<Option<String>> {
  t.tasks_cache_get()
}

/// ADR-0017: abre un enlace `https://` en el navegador del sistema (evidencia de las revisiones).
#[tauri::command]
pub fn open_external(app: tauri::AppHandle, url: String) -> Result<()> {
  use tauri_plugin_opener::OpenerExt;
  crate::links::check_https(&url)?;
  app.opener().open_url(url, None::<&str>).map_err(|e| format!("No se pudo abrir el enlace: {e}"))
}

/// ADR-0010: apps instaladas y abiertas para el selector de apps ocultas. Todo local.
/// Asíncrono para no bloquear la ventana mientras se lee el registro.
#[tauri::command]
pub async fn installed_apps() -> Vec<crate::apps::AppEntry> {
  crate::apps::installed_apps()
}

/// ADR-0011: si Windows tiene encendidas las notificaciones de apps (para explicarlo en Ajustes).
#[tauri::command]
pub fn notifications_status() -> crate::system::NotificationsStatus {
  crate::system::notifications_status()
}

/// ADR-0009/0010: política del equipo activo (apps ocultas y avisos de sitio no permitido).
#[tauri::command]
pub fn team_policy_set(t: Tr, policy: TeamPolicy) -> Result<()> {
  t.team_policy_set(policy)
}

// ---- F4 ----

/// URL base, modelo y si hay clave guardada. **Nunca** la clave (AC-19).
#[tauri::command]
pub fn ai_config_get(t: Tr) -> Result<AiConfig> {
  let (base_url, model) = t.ai_config_get()?;
  Ok(AiConfig { base_url, model, has_key: ai::key_get(ai::KEY_USER)?.is_some() })
}

/// Guarda URL y modelo; la clave solo si llega (si no, se conserva la que había).
#[tauri::command]
pub fn ai_config_set(t: Tr, base_url: String, model: String, key: Option<String>) -> Result<AiConfig> {
  let base_url = ai::check_base_url(&base_url)?;
  let model = ai::check_model(&model)?;
  if let Some(k) = key.as_deref().filter(|k| !k.trim().is_empty()) {
    ai::key_set(ai::KEY_USER, k)?;
  }
  t.ai_config_set(&base_url, &model)?;
  ai_config_get(t)
}

#[tauri::command]
pub fn ai_config_clear(t: Tr) -> Result<()> {
  ai::key_clear(ai::KEY_USER)?;
  t.ai_config_clear()
}

/// Llamada al proveedor del usuario (formato OpenAI). La clave se lee aquí y no sale de Rust.
#[tauri::command]
pub async fn ai_chat(t: Tr<'_>, messages: Vec<ChatMessage>) -> Result<String> {
  let (base_url, model) = t.ai_config_get()?;
  let (Some(base_url), Some(model)) = (base_url, model) else {
    return Err("Configura primero el proveedor de IA en Ajustes.".into());
  };
  let key = ai::key_get(ai::KEY_USER)?;
  ai::chat(&base_url, &model, key.as_deref(), &messages).await
}

/// IA-04: etiqueta un bloque de IA con su tipo de uso (`null` la quita).
#[tauri::command]
pub fn block_set_ai_usage(t: Tr, id: String, usage: Option<String>) -> Result<()> {
  t.block_set_ai_usage(Utc::now(), &id, usage.as_deref())
}
