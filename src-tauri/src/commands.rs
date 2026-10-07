//! Comandos de Tauri de las fases F1 y F2 (nombres de docs/ARQUITECTURA.md §6).
//! Son una capa fina: la lógica y las pruebas viven en `tracker`.
//! Los argumentos llegan en camelCase desde la interfaz (`taskId` → `task_id`).

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
pub fn active_team_set(t: Tr, team_id: Option<String>) -> Result<()> {
  t.active_team_set(Utc::now(), team_id.as_deref())
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
