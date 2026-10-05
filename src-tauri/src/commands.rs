//! Comandos de Tauri de la fase F1 (nombres de docs/ARQUITECTURA.md §6).
//! Son una capa fina: la lógica y las pruebas viven en `tracker`.
//! Los argumentos llegan en camelCase desde la interfaz (`taskId` → `task_id`).

use crate::tracker::{Result, SensorStatus, Settings, SettingsPatch, Tracker};
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
