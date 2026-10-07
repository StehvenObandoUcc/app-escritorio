//! Servicio que une sensor, clasificador, cifrado y base local.
//! Todo recibe `now` como argumento: los comandos pasan la hora real y las pruebas una simulada.
//! La interfaz solo ve estas operaciones (a través de `commands`), nunca SQL ni secretos.

use crate::classifier::{self, Category, Rule};
use crate::crypto::TitleCipher;
use crate::sensor::ActiveWindow;
use crate::sensor::engine::{Change, Draft, Engine, Mode, Observation};
use crate::store::{BlockRow, Closure, Store, SyncKind};
use crate::sync::SyncBatch;
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

/// Un bloque se sube cuando empezó hace este tiempo, aunque siga abierto (ADR-0010): las fusiones de
/// bloques cortos (AC-2) ocurren antes de 10 s, así que para entonces el bloque ya no desaparece.
const SYNC_STABLE_AFTER: Duration = Duration::seconds(15);
const SYNC_MAX_LIMIT: u32 = 500;
/// Un hueco mayor que esto al volver a abrir se guarda como cierre de Pulso (A-1).
const CLOSURE_MIN_GAP: Duration = Duration::minutes(2);
const MAX_TEAM_RULES: usize = 500;
/// Una sesión de Supabase ocupa unos pocos KB; esto es solo un tope de seguridad.
const MAX_SESSION_BYTES: usize = 64 * 1024;

const KEY_ACTIVE_TEAM: &str = "active_team_id";
const KEY_ACTIVE_USER: &str = "active_user_id";
const KEY_TEAM_RULES: &str = "team_rules";
const KEY_SESSION: &str = "session_enc";
/// Nombre de proceso de Pulso: su propia ventana no se registra (ADR-0012).
const OWN_PROCESS: &str = "pulso";
const KEY_ALLOW_HIDDEN: &str = "team_allow_hidden_apps";
const KEY_ALERT: &str = "team_alert_not_allowed";
const KEY_ALERT_REPEAT: &str = "team_alert_repeat_minutes";
const DEFAULT_ALERT_REPEAT: u32 = 10;
/// Con una app o sitio «sin teclado» delante (leer, reuniones), la inactividad llega a los 30 min (ADR-0013).
const KEEP_ACTIVE_IDLE_SECS: u64 = 30 * 60;
const ALERT_REPEATS: &[u32] = &[0, 2, 5, 10, 15, 30];

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
  /// Tras `shutdown` no se registra nada más, aunque el proceso tarde en terminar.
  stopped: bool,
  /// Equipo al que se asignan las filas nuevas (F2). `None`: lo registrado no se sube.
  active_team: Option<String>,
  /// `updated_at` de cada entrada entregada por `sync_pending`, para no marcar una editada después.
  entry_versions: HashMap<String, DateTime<Utc>>,
  /// Política del equipo (ADR-0009): con `false`, la lista de apps ocultas no se aplica.
  allow_hidden: bool,
  /// Avisos de sitio no permitido (ADR-0010).
  alert_enabled: bool,
  alert_repeat_minutes: u32,
  /// Último aviso: dominio y cuándo. Se borra al salir del sitio para avisar otra vez al volver.
  last_alert: Option<(String, DateTime<Utc>)>,
}

fn default_true() -> bool {
  true
}

fn default_repeat() -> u32 {
  DEFAULT_ALERT_REPEAT
}

/// Política del equipo que llega de la interfaz (`team_policy_set`).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamPolicy {
  pub allow_hidden_apps: bool,
  #[serde(default = "default_true")]
  pub alert_not_allowed: bool,
  #[serde(default = "default_repeat")]
  pub alert_repeat_minutes: u32,
}

/// Aviso para mostrar como notificación: la persona está en un sitio que su equipo no permite.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Alert {
  pub domain: String,
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

/// Reglas del equipo (de `classification_rules`) validadas antes de usarlas en el clasificador.
fn parse_team_rules(json: &str) -> Result<Vec<Rule>> {
  let rules: Vec<Rule> = serde_json::from_str(json).map_err(|_| "Las reglas del equipo no tienen el formato esperado.".to_string())?;
  if rules.len() > MAX_TEAM_RULES {
    return Err(format!("El equipo puede tener hasta {MAX_TEAM_RULES} reglas."));
  }
  for r in &rules {
    let len = r.pattern.chars().count();
    if !(1..=120).contains(&len) || r.pattern != r.pattern.to_lowercase() {
      return Err("Cada regla necesita un patrón en minúsculas de 1 a 120 caracteres.".into());
    }
    if r.kind == classifier::MatchKind::Domain && !r.pattern.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
      return Err("Una regla de dominio solo lleva el dominio, sin rutas, por ejemplo youtube.com.".into());
    }
    if !matches!(r.category, Category::Productive | Category::Neutral | Category::Distraction | Category::Ai) {
      return Err("Una regla solo puede asignar productivo, neutro, distracción o IA.".into());
    }
    if r.ai_tool.is_some() && r.category != Category::Ai {
      return Err("Solo las reglas de IA llevan herramienta de IA.".into());
    }
  }
  Ok(rules)
}

fn to_hex(bytes: &[u8]) -> String {
  bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn from_hex(s: &str) -> Option<Vec<u8>> {
  if !s.len().is_multiple_of(2) {
    return None;
  }
  (0..s.len()).step_by(2).map(|i| u8::from_str_radix(s.get(i..i + 2)?, 16).ok()).collect()
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
      team_id: self.active_team.clone(),
      domain: d.domain.clone(),
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

  /// Observación, si es un sitio no permitido y si se usa sin teclado.
  fn observe(&self, w: &ActiveWindow) -> (Observation, bool, bool) {
    // ADR-0009: si el equipo no permite apps ocultas, la lista personal no se aplica.
    let hidden = self.allow_hidden && self.settings.hidden_apps.iter().any(|a| a.eq_ignore_ascii_case(&w.process));
    if hidden {
      // AC-20: una app oculta no se clasifica (ni por proceso, título ni dominio): siempre neutral.
      return (
        Observation { app_name: HIDDEN_APP_NAME.to_string(), title: None, category: Category::Neutral, ai_tool: None, domain: None },
        false,
        false,
      );
    }
    let c = classifier::classify(&self.team_rules, &self.default_rules, &w.process, &w.title, w.domain.as_deref());
    let not_allowed = c.not_allowed && w.domain.is_some();
    (
      Observation {
        app_name: w.process.clone(),
        title: Some(w.title.clone()).filter(|t| !t.is_empty()),
        category: c.category,
        ai_tool: c.ai_tool,
        domain: w.domain.clone(),
      },
      not_allowed,
      c.keep_active,
    )
  }

  /// Decide si hay que avisar: al entrar a un sitio no permitido y luego cada `alert_repeat_minutes`
  /// (0 = solo al entrar). Al salir del sitio se olvida el aviso, para avisar de nuevo al volver.
  fn alert_for(&mut self, now: DateTime<Utc>, obs: Option<&Observation>, not_allowed: bool) -> Option<Alert> {
    let domain = match obs.and_then(|o| o.domain.clone()) {
      Some(d) if not_allowed && self.alert_enabled => d,
      _ => {
        self.last_alert = None;
        return None;
      }
    };
    let due = match &self.last_alert {
      Some((last, at)) if *last == domain => {
        self.alert_repeat_minutes > 0 && now - *at >= Duration::minutes(i64::from(self.alert_repeat_minutes))
      }
      _ => true,
    };
    if !due {
      return None;
    }
    self.last_alert = Some((domain.clone(), now));
    Some(Alert { domain })
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
    let mut engine = Engine::new();
    engine.set_floor(store.latest_block_end()?);
    let mut store = store;
    let active_team = store.setting_get(KEY_ACTIVE_TEAM)?;
    // ADR-0013: la última cuenta con sesión sigue marcando las filas hasta que la interfaz diga otra cosa.
    store.set_user(store.setting_get(KEY_ACTIVE_USER)?);
    // Reglas guardadas la última vez: sin red, el clasificador sigue usándolas.
    let team_rules = store.setting_get(KEY_TEAM_RULES)?.and_then(|j| parse_team_rules(&j).ok()).unwrap_or_default();
    let allow_hidden = store.setting_get(KEY_ALLOW_HIDDEN)?.is_none_or(|v| v != "false");
    let alert_enabled = store.setting_get(KEY_ALERT)?.is_none_or(|v| v != "false");
    let alert_repeat_minutes = store
      .setting_get(KEY_ALERT_REPEAT)?
      .and_then(|v| v.parse::<u32>().ok())
      .filter(|m| ALERT_REPEATS.contains(m))
      .unwrap_or(DEFAULT_ALERT_REPEAT);
    Ok(Self {
      inner: Mutex::new(Inner {
        store,
        cipher,
        default_rules: classifier::default_rules(),
        team_rules,
        engine,
        pause_until: None,
        on_break: false,
        pending: HashMap::new(),
        last_flush: None,
        settings,
        stopped: false,
        active_team,
        entry_versions: HashMap::new(),
        allow_hidden,
        alert_enabled,
        alert_repeat_minutes,
        last_alert: None,
      }),
    })
  }

  /// Al arrancar: si Pulso estuvo cerrado más de 2 minutos desde el último bloque, guarda el hueco
  /// como cierre (A-1). La interfaz decide si cae dentro de la jornada antes de subirlo.
  /// Se llama una vez, antes de que el sensor empiece a escribir.
  pub fn record_closure_since_last_run(&self, now: DateTime<Utc>) -> Result<Option<String>> {
    let g = self.lock()?;
    let Some(last) = g.store.latest_block_end()? else {
      return Ok(None);
    };
    if now - last <= CLOSURE_MIN_GAP {
      return Ok(None);
    }
    let id = Uuid::new_v4().to_string();
    g.store.insert_closure(&Closure { id: id.clone(), team_id: g.active_team.clone(), closed_at: last, reopened_at: now })?;
    Ok(Some(id))
  }

  fn lock(&self) -> Result<MutexGuard<'_, Inner>> {
    self.inner.lock().map_err(|_| "El estado interno quedó inconsistente; reinicia Pulso.".to_string())
  }

  /// Una lectura del sensor (cada ~2 s). Vuelca a disco cada 10 s. Devuelve un aviso si la persona
  /// está en un sitio no permitido y toca avisar (ADR-0010).
  pub fn tick(&self, now: DateTime<Utc>, window: Option<ActiveWindow>, idle_secs: Option<u64>) -> Result<Option<Alert>> {
    let mut g = self.lock()?;
    if g.stopped {
      return Ok(None);
    }
    let mode = g.mode(now);
    // ADR-0012: mirar Pulso no es trabajo. Su ventana no crea bloques: el bloque anterior se cierra aquí y
    // el siguiente empieza al volver a otra app. Así el tiempo no se le asigna a «pulso».
    if mode == Mode::Tracking && window.as_ref().is_some_and(|w| w.process.eq_ignore_ascii_case(OWN_PROCESS)) {
      g.last_alert = None;
      let changes = g.engine.close_open(now);
      g.record(changes);
      if g.last_flush.is_none_or(|t| now - t >= FLUSH_EVERY) {
        g.flush(now)?;
      }
      return Ok(None);
    }
    let seen = if mode == Mode::Tracking { window.as_ref().map(|w| g.observe(w)) } else { None };
    let not_allowed = seen.as_ref().is_some_and(|(_, n, _)| *n);
    let keep_active = seen.as_ref().is_some_and(|(_, _, k)| *k);
    let obs = seen.map(|(o, _, _)| o);
    // Leer o estar en una reunión no usa teclado: con esas apps delante el umbral sube a 30 min (ADR-0013).
    let thr = if keep_active { g.idle_threshold().max(KEEP_ACTIVE_IDLE_SECS) } else { g.idle_threshold() };
    // Sin uso de teclado ni ratón por encima del umbral no se avisa: la persona no está ahí.
    let idle = idle_secs.unwrap_or(0) >= thr;
    let alert = g.alert_for(now, obs.as_ref().filter(|_| !idle), not_allowed);
    let changes = g.engine.tick(now, obs.as_ref(), idle_secs.unwrap_or(0), mode, thr);
    g.record(changes);
    if g.last_flush.is_none_or(|t| now - t >= FLUSH_EVERY) {
      g.flush(now)?;
    }
    Ok(alert)
  }

  /// Al cerrar la app: cierra el bloque abierto, vuelca todo y deja de registrar para siempre.
  /// Se puede llamar varias veces; solo la primera hace algo.
  pub fn shutdown(&self, now: DateTime<Utc>) -> Result<()> {
    let mut g = self.lock()?;
    if g.stopped {
      return Ok(());
    }
    g.stopped = true;
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
    let team = g.active_team.clone();
    g.store.timer_start(now, task_id, team.as_deref())?;
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
    let g = self.lock()?;
    let e = g.store.time_entry_add(parse_ts(start)?, parse_ts(end)?, task_id, g.active_team.as_deref(), now)?;
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

  // ---- Equipo activo y sincronización (F2) ----

  /// Fija el equipo y la cuenta de las filas nuevas (ADR-0007, ADR-0013). Cierra el bloque abierto para
  /// que ningún bloque quede repartido entre dos equipos o dos cuentas. `None` en el equipo: no se sube nada
  /// nuevo; `None` en la cuenta: sin sesión.
  pub fn active_team_set(&self, now: DateTime<Utc>, team_id: Option<&str>, user_id: Option<&str>) -> Result<()> {
    for id in [team_id, user_id].into_iter().flatten() {
      Uuid::parse_str(id).map_err(|_| "Identificador inválido.".to_string())?;
    }
    let mut g = self.lock()?;
    if g.active_team.as_deref() == team_id && g.store.user() == user_id {
      return Ok(());
    }
    let changes = g.engine.close_open(now);
    g.record(changes);
    g.flush(now)?;
    for (key, value) in [(KEY_ACTIVE_TEAM, team_id), (KEY_ACTIVE_USER, user_id)] {
      match value {
        Some(v) => g.store.setting_set(key, v)?,
        None => g.store.setting_delete(key)?,
      }
    }
    g.active_team = team_id.map(String::from);
    g.store.set_user(user_id.map(String::from));
    g.entry_versions.clear();
    Ok(())
  }

  /// Registros del equipo activo sin subir, **sin títulos**. Solo bloques cerrados hace más de 2 min.
  pub fn sync_pending(&self, now: DateTime<Utc>, limit: u32) -> Result<SyncBatch> {
    if !(1..=SYNC_MAX_LIMIT).contains(&limit) {
      return Err(format!("El lote debe tener entre 1 y {SYNC_MAX_LIMIT} registros."));
    }
    let mut g = self.lock()?;
    g.flush(now)?;
    // Sin equipo o sin cuenta no se entrega nada (ADR-0007, ADR-0013).
    let Some(team) = g.active_team.clone().filter(|_| g.store.user().is_some()) else {
      return Ok(SyncBatch::default());
    };
    let limit = limit as usize;
    let blocks = g.store.pending_blocks(&team, now - SYNC_STABLE_AFTER, limit)?;
    let entries = g.store.pending_entries(&team, limit)?;
    let closures = g.store.pending_closures(&team, limit)?;
    g.entry_versions = entries.iter().map(|e| (e.id.clone(), e.updated_at)).collect();
    Ok(SyncBatch {
      blocks,
      entries,
      closures,
    })
  }

  /// Marca como subidos los ids que Supabase aceptó. `kind`: "blocks", "entries" o "closures".
  pub fn sync_mark_synced(&self, now: DateTime<Utc>, kind: &str, ids: &[String]) -> Result<()> {
    let kind = SyncKind::parse(kind).ok_or_else(|| format!("Tipo de registro desconocido: «{kind}»."))?;
    let g = self.lock()?;
    g.store.mark_synced(kind, ids, &g.entry_versions, now)?;
    Ok(())
  }

  /// Reglas de clasificación del equipo activo. Se guardan para seguir usándolas sin red.
  pub fn rules_set(&self, json: &str) -> Result<()> {
    let rules = parse_team_rules(json)?;
    let mut g = self.lock()?;
    g.store.setting_set(KEY_TEAM_RULES, json)?;
    g.team_rules = rules;
    Ok(())
  }

  /// Política del equipo activo (ADR-0009). Se guarda para aplicarla también sin red.
  pub fn team_policy_set(&self, policy: TeamPolicy) -> Result<()> {
    if !ALERT_REPEATS.contains(&policy.alert_repeat_minutes) {
      return Err("La repetición del aviso debe ser 0, 2, 5, 10, 15 o 30 minutos.".into());
    }
    let mut g = self.lock()?;
    g.store.setting_set(KEY_ALLOW_HIDDEN, if policy.allow_hidden_apps { "true" } else { "false" })?;
    g.store.setting_set(KEY_ALERT, if policy.alert_not_allowed { "true" } else { "false" })?;
    g.store.setting_set(KEY_ALERT_REPEAT, &policy.alert_repeat_minutes.to_string())?;
    g.allow_hidden = policy.allow_hidden_apps;
    g.alert_enabled = policy.alert_not_allowed;
    g.alert_repeat_minutes = policy.alert_repeat_minutes;
    Ok(())
  }

  // ---- Sesión de Supabase (F2, PS-08) ----
  // El almacén de credenciales de Windows limita cada secreto a 2560 bytes y una sesión de Supabase
  // lo supera. Se guarda cifrada (AES-GCM) con la clave que sí vive en el almacén seguro.

  pub fn session_get(&self) -> Result<Option<String>> {
    let g = self.lock()?;
    let Some(hex) = g.store.setting_get(KEY_SESSION)? else {
      return Ok(None);
    };
    // Una sesión ilegible (clave cambiada o dato dañado) equivale a no tener sesión.
    Ok(from_hex(&hex).and_then(|enc| g.cipher.decrypt(&enc).ok()))
  }

  pub fn session_set(&self, json: &str) -> Result<()> {
    if json.len() > MAX_SESSION_BYTES {
      return Err("La sesión es demasiado grande.".into());
    }
    let g = self.lock()?;
    let enc = g.cipher.encrypt(json)?;
    g.store.setting_set(KEY_SESSION, &to_hex(&enc))
  }

  pub fn session_clear(&self) -> Result<()> {
    self.lock()?.store.setting_delete(KEY_SESSION)
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::FixedOffset;

  fn tracker() -> Tracker {
    Tracker::new(Store::open_in_memory().unwrap(), TitleCipher::new(&TitleCipher::generate_key())).unwrap()
  }

  fn at(h: u32, m: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 5, h, m, s).unwrap()
  }

  fn win(process: &str, title: &str) -> Option<ActiveWindow> {
    Some(ActiveWindow { process: process.into(), title: title.into(), domain: None })
  }

  fn site(title: &str, domain: &str) -> Option<ActiveWindow> {
    Some(ActiveWindow { process: "brave".into(), title: title.into(), domain: Some(domain.into()) })
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
  fn hidden_app_is_always_neutral_and_not_retroactive() {
    // AC-20: sin importar la categoría que le daría el clasificador; el tiempo cuenta en la jornada;
    // solo desde que se activa, no hacia atrás; se compara sin distinguir mayúsculas.
    let t = tracker();
    feed(&t, 0, 20, win("Code", "main.rs")); // productiva, aún visible
    t.settings_set(SettingsPatch { hidden_apps: Some(vec!["code".into(), "chrome".into()]), ..Default::default() }).unwrap();
    feed(&t, 22, 40, win("Code", "main.rs"));
    feed(&t, 42, 60, win("chrome", "ChatGPT - Google Chrome")); // se clasificaría como IA
    let d = day(&t, at(12, 1, 1));
    let kinds: Vec<_> = d.blocks.iter().map(|b| (b.app_name.as_str(), b.category)).collect();
    assert_eq!(kinds, [("Code", Category::Productive), ("App oculta", Category::Neutral)], "{kinds:?}");
    assert!(d.blocks.iter().all(|b| b.ai_tool.is_none()));
    assert_eq!(d.blocks[1].title, None);
    assert_eq!(d.totals["ai"], 0);
    assert!(d.totals["neutral"] >= 36, "cuenta como tiempo de trabajo");
    assert!(d.workday_start.is_some());
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
  fn a_new_session_does_not_overlap_the_previous_one() {
    // Reproduce el fallo visto con la app real: se reabre con el equipo ya inactivo.
    let store = Store::open_in_memory().unwrap();
    store
      .insert_block(&BlockRow {
        id: Uuid::new_v4().to_string(),
        started_at: at(11, 50, 0),
        ended_at: at(12, 0, 0),
        app_name: "code".into(),
        title_enc: None,
        category: Category::Productive,
        ai_tool: None,
        team_id: None,
        domain: None,
      })
      .unwrap();
    let t = Tracker::new(store, TitleCipher::new(&TitleCipher::generate_key())).unwrap();
    t.tick(at(12, 10, 0), win("code", "a.rs"), Some(900)).unwrap(); // sin uso desde 11:55
    let d = day(&t, at(12, 10, 1));
    assert_eq!(d.blocks.len(), 2);
    assert_eq!(d.blocks[1].category, Category::Idle);
    assert_eq!(d.blocks[1].started_at, "2026-10-05T12:00:00Z", "empieza donde acabó la sesión anterior");
  }

  #[test]
  fn nothing_is_recorded_after_shutdown() {
    // Cerrar Pulso detiene el registro aunque el proceso tarde en terminar (fallo visto en la app real).
    let t = tracker();
    feed(&t, 0, 10, win("code", "a.rs"));
    t.shutdown(at(12, 0, 11)).unwrap();
    feed(&t, 12, 120, win("chrome", "Correo"));
    t.shutdown(at(12, 2, 1)).unwrap(); // una segunda llamada no hace nada
    let g = t.inner.lock().unwrap();
    let rows = g.store.blocks_between(at(0, 0, 0), at(23, 0, 0)).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].app_name, "code");
    assert_eq!(rows[0].ended_at, at(12, 0, 11));
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

  // ---- F2: equipo activo, sincronización, reglas, sesión y cierres ----

  const TEAM: &str = "11111111-1111-4111-8111-111111111111";
  const OTHER: &str = "22222222-2222-4222-8222-222222222222";
  const ANA: &str = "33333333-3333-4333-8333-333333333333";
  const BETO: &str = "44444444-4444-4444-8444-444444444444";

  #[test]
  fn changing_account_closes_the_block_and_the_next_account_does_not_upload_it() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    feed(&t, 0, 30, win("code", "a.rs"));
    // Ana cierra sesión y entra Beto en el mismo equipo de cómputo.
    t.active_team_set(at(12, 0, 31), None, None).unwrap();
    t.active_team_set(at(12, 0, 32), Some(TEAM), Some(BETO)).unwrap();
    feed(&t, 34, 60, win("brave", "Docs"));
    t.shutdown(at(12, 1, 1)).unwrap();
    let batch = t.sync_pending(at(13, 0, 0), 200).unwrap();
    assert!(batch.blocks.iter().all(|b| b.app_name == "brave"), "Beto no sube lo de Ana: {:?}", batch.blocks);
    // Y su Mi día no muestra lo de Ana.
    let d = day(&t, at(13, 0, 1));
    assert!(d.blocks.iter().all(|b| b.app_name != "code"));
  }

  #[test]
  fn without_an_account_nothing_is_pending() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), None).unwrap();
    feed(&t, 0, 30, win("code", "a.rs"));
    t.shutdown(at(12, 0, 31)).unwrap();
    assert!(t.sync_pending(at(13, 0, 0), 200).unwrap().blocks.is_empty());
  }

  #[test]
  fn without_an_active_team_nothing_is_pending() {
    // AC-20: lo registrado sin equipo nunca se sube.
    let t = tracker();
    feed(&t, 0, 30, win("code", "a.rs"));
    t.shutdown(at(12, 0, 31)).unwrap();
    let batch = t.sync_pending(at(13, 0, 0), 200).unwrap();
    assert_eq!(batch, SyncBatch::default());
  }

  #[test]
  fn the_sync_batch_never_carries_window_titles() {
    // AC-18: ni el título en claro ni cifrado salen en el lote.
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    feed(&t, 0, 30, win("chrome", "Propuesta Cliente Secreto - ChatGPT"));
    t.time_entry_add(at(12, 1, 0), "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", None).unwrap();
    t.shutdown(at(12, 0, 31)).unwrap();
    let batch = t.sync_pending(at(13, 0, 0), 200).unwrap();
    assert_eq!(batch.blocks.len(), 1);
    assert_eq!(batch.blocks[0].category, Category::Ai);
    assert_eq!(batch.blocks[0].team_id, TEAM);
    assert_eq!(batch.entries.len(), 1);
    // El formato que valida la interfaz (contract.ts): camelCase, categoría en minúsculas y fechas con «Z».
    let raw = serde_json::to_string(&batch).unwrap();
    assert!(raw.contains(r#""teamId":"11111111-1111-4111-8111-111111111111""#), "{raw}");
    assert!(raw.contains(r#""category":"ai""#) && raw.contains(r#""source":"manual""#), "{raw}");
    assert!(raw.contains(r#""startedAt":"2026-10-05T12:00:00Z""#), "{raw}");
    let json = raw.to_lowercase();
    assert!(!json.contains("propuesta"), "el título no puede salir: {json}");
    assert!(!json.contains("secreto"));
    assert!(!json.contains("title"));
  }

  #[test]
  fn a_block_is_uploaded_15s_after_it_starts_even_if_still_open() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    feed(&t, 0, 10, win("code", "a.rs"));
    // Empezó hace menos de 15 s: todavía puede fusionarse, no se entrega.
    assert!(t.sync_pending(at(12, 0, 10), 200).unwrap().blocks.is_empty());
    feed(&t, 12, 30, win("code", "a.rs"));
    // Sigue abierto, pero ya empezó hace más de 15 s: se entrega con el tiempo hasta la última lectura.
    let batch = t.sync_pending(at(12, 0, 31), 200).unwrap();
    assert_eq!(batch.blocks.len(), 1);
    assert_eq!(batch.blocks[0].ended_at, at(12, 0, 30));
  }

  #[test]
  fn marking_synced_removes_rows_from_pending() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    t.time_entry_add(at(12, 0, 0), "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", None).unwrap();
    let batch = t.sync_pending(at(12, 0, 1), 200).unwrap();
    let ids: Vec<String> = batch.entries.iter().map(|e| e.id.clone()).collect();
    t.sync_mark_synced(at(12, 0, 2), "entries", &ids).unwrap();
    assert!(t.sync_pending(at(12, 0, 3), 200).unwrap().entries.is_empty());
    assert!(t.sync_mark_synced(at(12, 0, 4), "titulos", &ids).is_err());
    assert!(t.sync_pending(at(12, 0, 5), 0).is_err());
  }

  #[test]
  fn changing_team_closes_the_open_block_and_keeps_rows_in_their_team() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    feed(&t, 0, 30, win("code", "a.rs"));
    t.active_team_set(at(12, 0, 31), Some(OTHER), Some(ANA)).unwrap();
    feed(&t, 32, 90, win("code", "a.rs"));
    t.shutdown(at(12, 1, 31)).unwrap();
    let first = t.sync_pending(at(13, 0, 0), 200).unwrap();
    assert!(!first.blocks.is_empty());
    assert!(first.blocks.iter().all(|b| b.team_id == OTHER));
    t.active_team_set(at(13, 0, 1), Some(TEAM), Some(ANA)).unwrap();
    let back = t.sync_pending(at(13, 0, 2), 200).unwrap();
    assert!(!back.blocks.is_empty());
    assert!(back.blocks.iter().all(|b| b.team_id == TEAM));
    assert!(t.active_team_set(at(13, 0, 3), Some("no-es-uuid"), Some(ANA)).is_err());
  }

  #[test]
  fn the_active_team_survives_a_restart() {
    let dir = std::env::temp_dir().join(format!("pulso-test-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("pulso.db");
    let key = TitleCipher::generate_key();
    {
      let t = Tracker::new(Store::open(&path).unwrap(), TitleCipher::new(&key)).unwrap();
      t.active_team_set(at(12, 0, 0), Some(TEAM), Some(ANA)).unwrap();
    }
    let t = Tracker::new(Store::open(&path).unwrap(), TitleCipher::new(&key)).unwrap();
    t.time_entry_add(at(12, 1, 0), "2026-10-05T10:00:00Z", "2026-10-05T11:00:00Z", None).unwrap();
    assert_eq!(t.sync_pending(at(12, 1, 1), 200).unwrap().entries[0].team_id, TEAM);
    drop(t);
    let _ = std::fs::remove_dir_all(&dir);
  }

  #[test]
  fn team_rules_apply_before_defaults_and_are_validated() {
    let t = tracker();
    t.rules_set(r#"[{"match":"process","pattern":"code","category":"distraction","ai_tool":null}]"#).unwrap();
    feed(&t, 0, 20, win("code", "a.rs"));
    let d = day(&t, at(12, 1, 0));
    assert_eq!(d.blocks[0].category, Category::Distraction);
    assert!(t.rules_set(r#"[{"match":"process","pattern":"Code","category":"neutral","ai_tool":null}]"#).is_err(), "mayúsculas");
    assert!(t.rules_set(r#"[{"match":"process","pattern":"x","category":"idle","ai_tool":null}]"#).is_err(), "categoría");
    assert!(t.rules_set(r#"[{"match":"title","pattern":"x","category":"neutral","ai_tool":"ChatGPT"}]"#).is_err(), "herramienta");
    assert!(t.rules_set("no es json").is_err());
  }

  #[test]
  fn session_is_stored_encrypted_and_can_be_cleared() {
    let t = tracker();
    assert_eq!(t.session_get().unwrap(), None);
    let session = r#"{"access_token":"eyJ-token-secreto","refresh_token":"r1"}"#;
    t.session_set(session).unwrap();
    assert_eq!(t.session_get().unwrap().as_deref(), Some(session));
    {
      let g = t.inner.lock().unwrap();
      let raw = g.store.setting_get(KEY_SESSION).unwrap().unwrap();
      assert!(!raw.contains("token"), "la sesión no queda en texto plano");
    }
    t.session_clear().unwrap();
    assert_eq!(t.session_get().unwrap(), None);
    assert!(t.session_set(&"x".repeat(MAX_SESSION_BYTES + 1)).is_err());
  }

  #[test]
  fn a_gap_since_the_last_run_is_recorded_as_a_closure() {
    // AC-22 (parte de Rust): el hueco se guarda con el equipo activo y se entrega para subir.
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    feed(&t, 0, 30, win("code", "a.rs"));
    t.shutdown(at(12, 0, 31)).unwrap();
    let t2 = {
      let g = t.inner.into_inner().unwrap();
      Tracker::new(g.store, g.cipher).unwrap()
    };
    assert!(t2.record_closure_since_last_run(at(12, 1, 0)).unwrap().is_none(), "menos de 2 min: no es cierre");
    assert!(t2.record_closure_since_last_run(at(14, 0, 0)).unwrap().is_some());
    let batch = t2.sync_pending(at(14, 0, 1), 200).unwrap();
    assert_eq!(batch.closures.len(), 1);
    assert_eq!(batch.closures[0].closed_at, at(12, 0, 31));
    assert_eq!(batch.closures[0].reopened_at, at(14, 0, 0));
  }

  // ---- ADR-0009: dominio y política de apps ocultas ----

  #[test]
  fn a_change_of_site_opens_a_new_block_and_ai_sites_are_classified() {
    let t = tracker();
    feed(&t, 0, 20, site("Buscar algo", "perplexity.ai"));
    feed(&t, 22, 40, site("Video", "youtube.com"));
    let d = day(&t, at(12, 1, 0));
    assert_eq!(d.blocks.len(), 2);
    assert_eq!(d.blocks[0].domain.as_deref(), Some("perplexity.ai"));
    assert_eq!(d.blocks[0].category, Category::Ai);
    assert_eq!(d.blocks[0].ai_tool.as_deref(), Some("Perplexity"));
    assert_eq!(d.blocks[1].domain.as_deref(), Some("youtube.com"));
  }

  #[test]
  fn the_sync_batch_carries_the_domain_but_never_a_path() {
    let t = tracker();
    t.active_team_set(at(11, 59, 0), Some(TEAM), Some(ANA)).unwrap();
    // El sensor ya entrega solo el dominio (host_of); aquí se comprueba que nada más llega al lote.
    feed(&t, 0, 30, site("Resultado secreto - Perplexity", "perplexity.ai"));
    t.shutdown(at(12, 0, 31)).unwrap();
    let batch = t.sync_pending(at(13, 0, 0), 200).unwrap();
    assert_eq!(batch.blocks[0].domain.as_deref(), Some("perplexity.ai"));
    let json = serde_json::to_string(&batch).unwrap();
    assert!(!json.contains("perplexity.ai/"), "sin rutas: {json}");
    assert!(!json.to_lowercase().contains("secreto"));
  }

  #[test]
  fn a_hidden_app_has_no_domain() {
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: None, hidden_apps: Some(vec!["brave".into()]) }).unwrap();
    feed(&t, 0, 20, site("Correo", "mail.google.com"));
    let d = day(&t, at(12, 1, 0));
    assert_eq!(d.blocks[0].app_name, HIDDEN_APP_NAME);
    assert_eq!(d.blocks[0].domain, None);
  }

  #[test]
  fn when_the_team_forbids_hidden_apps_the_real_name_is_recorded() {
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: None, hidden_apps: Some(vec!["windowsterminal".into()]) }).unwrap();
    t.team_policy_set(TeamPolicy { allow_hidden_apps: false, alert_not_allowed: true, alert_repeat_minutes: 10 }).unwrap();
    feed(&t, 0, 20, win("WindowsTerminal", "pwsh"));
    let d = day(&t, at(12, 1, 0));
    assert_eq!(d.blocks[0].app_name, "WindowsTerminal");
    // Al volver a permitirlas, se ocultan de nuevo desde ese momento.
    t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: true, alert_repeat_minutes: 10 }).unwrap();
    feed(&t, 22, 40, win("WindowsTerminal", "pwsh"));
    let d = day(&t, at(12, 1, 0));
    assert_eq!(d.blocks.last().unwrap().app_name, HIDDEN_APP_NAME);
  }

  #[test]
  fn domain_rules_from_the_team_are_validated() {
    let t = tracker();
    assert!(t.rules_set(r#"[{"match":"domain","pattern":"youtube.com","category":"distraction","ai_tool":null}]"#).is_ok());
    assert!(t.rules_set(r#"[{"match":"domain","pattern":"youtube.com/shorts","category":"distraction","ai_tool":null}]"#).is_err());
  }

  // ---- ADR-0013: apps «sin teclado» ----

  /// Lecturas cada 2 s con la misma ventana y SIN teclado ni ratón desde `from` (segundos desde las 12:00).
  fn feed_without_input(t: &Tracker, from: u32, to: u32, w: Option<ActiveWindow>) {
    let mut s = from;
    while s <= to {
      t.tick(at(12 + s / 3600, (s / 60) % 60, s % 60), w.clone(), Some(u64::from(s - from))).unwrap();
      s += 2;
    }
  }

  #[test]
  fn reading_in_readest_without_keyboard_is_not_idle_until_30_minutes() {
    // 20 min leyendo sin tocar nada (umbral personal de 3 min): sigue siendo Readest.
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: Some(3), hidden_apps: None }).unwrap();
    feed_without_input(&t, 0, 20 * 60, win("readest", "Libro"));
    let d = day(&t, at(12, 21, 0));
    assert_eq!(d.blocks.len(), 1, "{:?}", d.blocks);
    assert_eq!(d.blocks[0].app_name, "readest");
    assert_eq!(d.totals["idle"], 0);
    // 32 min sin tocar nada: pasados los 30, sí es inactividad.
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: Some(3), hidden_apps: None }).unwrap();
    feed_without_input(&t, 0, 32 * 60, win("readest", "Libro"));
    let d = day(&t, at(12, 33, 0));
    assert!(d.totals["idle"] > 0);
  }

  #[test]
  fn other_apps_keep_the_normal_threshold() {
    let t = tracker();
    t.settings_set(SettingsPatch { idle_minutes: Some(3), hidden_apps: None }).unwrap();
    feed_without_input(&t, 0, 5 * 60, win("code", "main.rs"));
    let d = day(&t, at(12, 6, 0));
    assert!(d.totals["idle"] > 0, "5 min sin teclado en VS Code es inactividad con umbral de 3 min");
  }

  // ---- ADR-0012: Pulso no se registra a sí mismo ----

  #[test]
  fn looking_at_pulso_creates_no_block_and_splits_the_app_in_two() {
    let t = tracker();
    feed(&t, 0, 20, win("brave", "Docs"));
    feed(&t, 22, 40, win("pulso", "Pulso"));
    feed(&t, 42, 60, win("brave", "Docs"));
    t.shutdown(at(12, 1, 1)).unwrap();
    let d = day(&t, at(12, 2, 0));
    assert!(d.blocks.iter().all(|b| b.app_name != "pulso"), "Pulso no es una app más: {:?}", d.blocks);
    assert_eq!(d.blocks.len(), 2);
    // El tiempo con Pulso delante no se cuenta para nadie: ni para Pulso ni para Brave.
    // Brave tuvo 20 s antes y 18 s después (más ~2 s de lectura en cada cambio); los 20 s de Pulso no cuentan.
    let counted: i64 = d.totals.values().sum();
    assert!((36..=44).contains(&counted), "se contaron {counted} s");
    assert!(d.blocks[0].ended_at <= d.blocks[1].started_at);
  }

  #[test]
  fn no_alert_while_looking_at_pulso_and_it_alerts_again_after_coming_back() {
    let t = tracker();
    t.rules_set(NOT_ALLOWED_YOUTUBE).unwrap();
    t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: true, alert_repeat_minutes: 0 }).unwrap();
    assert_eq!(alerts(&t, 0, 20, site("Video", "youtube.com")), vec![0]);
    assert!(alerts(&t, 22, 40, win("pulso", "Pulso")).is_empty());
    assert_eq!(alerts(&t, 42, 60, site("Video", "youtube.com")), vec![42]);
  }

  // ---- ADR-0010: avisos de sitio no permitido ----

  const NOT_ALLOWED_YOUTUBE: &str = r#"[{"match":"domain","pattern":"youtube.com","category":"distraction","ai_tool":null,"not_allowed":true}]"#;

  /// Lecturas cada 2 s en un sitio; devuelve los segundos (desde 12:00:00) en que hubo aviso.
  fn alerts(t: &Tracker, from: u32, to: u32, w: Option<ActiveWindow>) -> Vec<u32> {
    let mut out = Vec::new();
    let mut s = from;
    while s <= to {
      if t.tick(at(12 + s / 3600, (s / 60) % 60, s % 60), w.clone(), Some(0)).unwrap().is_some() {
        out.push(s);
      }
      s += 2;
    }
    out
  }

  #[test]
  fn alerts_when_entering_a_not_allowed_site_and_repeats_as_configured() {
    let t = tracker();
    t.rules_set(NOT_ALLOWED_YOUTUBE).unwrap();
    t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: true, alert_repeat_minutes: 2 }).unwrap();
    // 5 minutos en YouTube: aviso al entrar, a los 2 y a los 4 minutos.
    assert_eq!(alerts(&t, 0, 300, site("Video", "m.youtube.com")), vec![0, 120, 240]);
    // Sale y vuelve: avisa otra vez al volver.
    assert!(alerts(&t, 302, 320, site("Correo", "mail.google.com")).is_empty());
    assert_eq!(alerts(&t, 322, 330, site("Video", "youtube.com")), vec![322]);
  }

  #[test]
  fn only_on_entry_when_repeat_is_zero_and_never_when_disabled() {
    let t = tracker();
    t.rules_set(NOT_ALLOWED_YOUTUBE).unwrap();
    t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: true, alert_repeat_minutes: 0 }).unwrap();
    assert_eq!(alerts(&t, 0, 600, site("Video", "youtube.com")), vec![0]);
    let t = tracker();
    t.rules_set(NOT_ALLOWED_YOUTUBE).unwrap();
    t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: false, alert_repeat_minutes: 2 }).unwrap();
    assert!(alerts(&t, 0, 300, site("Video", "youtube.com")).is_empty());
  }

  #[test]
  fn no_alert_during_a_privacy_pause_or_for_allowed_sites() {
    let t = tracker();
    t.rules_set(NOT_ALLOWED_YOUTUBE).unwrap();
    // youtube.com sin «no permitido» del equipo: solo distracción por la regla de serie, sin aviso.
    let plain = tracker();
    assert!(alerts(&plain, 0, 60, site("Video", "youtube.com")).is_empty());
    t.privacy_pause(at(12, 0, 0), 15).unwrap();
    assert!(alerts(&t, 0, 60, site("Video", "youtube.com")).is_empty());
  }

  #[test]
  fn an_invalid_repeat_is_rejected() {
    let t = tracker();
    assert!(t.team_policy_set(TeamPolicy { allow_hidden_apps: true, alert_not_allowed: true, alert_repeat_minutes: 7 }).is_err());
  }

  #[test]
  fn no_closure_on_the_very_first_run() {
    let t = tracker();
    assert!(t.record_closure_since_last_run(at(12, 0, 0)).unwrap().is_none());
  }
}
