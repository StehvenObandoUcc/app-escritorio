//! Motor puro del sensor: convierte observaciones cada ~2 s en bloques de actividad.
//! No lee el sistema, no toca disco ni reloj: recibe `now` y devuelve cambios.
//!
//! Reglas (spec F1):
//! - Un bloque es un intervalo continuo con la misma app y categoría (AC-1).
//! - Un bloque de menos de 10 s entre dos de la misma app y categoría se fusiona (AC-2).
//! - Con inactividad >= umbral, el bloque activo se cierra en la última interacción y empieza
//!   uno `idle` (AC-3).
//! - Pausa de privacidad: solo un bloque `paused` de la app "Pulso", sin título (AC-8).
//! - Descanso: un bloque `break` hasta que termina (AC-14).
//! - Cada tick devuelve `Upsert` del bloque abierto: si la app se cierra de golpe, lo escrito
//!   llega hasta el último volcado (AC-4).

use crate::classifier::Category;
use chrono::{DateTime, Duration, Utc};
use uuid::Uuid;

/// Los bloques más cortos que esto se fusionan con sus vecinos si son de la misma app y categoría.
pub const MIN_BLOCK_SECS: i64 = 10;
/// Si pasa más tiempo entre dos lecturas (equipo suspendido), el bloque se cierra en la última.
const MAX_GAP: Duration = Duration::seconds(30);
/// Bloques recientes que se conservan en memoria para poder fusionar.
const KEEP: usize = 3;

pub const PAUSED_APP: &str = "Pulso";
pub const BREAK_APP: &str = "Pulso";
pub const IDLE_APP: &str = "Sin actividad";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Draft {
  pub id: String,
  pub started_at: DateTime<Utc>,
  pub ended_at: DateTime<Utc>,
  pub app_name: String,
  pub title: Option<String>,
  pub category: Category,
  pub ai_tool: Option<String>,
}

impl Draft {
  fn key(&self) -> (&str, Category) {
    (&self.app_name, self.category)
  }

  pub fn secs(&self) -> i64 {
    (self.ended_at - self.started_at).num_seconds()
  }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Change {
  Upsert(Draft),
  Remove(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Mode {
  Tracking,
  Paused,
  Break,
}

/// Lo que se ve en primer plano, ya clasificado.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Observation {
  pub app_name: String,
  pub title: Option<String>,
  pub category: Category,
  pub ai_tool: Option<String>,
}

#[derive(Default)]
pub struct Engine {
  /// Últimos bloques en orden; si `open`, el último sigue abierto.
  tail: Vec<Draft>,
  open: bool,
  last_tick: Option<DateTime<Utc>>,
  /// Nada puede empezar antes de este instante: lo anterior ya está registrado (otra sesión o antes
  /// de una suspensión). Evita que «sin actividad» retroceda sobre bloques existentes.
  floor: Option<DateTime<Utc>>,
}

fn special(app: &str, category: Category) -> Observation {
  Observation { app_name: app.into(), title: None, category, ai_tool: None }
}

impl Engine {
  /// `floor`: fin del último bloque ya guardado (al abrir la app), si lo hay.
  pub fn set_floor(&mut self, floor: Option<DateTime<Utc>>) {
    self.floor = floor;
  }

  pub fn new() -> Self {
    Self::default()
  }

  /// Procesa una lectura. `obs` es `None` si no hubo ventana legible (se mantiene el bloque).
  pub fn tick(
    &mut self,
    now: DateTime<Utc>,
    obs: Option<&Observation>,
    idle_secs: u64,
    mode: Mode,
    idle_threshold_secs: u64,
  ) -> Vec<Change> {
    let mut out = Vec::new();

    if let Some(last) = self.last_tick
      && now - last > MAX_GAP
    {
      self.close_open_at(last, &mut out);
      self.floor = Some(self.floor.map_or(last, |f| f.max(last)));
      self.tail.clear();
    }
    self.last_tick = Some(now);

    let idle = Duration::seconds(idle_secs.min(i64::MAX as u64 / 2) as i64);
    let (desired, at) = match mode {
      Mode::Paused => (Some(special(PAUSED_APP, Category::Paused)), now),
      Mode::Break => (Some(special(BREAK_APP, Category::Break)), now),
      Mode::Tracking if idle_secs >= idle_threshold_secs => {
        (Some(special(IDLE_APP, Category::Idle)), now - idle)
      }
      Mode::Tracking => (obs.cloned(), now),
    };

    let Some(desired) = desired else {
      self.extend_open(now, &mut out);
      return out;
    };

    let same = self.open_draft().is_some_and(|c| c.key() == (desired.app_name.as_str(), desired.category));
    if same {
      self.extend_open(now, &mut out);
    } else {
      let floor = self.open_draft().map_or_else(|| self.floor.unwrap_or(at), |c| c.started_at);
      self.transition(at.max(floor).min(now), now, desired, &mut out);
    }
    out
  }

  /// Cierra el bloque abierto en `now` (fin de pausa o descanso, o cierre de la app).
  pub fn close_open(&mut self, now: DateTime<Utc>) -> Vec<Change> {
    let mut out = Vec::new();
    self.close_open_at(now, &mut out);
    // Lo que sigue empieza desde aquí: una inactividad no puede retroceder sobre el bloque cerrado.
    self.floor = Some(self.floor.map_or(now, |f| f.max(now)));
    out
  }

  fn open_draft(&self) -> Option<&Draft> {
    if self.open { self.tail.last() } else { None }
  }

  fn extend_open(&mut self, now: DateTime<Utc>, out: &mut Vec<Change>) {
    if self.open
      && let Some(cur) = self.tail.last_mut()
    {
      cur.ended_at = now;
      out.push(Change::Upsert(cur.clone()));
    }
  }

  fn close_open_at(&mut self, at: DateTime<Utc>, out: &mut Vec<Change>) {
    if !self.open {
      return;
    }
    self.open = false;
    let Some(mut cur) = self.tail.pop() else { return };
    cur.ended_at = at.max(cur.started_at);
    if cur.secs() <= 0 {
      out.push(Change::Remove(cur.id));
    } else {
      out.push(Change::Upsert(cur.clone()));
      self.tail.push(cur);
    }
  }

  fn transition(&mut self, t: DateTime<Utc>, now: DateTime<Utc>, d: Observation, out: &mut Vec<Change>) {
    self.close_open_at(t, out);

    let key = (d.app_name.as_str(), d.category);
    let n = self.tail.len();

    // El bloque anterior es de la misma app y categoría (p. ej. se descartó uno de duración cero).
    let reopen_prev = n >= 1 && self.tail[n - 1].key() == key && self.tail[n - 1].ended_at == t;
    // Patrón A · S · N: S dura menos de 10 s y A es igual a N → se absorbe S.
    let absorb_short = !reopen_prev
      && n >= 2
      && self.tail[n - 1].secs() < MIN_BLOCK_SECS
      && self.tail[n - 1].ended_at == t
      && self.tail[n - 2].key() == key
      && self.tail[n - 2].ended_at == self.tail[n - 1].started_at;

    if absorb_short {
      let short = self.tail.pop().expect("n >= 2");
      out.push(Change::Remove(short.id));
    }
    if reopen_prev || absorb_short {
      let cur = self.tail.last_mut().expect("hay bloque previo");
      cur.ended_at = now;
      out.push(Change::Upsert(cur.clone()));
    } else {
      let draft = Draft {
        id: Uuid::new_v4().to_string(),
        started_at: t,
        ended_at: now,
        app_name: d.app_name,
        title: d.title,
        category: d.category,
        ai_tool: d.ai_tool,
      };
      out.push(Change::Upsert(draft.clone()));
      self.tail.push(draft);
    }
    self.open = true;

    if self.tail.len() > KEEP {
      self.tail.remove(0);
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::TimeZone;

  const IDLE_LIMIT: u64 = 300;

  fn at(m: u32, s: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 5, 9, m, s).unwrap()
  }

  fn obs(app: &str, category: Category) -> Observation {
    Observation { app_name: app.into(), title: Some(format!("{app} título")), category, ai_tool: None }
  }

  /// Aplica los cambios a un "disco" simulado y lo devuelve ordenado por inicio.
  #[derive(Default)]
  struct Disk(Vec<Draft>);
  impl Disk {
    fn apply(&mut self, changes: Vec<Change>) {
      for c in changes {
        match c {
          Change::Upsert(d) => {
            self.0.retain(|x| x.id != d.id);
            self.0.push(d);
          }
          Change::Remove(id) => self.0.retain(|x| x.id != id),
        }
      }
    }
    fn sorted(&self) -> Vec<Draft> {
      let mut v = self.0.clone();
      v.sort_by_key(|d| d.started_at);
      v
    }
  }

  /// Simula lecturas cada 2 s entre `from` y `to` segundos con la misma observación.
  fn run(e: &mut Engine, disk: &mut Disk, from: u32, to: u32, o: Option<&Observation>, idle: u64) {
    let mut s = from;
    while s <= to {
      disk.apply(e.tick(at(s / 60, s % 60), o, idle, Mode::Tracking, IDLE_LIMIT));
      s += 2;
    }
  }

  #[test]
  fn app_change_closes_and_opens_within_one_tick() {
    // AC-1
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let (a, b) = (obs("code", Category::Productive), obs("chrome", Category::Neutral));
    run(&mut e, &mut d, 0, 30, Some(&a), 0);
    run(&mut e, &mut d, 32, 60, Some(&b), 0);
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].app_name, "code");
    assert_eq!(blocks[0].ended_at, at(0, 32));
    assert_eq!(blocks[1].app_name, "chrome");
    assert_eq!(blocks[1].started_at, at(0, 32));
  }

  #[test]
  fn same_app_keeps_one_block_even_if_title_changes() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let mut a = obs("chrome", Category::Neutral);
    run(&mut e, &mut d, 0, 20, Some(&a), 0);
    a.title = Some("otra pestaña".into());
    run(&mut e, &mut d, 22, 40, Some(&a), 0);
    assert_eq!(d.sorted().len(), 1);
    assert_eq!(d.sorted()[0].ended_at, at(0, 40));
  }

  #[test]
  fn short_block_between_same_app_is_merged() {
    // AC-2: A (30 s) · B (6 s) · A (30 s) → un solo bloque de A
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let (a, b) = (obs("code", Category::Productive), obs("notepad", Category::Neutral));
    run(&mut e, &mut d, 0, 28, Some(&a), 0);
    run(&mut e, &mut d, 30, 34, Some(&b), 0);
    run(&mut e, &mut d, 36, 64, Some(&a), 0);
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 1, "{blocks:#?}");
    assert_eq!(blocks[0].app_name, "code");
    assert_eq!(blocks[0].started_at, at(0, 0));
    assert_eq!(blocks[0].ended_at, at(1, 4));
  }

  #[test]
  fn long_enough_block_between_is_not_merged() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let (a, b) = (obs("code", Category::Productive), obs("notepad", Category::Neutral));
    run(&mut e, &mut d, 0, 28, Some(&a), 0);
    run(&mut e, &mut d, 30, 50, Some(&b), 0);
    run(&mut e, &mut d, 52, 80, Some(&a), 0);
    assert_eq!(d.sorted().len(), 3);
  }

  #[test]
  fn short_block_between_different_apps_is_kept() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let (a, b, c) = (
      obs("code", Category::Productive),
      obs("notepad", Category::Neutral),
      obs("chrome", Category::Neutral),
    );
    run(&mut e, &mut d, 0, 28, Some(&a), 0);
    run(&mut e, &mut d, 30, 34, Some(&b), 0);
    run(&mut e, &mut d, 36, 64, Some(&c), 0);
    assert_eq!(d.sorted().len(), 3);
  }

  #[test]
  fn same_app_different_category_is_a_new_block() {
    // El navegador cambia de categoría cuando el título pasa a ser de una IA.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    run(&mut e, &mut d, 0, 30, Some(&obs("chrome", Category::Neutral)), 0);
    run(&mut e, &mut d, 32, 70, Some(&obs("chrome", Category::Ai)), 0);
    assert_eq!(d.sorted().len(), 2);
  }

  #[test]
  fn idle_closes_active_block_at_last_input() {
    // AC-3: última interacción en 0:30; el umbral (300 s) se cumple en 5:30.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("chrome", Category::Neutral);
    run(&mut e, &mut d, 0, 30, Some(&a), 0);
    let mut s = 32;
    while s <= 400 {
      let idle = (s - 30) as u64;
      d.apply(e.tick(at(s / 60, s % 60), Some(&a), idle, Mode::Tracking, IDLE_LIMIT));
      s += 2;
    }
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 2, "{blocks:#?}");
    assert_eq!(blocks[0].category, Category::Neutral);
    assert_eq!(blocks[0].ended_at, at(0, 30));
    assert_eq!(blocks[1].category, Category::Idle);
    assert_eq!(blocks[1].started_at, at(0, 30));
    assert_eq!(blocks[1].title, None);
  }

  #[test]
  fn activity_after_idle_starts_a_new_block() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("chrome", Category::Neutral);
    run(&mut e, &mut d, 0, 10, Some(&a), 0);
    d.apply(e.tick(at(6, 0), Some(&a), 350, Mode::Tracking, IDLE_LIMIT)); // inactivo desde 0:10
    d.apply(e.tick(at(6, 2), Some(&a), 0, Mode::Tracking, IDLE_LIMIT)); // vuelve a usar el equipo
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 3, "{blocks:#?}");
    assert_eq!(blocks[1].category, Category::Idle);
    assert_eq!(blocks[1].ended_at, at(6, 2));
    assert_eq!(blocks[2].app_name, "chrome");
  }

  #[test]
  fn privacy_pause_writes_only_a_paused_block_without_title() {
    // AC-8
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("outlook", Category::Neutral);
    run(&mut e, &mut d, 0, 20, Some(&a), 0);
    for s in (22..=58).step_by(2) {
      d.apply(e.tick(at(0, s), Some(&a), 0, Mode::Paused, IDLE_LIMIT));
    }
    d.apply(e.close_open(at(1, 0)));
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[1].category, Category::Paused);
    assert_eq!(blocks[1].app_name, "Pulso");
    assert_eq!(blocks[1].title, None);
    assert!(blocks.iter().skip(1).all(|b| b.app_name != "outlook"));
  }

  #[test]
  fn break_closes_current_block_and_opens_break() {
    // AC-14
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    run(&mut e, &mut d, 0, 20, Some(&a), 0);
    for s in (22..=50).step_by(2) {
      d.apply(e.tick(at(0, s), Some(&a), 0, Mode::Break, IDLE_LIMIT));
    }
    d.apply(e.close_open(at(0, 52)));
    run(&mut e, &mut d, 52, 80, Some(&a), 0);
    let blocks = d.sorted();
    let cats: Vec<_> = blocks.iter().map(|b| b.category).collect();
    assert_eq!(cats, [Category::Productive, Category::Break, Category::Productive]);
    assert_eq!(blocks[1].started_at, at(0, 22));
    assert_eq!(blocks[1].ended_at, at(0, 52));
  }

  #[test]
  fn long_gap_closes_block_at_last_reading() {
    // Equipo suspendido: no se inventa actividad durante la suspensión.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    run(&mut e, &mut d, 0, 20, Some(&a), 0);
    d.apply(e.tick(at(30, 0), Some(&a), 0, Mode::Tracking, IDLE_LIMIT));
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 2);
    assert_eq!(blocks[0].ended_at, at(0, 20));
    assert_eq!(blocks[1].started_at, at(30, 0));
  }

  #[test]
  fn missing_window_keeps_current_block() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    run(&mut e, &mut d, 0, 10, Some(&a), 0);
    run(&mut e, &mut d, 12, 20, None, 0);
    run(&mut e, &mut d, 22, 30, Some(&a), 0);
    assert_eq!(d.sorted().len(), 1);
  }

  #[test]
  fn every_tick_persists_the_open_block() {
    // AC-4: tras cualquier tick, el "disco" ya tiene el bloque con su fin al día.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    run(&mut e, &mut d, 0, 40, Some(&a), 0);
    assert_eq!(d.sorted()[0].ended_at, at(0, 40));
  }

  #[test]
  fn idle_after_a_long_gap_does_not_go_back_over_existing_blocks() {
    // Suspensión: el último bloque llegó hasta 0:20. Al despertar el equipo lleva 1 h sin uso.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    run(&mut e, &mut d, 0, 20, Some(&a), 0);
    d.apply(e.tick(at(40, 0), Some(&a), 3000, Mode::Tracking, IDLE_LIMIT));
    let blocks = d.sorted();
    assert_eq!(blocks.len(), 2, "{blocks:#?}");
    assert_eq!(blocks[1].category, Category::Idle);
    assert_eq!(blocks[1].started_at, blocks[0].ended_at, "sin solaparse ni dejar hueco");
  }

  #[test]
  fn idle_at_startup_starts_after_the_floor() {
    // Reinicio de la app: lo guardado llega hasta 0:30; el equipo lleva 10 min sin uso.
    let (mut e, mut d) = (Engine::new(), Disk::default());
    e.set_floor(Some(at(0, 30)));
    d.apply(e.tick(at(10, 0), None, 600, Mode::Tracking, IDLE_LIMIT));
    assert_eq!(d.sorted()[0].started_at, at(0, 30));
  }

  #[test]
  fn idle_after_a_break_or_pause_starts_when_it_ended() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    for s in (0..=20).step_by(2) {
      d.apply(e.tick(at(0, s), Some(&a), 0, Mode::Break, IDLE_LIMIT));
    }
    d.apply(e.close_open(at(0, 22)));
    d.apply(e.tick(at(6, 0), Some(&a), 400, Mode::Tracking, IDLE_LIMIT));
    let blocks = d.sorted();
    assert_eq!(blocks[0].category, Category::Break);
    assert_eq!(blocks[1].category, Category::Idle);
    assert!(blocks[1].started_at >= blocks[0].ended_at);
  }

  #[test]
  fn no_zero_length_blocks_remain() {
    let (mut e, mut d) = (Engine::new(), Disk::default());
    let a = obs("code", Category::Productive);
    d.apply(e.tick(at(0, 0), Some(&a), 0, Mode::Paused, IDLE_LIMIT));
    d.apply(e.close_open(at(0, 0)));
    assert!(d.sorted().is_empty());
  }
}
