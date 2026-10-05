//! Servicio que une sensor, clasificador, cifrado y base local.
//! Todo recibe `now` como argumento: los comandos pasan la hora real y las pruebas una simulada.
//! La interfaz solo ve estas operaciones (a través de `commands`), nunca SQL ni secretos.

use crate::classifier::{self, Rule};
use crate::crypto::TitleCipher;
use crate::sensor::ActiveWindow;
use crate::sensor::engine::{Change, Draft, Engine, Mode, Observation};
use crate::store::{BlockRow, Store};
use crate::views::{self, DayView, RangeView, TimeEntryView, iso};
use chrono::{DateTime, Duration, TimeZone, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;

/// Cada cuánto se vuelcan los bloques a disco (AC-4: pérdida máxima 10 s).
const FLUSH_EVERY: Duration = Duration::seconds(10);
const HIDDEN_APP_NAME: &str = "App oculta";
const MAX_PAUSE_MINUTES: u32 = 480;
const MAX_HIDDEN_APPS: usize = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
  /// Minutos sin teclado ni ratón para considerar inactividad (3 a 15).
  pub idle_minutes: u32,
  /// Procesos cuyo nombre y título no se registran (se guardan como «App oculta»).
  pub hidden_apps: Vec<String>,
}

impl Default for Settings {
  fn default() -> Self {
    Self { idle_minutes: 5, hidden_apps: Vec::new() }
  }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
  pub idle_minutes: Option<u32>,
  pub hidden_apps: Option<Vec<String>>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimerStatus {
  pub running: bool,
  pub started_at: Option<String>,
  pub task_id: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SensorStatus {
  pub state: &'static str,
  pub paused_until: Option<String>,
  pub timer: TimerStatus,
}

struct Inner {
  store: Store,
  cipher: TitleCipher,
  default_rules: Vec<Rule>,
  team_rules: Vec<Rule>,
  engine: Engine,
  pause_until: Option<DateTime<Utc>>,
  on_break: bool,
  pending: HashMap<String, Change>,
  last_flush: Option<DateTime<Utc>>,
  settings: Settings,
}

pub struct Tracker {
  inner: Mutex<Inner>,
}

fn parse_ts(s: &str) -> Result<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(s)
    .map(|t| t.with_timezone(&Utc))
    .map_err(|_| format!("Fecha y hora inválidas: «{s}»."))
}

fn check_task_id(task_id: Option<&str>) -> Result<()> {
  match task_id {
    Some(id) => Uuid::parse_str(id).map(|_| ()).map_err(|_| "Identificador de tarea inválido.".to_string()),
    None => Ok(()),
  }
}

impl Inner {
  fn load_settings(store: &Store) -> Result<Settings> {
    let mut s = Settings::default();
    if let Some(v) = store.setting_get("idle_minutes")?
      && let Ok(n) = v.parse::<u32>()
      && (3..=15).contains(&n)
    {
      s.idle_minutes = n;
    }
    if let Some(v) = store.setting_get("hidden_apps")?
      && let Ok(list) = serde_json::from_str::<Vec<String>>(&v)
    {
      s.hidden_apps = list;
    }
    Ok(s)
  }

  fn idle_threshold(&self) -> u64 {
    u64::from(self.settings.idle_minutes) * 60
  }

  fn record(&mut self, changes: Vec<Change>) {
    for c in changes {
      let id = match &c {
        Change::Upsert(d) => d.id.clone(),
        Change::Remove(id) => id.clone(),
      };
      self.pending.insert(id, c);
    }
  }

  fn flush(&mut self, now: DateTime<Utc>) -> Result<()> {
    self.last_flush = Some(now);
    if self.pending.is_empty() {
      return Ok(());
    }
    let (mut upserts, mut removes) = (Vec::new(), Vec::new());
    for change in self.pending.values() {
      match change {
        Change::Upsert(d) => upserts.push(self.to_row(d)?),
        Change::Remove(id) => removes.push(id.clone()),
      }
    }
    self.store.apply_block_changes(&upserts, &removes)?;
    self.pending.clear();
    Ok(())
  }

  fn to_row(&self, d: &Draft) -> Result<BlockRow> {
    let title_enc = d.title.as_deref().map(|t| self.cipher.encrypt(t)).transpose()?;
    Ok(BlockRow {
      id: d.id.clone(),
      started_at: d.started_at,
      ended_at: d.ended_at,
      app_name: d.app_name.clone(),
      title_enc,
      category: d.category,
      ai_tool: d.ai_tool.clone(),
    })
  }

  /// Modo actual; cierra la pausa de privacidad si ya venció (AC-11).
  fn mode(&mut self, now: DateTime<Utc>) -> Mode {
    if let Some(until) = self.pause_until
      && now >= until
    {
      self.pause_until = None;
      let changes = self.engine.close_open(until.min(now));
      self.record(changes);
    }
    if self.pause_until.is_some() {
      Mode::Paused
    } else if self.on_break {
      Mode::Break
    } else {
      Mode::Tracking
    }
  }

  fn observe(&self, w: &ActiveWindow) -> Observation {
    let hidden = self.settings.hidden_apps.iter().any(|a| a.eq_ignore_ascii_case(&w.process));
    let (app_name, title) = if hidden {
      (HIDDEN_APP_NAME.to_string(), None)
    } else {
      (w.process.clone(), Some(w.title.clone()).filter(|t| !t.is_empty()))
    };
    // Una app oculta se clasifica solo por proceso: su título no se mira.
    let c = classifier::classify(&self.team_rules, &self.default_rules, &w.process, if hidden { "" } else { &w.title });
    Observation { app_name, title, category: c.category, ai_tool: c.ai_tool }
  }

  fn status(&mut self, now: DateTime<Utc>) -> Result<SensorStatus> {
    let state = match self.mode(now) {
      Mode::Tracking => "tracking",
      Mode::Paused => "paused",
      Mode::Break => "break",
    };
    let timer = match self.store.open_timer()? {
      Some(e) => TimerStatus { running: true, started_at: Some(iso(e.started_at)), task_id: e.task_id },
      None => TimerStatus { running: false, started_at: None, task_id: None },
    };
    Ok(SensorStatus { state, paused_until: self.pause_until.map(iso), timer })
  }

  /// Fuerza el modo especial (pausa o descanso) ahora mismo, sin esperar a la siguiente lectura.
  fn enter_special(&mut self, now: DateTime<Utc>, mode: Mode) -> Result<()> {
    let thr = self.idle_threshold();
    let changes = self.engine.tick(now, None, 0, mode, thr);
    self.record(changes);
    self.flush(now)
  }

  fn leave_special(&mut self, now: DateTime<Utc>) -> Result<()> {
    let changes = self.engine.close_open(now);
    self.record(changes);
    self.flush(now)
  }
}

impl Tracker {
  pub fn new(store: Store, cipher: TitleCipher) -> Result<Self> {
    let settings = Inner::load_settings(&store)?;
    Ok(Self {
      inner: Mutex::new(Inner {
        store,
        cipher,
        default_rules: classifier::default_rules(),
        team_rules: Vec::new(),
        engine: Engine::new(),
        pause_until: None,
        on_break: false,
        pending: HashMap::new(),
        last_flush: None,
        settings,
      }),
    })
  }

  fn lock(&self) -> Result<MutexGuard<'_, Inner>> {
    self.inner.lock().map_err(|_| "El estado interno quedó inconsistente; reinicia Pulso.".to_string())
  }

  /// Una lectura del sensor (cada ~2 s). Vuelca a disco cada 10 s.
  pub fn tick(&self, now: DateTime<Utc>, window: Option<ActiveWindow>, idle_secs: Option<u64>) -> Result<()> {
    let mut g = self.lock()?;
    let mode = g.mode(now);
    let obs = if mode == Mode::Tracking { window.as_ref().map(|w| g.observe(w)) } else { None };
    let thr = g.idle_threshold();
    let changes = g.engine.tick(now, obs.as_ref(), idle_secs.unwrap_or(0), mode, thr);
    g.record(changes);
    if g.last_flush.is_none_or(|t| now - t >= FLUSH_EVERY) {
      g.flush(now)?;
    }
    Ok(())
  }

  /// Cierra el bloque abierto y vuelca todo (al salir de la app).
  pub fn shutdown(&self, now: DateTime<Utc>) -> Result<()> {
    let mut g = self.lock()?;
    let changes = g.engine.close_open(now);
    g.record(changes);
    g.flush(now)
  }

  pub fn status(&self, now: DateTime<Utc>) -> Result<SensorStatus> {
    self.lock()?.status(now)
  }

  // ---- Temporizador ----

  pub fn timer_start(&self, now: DateTime<Utc>, task_id: Option<&str>) -> Result<SensorStatus> {
    check_task_id(task_id)?;
    let mut g = self.lock()?;
    g.store.timer_start(now, task_id)?;
    g.status(now)
  }

  pub fn timer_stop(&self, now: DateTime<Utc>) -> Result<SensorStatus> {
    let mut g = self.lock()?;
    g.store.timer_stop(now)?;
    g.status(now)
  }

  // ---- Descanso y pausa de privacidad ----

  pub fn break_start(&self, now: DateTime<Utc>) -> Result<SensorStatus> {
    let mut g = self.lock()?;
    if g.mode(now) == Mode::Paused {
      return Err("Termina la pausa de privacidad antes de tomar un descanso.".into());
    }
    if !g.on_break {
      g.on_break = true;
      g.enter_special(now, Mode::Break)?;
    }
    g.status(now)
  }

  pub fn break_end(&self, now: DateTime<Utc>) -> Result<SensorStatus> {
    let mut g = self.lock()?;
    if g.on_break {
      g.on_break = false;
      if g.pause_until.is_none() {
        g.leave_special(now)?;
      }
    }
    g.status(now)
  }

  pub fn privacy_pause(&self, now: DateTime<Utc>, minutes: u32) -> Result<SensorStatus> {
    if !(1..=MAX_PAUSE_MINUTES).contains(&minutes) {
      return Err(format!("La pausa debe durar entre 1 y {MAX_PAUSE_MINUTES} minutos."));
    }
    let mut g = self.lock()?;
    g.mode(now);
    g.on_break = false;
    g.pause_until = Some(now + Duration::minutes(i64::from(minutes)));
    g.enter_special(now, Mode::Paused)?;
    g.status(now)
  }

  pub fn privacy_resume(&self, now: DateTime<Utc>) -> Result<SensorStatus> {
    let mut g = self.lock()?;
    if g.pause_until.take().is_some() {
      g.leave_special(now)?;
    }
    g.status(now)
  }

  // ---- Vistas ----

  pub fn day_view<Tz: TimeZone>(&self, now: DateTime<Utc>, date: &str, tz: &Tz) -> Result<DayView> {
    let date = views::parse_date(date)?;
    let bounds = views::day_bounds(date, tz)?;
    let mut g = self.lock()?;
    g.flush(now)?;
    let rows = g.store.blocks_between(bounds.0, bounds.1)?;
    let blocks = rows
      .into_iter()
      .map(|b| {
        // Un título que no se puede descifrar (clave perdida) se muestra vacío, no rompe el día.
        let title = b.title_enc.as_deref().and_then(|enc| g.cipher.decrypt(enc).ok());
        (b, title)
      })
      .collect();
    Ok(views::build_day_view(date, bounds, blocks))
  }

  pub fn range_view<Tz: TimeZone>(&self, now: DateTime<Utc>, from: &str, to: &str, tz: &Tz) -> Result<RangeView> {
    let (from, to) = (views::parse_date(from)?, views::parse_date(to)?);
    if to < from {
      return Err("El fin del rango es anterior al inicio.".into());
    }
    let start = views::day_bounds(from, tz)?.0;
    let end = views::day_bounds(to, tz)?.1;
    let mut g = self.lock()?;
    g.flush(now)?;
    let rows = g.store.blocks_between(start, end)?;
    views::build_range_view(from, to, tz, &rows)
  }

  // ---- Entradas de tiempo manuales ----

  /// Entradas de tiempo del día local (ADR-0005), incluida la del temporizador en marcha.
  pub fn time_entries<Tz: TimeZone>(&self, date: &str, tz: &Tz) -> Result<Vec<TimeEntryView>> {
    let (start, end) = views::day_bounds(views::parse_date(date)?, tz)?;
    let entries = self.lock()?.store.entries_between(start, end)?;
    Ok(entries.iter().map(TimeEntryView::from).collect())
  }

  pub fn time_entry_add(&self, now: DateTime<Utc>, start: &str, end: &str, task_id: Option<&str>) -> Result<TimeEntryView> {
    check_task_id(task_id)?;
    let e = self.lock()?.store.time_entry_add(parse_ts(start)?, parse_ts(end)?, task_id, now)?;
    Ok(TimeEntryView::from(&e))
  }

  pub fn time_entry_update(&self, now: DateTime<Utc>, id: &str, start: &str, end: &str, task_id: Option<&str>) -> Result<()> {
    check_task_id(task_id)?;
    self.lock()?.store.time_entry_update(id, parse_ts(start)?, parse_ts(end)?, task_id, now)
  }

  pub fn time_entry_delete(&self, now: DateTime<Utc>, id: &str) -> Result<()> {
    self.lock()?.store.time_entry_delete(id, now)
  }

  // ---- Ajustes ----

  pub fn settings_get(&self) -> Result<Settings> {
    Ok(self.lock()?.settings.clone())
  }

  pub fn settings_set(&self, patch: SettingsPatch) -> Result<Settings> {
    let mut g = self.lock()?;
    let mut next = g.settings.clone();
    if let Some(m) = patch.idle_minutes {
      if !(3..=15).contains(&m) {
        return Err("El umbral de inactividad debe estar entre 3 y 15 minutos.".into());
      }
      next.idle_minutes = m;
    }
    if let Some(apps) = patch.hidden_apps {
      let mut clean: Vec<String> = Vec::new();
      for a in apps.iter().map(|a| a.trim().to_lowercase()).filter(|a| !a.is_empty()) {
        if !clean.contains(&a) {
          clean.push(a);
        }
      }
      if clean.len() > MAX_HIDDEN_APPS {
        return Err(format!("Puedes ocultar hasta {MAX_HIDDEN_APPS} apps."));
      }
      next.hidden_apps = clean;
    }
    g.store.setting_set("idle_minutes", &next.idle_minutes.to_string())?;
    g.store.setting_set("hidden_apps", &serde_json::to_string(&next.hidden_apps).map_err(|e| e.to_string())?)?;
    g.settings = next.clone();
    Ok(next)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::classifier::Category;
  use chrono::FixedOffset;

  fn tracker() -> Tracker {
    Tracker::new(Store::open_in_memory().unwrap(), TitleCipher::new(&TitleCipher::generate_key())).unwrap()
  }

  fn at(h: u32, m: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 5, h, m, s).unwrap()
  }

  fn win(process: &str, title: &str) -> Option<ActiveWindow> {
    Some(ActiveWindow { process: process.into(), title: title.into() })
  }

  /// Lecturas cada 2 s entre dos instantes (segundos desde 12:00:00).
  fn feed(t: &Tracker, from: u32, to: u32, w: Option<ActiveWindow>) {
    let mut s = from;
    while s <= to {
      t.tick(at(12, s / 60, s % 60), w.clone(), Some(0)).unwrap();
      s += 2;
    }
  }

  fn utc() -> FixedOffset {
    FixedOffset::east_opt(0).unwrap()
  }

  fn day(t: &Tracker, now: DateTime<Utc>) -> DayView {
    t.day_view(now, "2026-10-05", &utc()).unwrap()
  }

  #[test]
  fn ai_title_is_classified_and_shown_decrypted() {
    // AC-5 de extremo a extremo (sensor → clasificador → cifrado → vista)
    let t = tracker();
    feed(&t, 0, 40, win("chrome", "ChatGPT - Google Chrome"));
    let d = day(&t, at(12, 0, 41));
    assert_eq!(d.blocks.len(), 1);
    assert_eq!(d.blocks[0].category, Category::Ai);
    assert_eq!(d.blocks[0].ai_tool.as_deref(), Some("ChatGPT"));
    assert_eq!(d.blocks[0].title.as_deref(), Some("ChatGPT - Google Chrome"));
    assert_eq!(d.totals["ai"], 40);
  }

  #[test]
  fn title_is_stored_encrypted() {
    // AC-9
    let t = tracker();
    feed(&t, 0, 20, win("outlook", "Presupuesto Cliente SA"));
    day(&t, at(12, 0, 21));
    let g = t.inner.lock().unwrap();
    let rows = g.store.blocks_between(at(0, 0, 0), at(23, 0, 0)).unwrap();
    let enc = rows[0].title_enc.as_ref().expect("hay título cifrado");
    assert!(!String::from_utf8_lossy(enc).contains("Presupuesto"));
  }

  #[test]
  fn data_reaches_disk_at_most_10s_late() {
    // AC-4: sin volcado manual, tras 13 s lo escrito llega a menos de 10 s del último tick.
    let t = tracker();
    feed(&t, 0, 26, win("code", "main.rs"));
    let g = t.inner.lock().unwrap();
    let rows = g.store.blocks_between(at(0, 0, 0), at(23, 0, 0)).unwrap();
    assert_eq!(rows.len(), 1);
    assert!(at(12, 0, 26) - rows[0].ended_at <= Duration::seconds(10));
  }

  #[test]
  fn privacy_pause_hides_everything_and_expires_by_itself() {
    // AC-8 y AC-11
    let t = tracker();
    feed(&t, 0, 20, win("code", "secreto.rs"));
    let s = t.privacy_pause(at(12, 0, 22), 1).unwrap();
    assert_eq!(s.state, "paused");
    assert_eq!(s.paused_until.as_deref(), Some("2026-10-05T12:01:22Z"));
    feed(&t, 24, 80, win("outlook", "Correo privado")); // durante la pausa
    assert_eq!(t.status(at(12, 1, 20)).unwrap().state, "paused");
    t.tick(at(12, 1, 24), win("code", "vuelvo.rs"), Some(0)).unwrap();
    assert_eq!(t.status(at(12, 1, 24)).unwrap().state, "tracking");
    t.tick(at(12, 1, 26), win("code", "vuelvo.rs"), Some(0)).unwrap();

    let d = day(&t, at(12, 1, 27));
    let paused: Vec<_> = d.blocks.iter().filter(|b| b.category == Category::Paused).collect();
    assert_eq!(paused.len(), 1);
    assert_eq!(paused[0].app_name, "Pulso");
    assert_eq!(paused[0].title, None);
    assert_eq!(paused[0].ended_at, "2026-10-05T12:01:22Z");
    assert!(d.blocks.iter().all(|b| b.app_name != "outlook"));
  }

  #[test]
  fn manual_resume_ends_pause() {
    let t = tracker();
    t.privacy_pause(at(12, 0, 0), 15).unwrap();
    let s = t.privacy_resume(at(12, 5, 0)).unwrap();
    assert_eq!((s.state, s.paused_until), ("tracking", None));
    assert!(t.privacy_pause(at(12, 6, 0), 0).is_err());
    assert!(t.privacy_pause(at(12, 6, 0), 9999).is_err());
  }

  #[test]
  fn break_creates_a_break_block() {
    // AC-14
    let t = tracker();
    feed(&t, 0, 20, win("code", "a.rs"));
    assert_eq!(t.break_start(at(12, 0, 22)).unwrap().state, "break");
    feed(&t, 24, 58, win("code", "a.rs"));
    assert_eq!(t.break_end(at(12, 1, 0)).unwrap().state, "tracking");
    feed(&t, 62, 90, win("code", "a.rs"));
    let d = day(&t, at(12, 1, 31));
    let cats: Vec<_> = d.blocks.iter().map(|b| b.category).collect();
    assert_eq!(cats, [Category::Productive, Category::Break, Category::Productive]);
    assert_eq!(d.totals["break"], 38);
  }

  #[test]
  fn break_is_rejected_during_a_privacy_pause() {
    let t = tracker();
    t.privacy_pause(at(12, 0, 0), 10).unwrap();
    assert!(t.break_start(at(12, 0, 5)).is_err());
  }

  #[test]
  fn timer_flow_and_double_start() {
    // AC-12 a través del servicio
    let t = tracker();
    let s = t.timer_start(at(12, 0, 0), None).unwrap();
    assert!(s.timer.running);
    assert_eq!(s.timer.started_at.as_deref(), Some("2026-10-05T12:00:00Z"));
    assert!(t.timer_start(at(12, 0, 5), None).unwrap_err().contains("en marcha"));
    assert!(!t.timer_stop(at(12, 30, 0)).unwrap().timer.running);
    assert!(t.timer_start(at(12, 31, 0), Some("no-es-uuid")).is_err());
  }

  #[test]
  fn manual_entries_are_validated() {
    // AC-13
    let t = tracker();
    let now = at(12, 0, 0);
    assert!(t.time_entry_add(now, "2026-10-05T09:00:00Z", "2026-10-05T08:00:00Z", None).is_err());
    assert!(t.time_entry_add(now, "2026-10-04T09:00:00Z", "2026-10-05T10:00:00Z", None).is_err());
    assert!(t.time_entry_add(now, "2026-10-05T11:00:00Z", "2026-10-05T13:00:00Z", None).is_err());
    assert!(t.time_entry_add(now, "ayer", "hoy", None).is_err());
    let ok = t.time_entry_add(now, "2026-10-05T09:00:00Z", "2026-10-05T10:00:00Z", None).unwrap();
    assert_eq!(ok.source, "manual");
    t.time_entry_delete(now, &ok.id).unwrap();
  }

  #[test]
  fn time_entries_lists_the_local_day_without_deleted() {
    let t = tracker();
    let now = at(12, 0, 0);
    let a = t.time_entry_add(now, "2026-10-05T08:00:00Z", "2026-10-05T09:00:00Z", None).unwrap();
    let b = t.time_entry_add(now, "2026-10-04T08:00:00Z", "2026-10-04T09:00:00Z", None).unwrap();
    let gone = t.time_entry_add(now, "2026-10-05T09:30:00Z", "2026-10-05T10:00:00Z", None).unwrap();
    t.time_entry_delete(now, &gone.id).unwrap();
    t.timer_start(now, None).unwrap();
    let list = t.time_entries("2026-10-05", &utc()).unwrap();
    let ids: Vec<_> = list.iter().map(|e| e.id.as_str()).collect();
    assert_eq!(list.len(), 2, "{ids:?}"); // la manual y el temporizador abierto
    assert_eq!(list[0].id, a.id);
    assert_eq!(list[1].ended_at, None);
    assert!(!ids.contains(&b.id.as_str()) && !ids.contains(&gone.id.as_str()));
  }

  #[test]
  fn hidden_apps_are_not_recorded_by_name_or_title() {
    let t = tracker();
    t.settings_set(SettingsPatch { hidden_apps: Some(vec!["  KeePass ".into(), "keepass".into()]), ..Default::default() }).unwrap();
    assert_eq!(t.settings_get().unwrap().hidden_apps, ["keepass"]);
    feed(&t, 0, 30, win("KeePass", "Banco - contraseña"));
    let d = day(&t, at(12, 0, 31));
    assert_eq!(d.blocks[0].app_name, "App oculta");
    assert_eq!(d.blocks[0].title, None);
  }

  #[test]
  fn settings_are_validated_and_persist() {
    let t = tracker();
    assert_eq!(t.settings_get().unwrap(), Settings::default());
    assert!(t.settings_set(SettingsPatch { idle_minutes: Some(2), ..Default::default() }).is_err());
    assert!(t.settings_set(SettingsPatch { idle_minutes: Some(16), ..Default::default() }).is_err());
    t.settings_set(SettingsPatch { idle_minutes: Some(10), ..Default::default() }).unwrap();
    let g = t.inner.lock().unwrap();
    assert_eq!(Inner::load_settings(&g.store).unwrap().idle_minutes, 10);
  }

  #[test]
  fn idle_threshold_from_settings_is_applied() {
    // AC-3 de extremo a extremo con el umbral de 3 minutos
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: Some(3), ..Default::default() }).unwrap();
    feed(&t, 0, 10, win("code", "a.rs"));
    // sin interacción desde 12:00:10; a las 12:03:20 ya son 190 s
    t.tick(at(12, 3, 20), win("code", "a.rs"), Some(190)).unwrap();
    let d = day(&t, at(12, 3, 21));
    assert_eq!(d.blocks.last().unwrap().category, Category::Idle);
    assert_eq!(d.blocks[0].ended_at, "2026-10-05T12:00:10Z");
    assert_eq!(d.totals["idle"], 190);
  }

  #[test]
  fn shutdown_closes_and_persists() {
    let t = tracker();
    feed(&t, 0, 14, win("code", "a.rs"));
    t.shutdown(at(12, 0, 15)).unwrap();
    let g = t.inner.lock().unwrap();
    let rows = g.store.blocks_between(at(0, 0, 0), at(23, 0, 0)).unwrap();
    assert_eq!(rows[0].ended_at, at(12, 0, 15));
  }

  #[test]
  fn range_view_sums_days() {
    let t = tracker();
    feed(&t, 0, 58, win("code", "a.rs"));
    let r = t.range_view(at(12, 1, 0), "2026-10-04", "2026-10-05", &utc()).unwrap();
    assert_eq!(r.days.len(), 2);
    assert_eq!(r.days[0].totals["productive"], 0);
    assert_eq!(r.days[1].totals["productive"], 58);
  }
}
