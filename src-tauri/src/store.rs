//! Base local (SQLite, modo WAL). Único dueño del archivo: la interfaz nunca ve SQL (D-03).
//! Guarda `title_enc` tal cual: el cifrado lo hace quien llama (ver `crypto`).
//! Las fechas se guardan en ISO 8601 UTC con "Z".

use crate::classifier::Category;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params};
use std::path::Path;
use uuid::Uuid;

pub type Result<T> = std::result::Result<T, String>;

const MAX_ENTRY: Duration = Duration::hours(24);

fn db<E: std::fmt::Display>(e: E) -> String {
  format!("base local: {e}")
}

fn fmt(t: DateTime<Utc>) -> String {
  t.to_rfc3339_opts(SecondsFormat::Secs, true)
}

fn parse(s: &str) -> Result<DateTime<Utc>> {
  DateTime::parse_from_rfc3339(s).map(|t| t.with_timezone(&Utc)).map_err(db)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BlockRow {
  pub id: String,
  pub started_at: DateTime<Utc>,
  pub ended_at: DateTime<Utc>,
  pub app_name: String,
  pub title_enc: Option<Vec<u8>>,
  pub category: Category,
  pub ai_tool: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntrySource {
  Timer,
  Manual,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeEntry {
  pub id: String,
  pub started_at: DateTime<Utc>,
  pub ended_at: Option<DateTime<Utc>>,
  pub task_id: Option<String>,
  pub source: EntrySource,
}

pub struct Store {
  conn: Connection,
}

impl Store {
  pub fn open(path: &Path) -> Result<Self> {
    let conn = Connection::open(path).map_err(db)?;
    conn.pragma_update(None, "journal_mode", "WAL").map_err(db)?;
    Self::init(conn)
  }

  pub fn open_in_memory() -> Result<Self> {
    Self::init(Connection::open_in_memory().map_err(db)?)
  }

  fn init(conn: Connection) -> Result<Self> {
    let store = Self { conn };
    store.migrate()?;
    Ok(store)
  }

  /// Migraciones versionadas con `PRAGMA user_version`. Nunca se edita una ya aplicada.
  fn migrate(&self) -> Result<()> {
    const MIGRATIONS: &[&str] = &[
      "CREATE TABLE activity_blocks_local (
         id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
         app_name TEXT NOT NULL, title_enc BLOB NULL, category TEXT NOT NULL,
         ai_tool TEXT NULL, synced_at TEXT NULL);
       CREATE INDEX idx_blocks_started ON activity_blocks_local(started_at);
       CREATE TABLE time_entries_local (
         id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NULL,
         task_id TEXT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
         deleted_at TEXT NULL, synced_at TEXT NULL);
       CREATE TABLE kv_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    ];
    let current: i64 = self.conn.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(db)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
      self.conn.execute_batch(sql).map_err(db)?;
      self.conn.pragma_update(None, "user_version", i as i64 + 1).map_err(db)?;
    }
    Ok(())
  }

  // ---- Bloques de actividad ----

  pub fn insert_block(&self, b: &BlockRow) -> Result<()> {
    self
      .conn
      .execute(
        "INSERT INTO activity_blocks_local
           (id, started_at, ended_at, app_name, title_enc, category, ai_tool)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![b.id, fmt(b.started_at), fmt(b.ended_at), b.app_name, b.title_enc, b.category.as_str(), b.ai_tool],
      )
      .map_err(db)?;
    Ok(())
  }

  /// Inserta o actualiza un bloque (el sensor lo reescribe mientras sigue abierto).
  /// Al cambiar, vuelve a quedar pendiente de sincronizar.
  pub fn upsert_block(&self, b: &BlockRow) -> Result<()> {
    Self::upsert_block_on(&self.conn, b)
  }

  fn upsert_block_on(conn: &Connection, b: &BlockRow) -> Result<()> {
    conn
      .execute(
        "INSERT INTO activity_blocks_local
           (id, started_at, ended_at, app_name, title_enc, category, ai_tool)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(id) DO UPDATE SET
           started_at = excluded.started_at, ended_at = excluded.ended_at,
           app_name = excluded.app_name, title_enc = excluded.title_enc,
           category = excluded.category, ai_tool = excluded.ai_tool, synced_at = NULL",
        params![b.id, fmt(b.started_at), fmt(b.ended_at), b.app_name, b.title_enc, b.category.as_str(), b.ai_tool],
      )
      .map_err(db)?;
    Ok(())
  }

  /// Aplica un lote de cambios del sensor en una sola transacción.
  pub fn apply_block_changes(&self, upserts: &[BlockRow], removes: &[String]) -> Result<()> {
    let tx = self.conn.unchecked_transaction().map_err(db)?;
    for b in upserts {
      Self::upsert_block_on(&tx, b)?;
    }
    for id in removes {
      tx.execute("DELETE FROM activity_blocks_local WHERE id = ?1", [id]).map_err(db)?;
    }
    tx.commit().map_err(db)
  }

  /// Fin del último bloque guardado, para que una sesión nueva no se solape con la anterior.
  pub fn latest_block_end(&self) -> Result<Option<DateTime<Utc>>> {
    let max: Option<String> = self
      .conn
      .query_row("SELECT MAX(ended_at) FROM activity_blocks_local", [], |r| r.get(0))
      .map_err(db)?;
    max.as_deref().map(parse).transpose()
  }

  /// Bloques que se solapan con `[from, to)`, en orden cronológico.
  pub fn blocks_between(&self, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<BlockRow>> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, started_at, ended_at, app_name, title_enc, category, ai_tool
         FROM activity_blocks_local WHERE started_at < ?2 AND ended_at > ?1
         ORDER BY started_at",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![fmt(from), fmt(to)], block_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  // ---- Entradas de tiempo ----

  pub fn open_timer(&self) -> Result<Option<TimeEntry>> {
    self
      .conn
      .query_row(
        "SELECT id, started_at, ended_at, task_id, source FROM time_entries_local
         WHERE ended_at IS NULL AND deleted_at IS NULL",
        [],
        entry_from_row,
      )
      .optional()
      .map_err(db)?
      .transpose()
  }

  /// AC-12: crea una entrada abierta; con un temporizador en marcha devuelve error.
  pub fn timer_start(&self, now: DateTime<Utc>, task_id: Option<&str>) -> Result<TimeEntry> {
    if self.open_timer()?.is_some() {
      return Err("Ya hay un temporizador en marcha. Deténlo antes de iniciar otro.".into());
    }
    let id = Uuid::new_v4().to_string();
    self
      .conn
      .execute(
        "INSERT INTO time_entries_local (id, started_at, ended_at, task_id, source, updated_at)
         VALUES (?1, ?2, NULL, ?3, 'timer', ?2)",
        params![id, fmt(now), task_id],
      )
      .map_err(db)?;
    Ok(TimeEntry { id, started_at: now, ended_at: None, task_id: task_id.map(String::from), source: EntrySource::Timer })
  }

  pub fn timer_stop(&self, now: DateTime<Utc>) -> Result<TimeEntry> {
    let mut entry = self.open_timer()?.ok_or("No hay un temporizador en marcha.")?;
    // Un temporizador abierto más de 24 h se acota a 24 h (p. ej. el equipo estuvo apagado).
    let end = now.min(entry.started_at + MAX_ENTRY);
    self
      .conn
      .execute(
        "UPDATE time_entries_local SET ended_at = ?1, updated_at = ?2, synced_at = NULL WHERE id = ?3",
        params![fmt(end), fmt(now), entry.id],
      )
      .map_err(db)?;
    entry.ended_at = Some(end);
    Ok(entry)
  }

  /// AC-13: rechaza fin anterior al inicio, más de 24 h y fechas futuras.
  fn validate_range(start: DateTime<Utc>, end: DateTime<Utc>, now: DateTime<Utc>) -> Result<()> {
    if end <= start {
      return Err("El fin debe ser posterior al inicio.".into());
    }
    if end - start > MAX_ENTRY {
      return Err("Una entrada no puede durar más de 24 horas.".into());
    }
    if end > now {
      return Err("No se puede registrar tiempo en el futuro.".into());
    }
    Ok(())
  }

  pub fn time_entry_add(
    &self,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    task_id: Option<&str>,
    now: DateTime<Utc>,
  ) -> Result<TimeEntry> {
    Self::validate_range(start, end, now)?;
    let id = Uuid::new_v4().to_string();
    self
      .conn
      .execute(
        "INSERT INTO time_entries_local (id, started_at, ended_at, task_id, source, updated_at)
         VALUES (?1, ?2, ?3, ?4, 'manual', ?5)",
        params![id, fmt(start), fmt(end), task_id, fmt(now)],
      )
      .map_err(db)?;
    Ok(TimeEntry { id, started_at: start, ended_at: Some(end), task_id: task_id.map(String::from), source: EntrySource::Manual })
  }

  pub fn time_entry_update(
    &self,
    id: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
    task_id: Option<&str>,
    now: DateTime<Utc>,
  ) -> Result<()> {
    Self::validate_range(start, end, now)?;
    let changed = self
      .conn
      .execute(
        "UPDATE time_entries_local
         SET started_at = ?1, ended_at = ?2, task_id = ?3, updated_at = ?4, synced_at = NULL
         WHERE id = ?5 AND deleted_at IS NULL AND ended_at IS NOT NULL",
        params![fmt(start), fmt(end), task_id, fmt(now), id],
      )
      .map_err(db)?;
    if changed == 0 {
      return Err("La entrada no existe o sigue en marcha.".into());
    }
    Ok(())
  }

  /// Borrado lógico: la fila queda marcada para que la sincronización pueda propagarlo.
  pub fn time_entry_delete(&self, id: &str, now: DateTime<Utc>) -> Result<()> {
    let changed = self
      .conn
      .execute(
        "UPDATE time_entries_local SET deleted_at = ?1, updated_at = ?1, synced_at = NULL
         WHERE id = ?2 AND deleted_at IS NULL",
        params![fmt(now), id],
      )
      .map_err(db)?;
    if changed == 0 {
      return Err("La entrada no existe.".into());
    }
    Ok(())
  }

  /// Entradas no borradas que empiezan en `[from, to)`.
  pub fn entries_between(&self, from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Vec<TimeEntry>> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, started_at, ended_at, task_id, source FROM time_entries_local
         WHERE deleted_at IS NULL AND started_at >= ?1 AND started_at < ?2 ORDER BY started_at",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![fmt(from), fmt(to)], entry_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  // ---- Ajustes ----

  pub fn setting_get(&self, key: &str) -> Result<Option<String>> {
    self
      .conn
      .query_row("SELECT value FROM kv_settings WHERE key = ?1", [key], |r| r.get(0))
      .optional()
      .map_err(db)
  }

  pub fn setting_set(&self, key: &str, value: &str) -> Result<()> {
    self
      .conn
      .execute(
        "INSERT INTO kv_settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
      )
      .map_err(db)?;
    Ok(())
  }
}

fn block_from_row(r: &Row) -> rusqlite::Result<Result<BlockRow>> {
  let category: String = r.get(5)?;
  let (start, end): (String, String) = (r.get(1)?, r.get(2)?);
  Ok((|| {
    Ok(BlockRow {
      id: r.get(0).map_err(db)?,
      started_at: parse(&start)?,
      ended_at: parse(&end)?,
      app_name: r.get(3).map_err(db)?,
      title_enc: r.get(4).map_err(db)?,
      category: Category::parse(&category).ok_or_else(|| db(format!("categoría desconocida: {category}")))?,
      ai_tool: r.get(6).map_err(db)?,
    })
  })())
}

fn entry_from_row(r: &Row) -> rusqlite::Result<Result<TimeEntry>> {
  let start: String = r.get(1)?;
  let end: Option<String> = r.get(2)?;
  let source: String = r.get(4)?;
  Ok((|| {
    Ok(TimeEntry {
      id: r.get(0).map_err(db)?,
      started_at: parse(&start)?,
      ended_at: end.as_deref().map(parse).transpose()?,
      task_id: r.get(3).map_err(db)?,
      source: if source == "timer" { EntrySource::Timer } else { EntrySource::Manual },
    })
  })())
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::TimeZone;

  fn t(h: u32, m: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 10, 5, h, m, 0).unwrap()
  }

  fn block(id: &str, start: DateTime<Utc>, end: DateTime<Utc>) -> BlockRow {
    BlockRow {
      id: id.into(),
      started_at: start,
      ended_at: end,
      app_name: "code".into(),
      title_enc: Some(vec![1, 2, 3]),
      category: Category::Productive,
      ai_tool: None,
    }
  }

  #[test]
  fn blocks_roundtrip_in_order_and_range() {
    let s = Store::open_in_memory().unwrap();
    s.insert_block(&block("b2", t(10, 0), t(11, 0))).unwrap();
    s.insert_block(&block("b1", t(9, 0), t(10, 0))).unwrap();
    s.insert_block(&block("b3", t(20, 0), t(21, 0))).unwrap();
    let got = s.blocks_between(t(0, 0), t(12, 0)).unwrap();
    assert_eq!(got.iter().map(|b| b.id.as_str()).collect::<Vec<_>>(), ["b1", "b2"]);
    assert_eq!(got[0].title_enc, Some(vec![1, 2, 3]));
    assert_eq!(got[0].category, Category::Productive);
  }

  #[test]
  fn upsert_updates_in_place_and_batch_removes() {
    let s = Store::open_in_memory().unwrap();
    let mut b = block("b1", t(9, 0), t(9, 5));
    s.apply_block_changes(&[b.clone(), block("b2", t(9, 5), t(9, 6))], &[]).unwrap();
    b.ended_at = t(9, 30);
    s.apply_block_changes(&[b], &["b2".to_string()]).unwrap();
    let got = s.blocks_between(t(0, 0), t(23, 0)).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].ended_at, t(9, 30));
  }

  #[test]
  fn blocks_crossing_the_range_edge_are_included() {
    let s = Store::open_in_memory().unwrap();
    s.insert_block(&block("night", t(23, 0), t(23, 59) + Duration::hours(2))).unwrap();
    let next_day = t(0, 0) + Duration::days(1);
    assert_eq!(s.blocks_between(next_day, next_day + Duration::days(1)).unwrap().len(), 1);
  }

  #[test]
  fn timer_start_stop_and_double_start_fails() {
    let s = Store::open_in_memory().unwrap();
    s.timer_start(t(9, 0), None).unwrap();
    let err = s.timer_start(t(9, 5), None).unwrap_err();
    assert!(err.contains("en marcha"));
    let done = s.timer_stop(t(10, 0)).unwrap();
    assert_eq!(done.ended_at, Some(t(10, 0)));
    assert!(s.open_timer().unwrap().is_none());
    assert!(s.timer_stop(t(10, 1)).is_err());
    s.timer_start(t(10, 2), None).unwrap();
  }

  #[test]
  fn manual_entry_validation() {
    let s = Store::open_in_memory().unwrap();
    let now = t(12, 0);
    assert!(s.time_entry_add(t(9, 0), t(8, 0), None, now).is_err(), "fin antes del inicio");
    assert!(s.time_entry_add(t(9, 0), t(9, 0), None, now).is_err(), "duración cero");
    assert!(s.time_entry_add(t(9, 0), t(13, 0), None, now).is_err(), "futuro");
    let long_start = now - Duration::hours(25);
    assert!(s.time_entry_add(long_start, now, None, now).is_err(), "más de 24 h");
    assert!(s.time_entry_add(t(9, 0), t(10, 0), None, now).is_ok());
    assert!(s.time_entry_add(now - Duration::hours(24), now, None, now).is_ok(), "exactamente 24 h");
  }

  #[test]
  fn update_and_soft_delete() {
    let s = Store::open_in_memory().unwrap();
    let now = t(12, 0);
    let e = s.time_entry_add(t(9, 0), t(10, 0), None, now).unwrap();
    s.time_entry_update(&e.id, t(9, 0), t(11, 0), None, now).unwrap();
    assert_eq!(s.entries_between(t(0, 0), t(23, 0)).unwrap()[0].ended_at, Some(t(11, 0)));
    assert!(s.time_entry_update(&e.id, t(9, 0), t(8, 0), None, now).is_err());
    s.time_entry_delete(&e.id, now).unwrap();
    assert!(s.entries_between(t(0, 0), t(23, 0)).unwrap().is_empty());
    assert!(s.time_entry_delete(&e.id, now).is_err());
    assert!(s.time_entry_update("no-existe", t(9, 0), t(10, 0), None, now).is_err());
  }

  #[test]
  fn settings_upsert() {
    let s = Store::open_in_memory().unwrap();
    assert_eq!(s.setting_get("idle_minutes").unwrap(), None);
    s.setting_set("idle_minutes", "5").unwrap();
    s.setting_set("idle_minutes", "10").unwrap();
    assert_eq!(s.setting_get("idle_minutes").unwrap().as_deref(), Some("10"));
  }

  #[test]
  fn data_survives_reopen_on_disk() {
    let dir = std::env::temp_dir().join(format!("pulso-test-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("pulso.db");
    {
      let s = Store::open(&path).unwrap();
      s.insert_block(&block("b1", t(9, 0), t(10, 0))).unwrap();
    }
    let s = Store::open(&path).unwrap();
    assert_eq!(s.blocks_between(t(0, 0), t(23, 0)).unwrap().len(), 1);
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
  }
}
