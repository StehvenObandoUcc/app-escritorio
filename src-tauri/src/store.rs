//! Base local (SQLite, modo WAL). Único dueño del archivo: la interfaz nunca ve SQL (D-03).
//! Guarda `title_enc` tal cual: el cifrado lo hace quien llama (ver `crypto`).
//! Las fechas se guardan en ISO 8601 UTC con "Z".

use crate::classifier::Category;
use chrono::{DateTime, Duration, SecondsFormat, Utc};
use rusqlite::{Connection, OptionalExtension, Row, params};
use std::collections::HashMap;
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
  /// Equipo activo cuando empezó el bloque (F2). `None`: nunca se sube.
  pub team_id: Option<String>,
  /// Dominio del sitio, solo en navegadores (ADR-0009).
  pub domain: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "lowercase")]
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

impl EntrySource {
  pub fn as_str(self) -> &'static str {
    match self {
      EntrySource::Timer => "timer",
      EntrySource::Manual => "manual",
    }
  }
}

/// Bloque pendiente de subir. A propósito no tiene título: no hay forma de que salga del equipo (D-05).
/// Se serializa tal cual hacia la interfaz (camelCase, fechas RFC 3339 con `Z`).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingBlock {
  pub id: String,
  pub team_id: String,
  pub started_at: DateTime<Utc>,
  pub ended_at: DateTime<Utc>,
  pub app_name: String,
  pub category: Category,
  pub ai_tool: Option<String>,
  pub domain: Option<String>,
}

/// Entrada de tiempo pendiente de subir, incluidas las borradas (para propagar el borrado).
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingEntry {
  pub id: String,
  pub team_id: String,
  pub started_at: DateTime<Utc>,
  pub ended_at: Option<DateTime<Utc>>,
  pub task_id: Option<String>,
  pub source: EntrySource,
  pub updated_at: DateTime<Utc>,
  pub deleted_at: Option<DateTime<Utc>>,
}

/// Hueco en el registro porque Pulso estuvo cerrado (A-1). Se guarda siempre;
/// la interfaz decide si cae dentro de la jornada del equipo antes de subirlo.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Closure {
  pub id: String,
  pub team_id: Option<String>,
  pub closed_at: DateTime<Utc>,
  pub reopened_at: DateTime<Utc>,
}

/// Qué tabla marca `mark_synced`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncKind {
  Blocks,
  Entries,
  Closures,
}

impl SyncKind {
  pub fn parse(s: &str) -> Option<Self> {
    Some(match s {
      "blocks" => SyncKind::Blocks,
      "entries" => SyncKind::Entries,
      "closures" => SyncKind::Closures,
      _ => return None,
    })
  }
}

pub struct Store {
  conn: Connection,
  /// Cuenta con sesión en este equipo (ADR-0013). Las filas nuevas se guardan con ella; las consultas
  /// muestran las suyas y las sin cuenta (historial anterior o registrado sin sesión).
  user: Option<String>,
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
    let store = Self { conn, user: None };
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
      // F2: equipo de cada fila (null = sin equipo, nunca se sube) y cierres de Pulso.
      "ALTER TABLE activity_blocks_local ADD COLUMN team_id TEXT NULL;
       ALTER TABLE time_entries_local ADD COLUMN team_id TEXT NULL;
       CREATE INDEX idx_blocks_unsynced ON activity_blocks_local(team_id, started_at) WHERE synced_at IS NULL;
       CREATE INDEX idx_entries_unsynced ON time_entries_local(team_id, started_at) WHERE synced_at IS NULL;
       CREATE TABLE app_closures_local (
         id TEXT PRIMARY KEY, team_id TEXT NULL, closed_at TEXT NOT NULL,
         reopened_at TEXT NOT NULL, synced_at TEXT NULL);",
      // ADR-0009: dominio del sitio en los bloques de navegador.
      "ALTER TABLE activity_blocks_local ADD COLUMN domain TEXT NULL;",
      // ADR-0013: cuenta de cada fila; lo de una cuenta nunca se sube ni se ve con otra.
      "ALTER TABLE activity_blocks_local ADD COLUMN user_id TEXT NULL;
       ALTER TABLE time_entries_local ADD COLUMN user_id TEXT NULL;
       ALTER TABLE app_closures_local ADD COLUMN user_id TEXT NULL;",
      // F3: copia de las tareas para verlas sin conexión, por cuenta y equipo (PT-09).
      "CREATE TABLE tasks_cache (
         user_id TEXT NOT NULL, team_id TEXT NOT NULL, json TEXT NOT NULL, updated_at TEXT NOT NULL,
         PRIMARY KEY (user_id, team_id));",
    ];
    let current: i64 = self.conn.pragma_query_value(None, "user_version", |r| r.get(0)).map_err(db)?;
    for (i, sql) in MIGRATIONS.iter().enumerate().skip(current as usize) {
      self.conn.execute_batch(sql).map_err(db)?;
      self.conn.pragma_update(None, "user_version", i as i64 + 1).map_err(db)?;
    }
    Ok(())
  }

  /// Cuenta actual (ADR-0013). `None`: sin sesión.
  pub fn set_user(&mut self, user: Option<String>) {
    self.user = user;
  }

  pub fn user(&self) -> Option<&str> {
    self.user.as_deref()
  }

  // ---- Bloques de actividad ----

  pub fn insert_block(&self, b: &BlockRow) -> Result<()> {
    self
      .conn
      .execute(
        "INSERT INTO activity_blocks_local
           (id, started_at, ended_at, app_name, title_enc, category, ai_tool, team_id, domain, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![b.id, fmt(b.started_at), fmt(b.ended_at), b.app_name, b.title_enc, b.category.as_str(), b.ai_tool, b.team_id, b.domain, self.user],
      )
      .map_err(db)?;
    Ok(())
  }

  /// Inserta o actualiza un bloque (el sensor lo reescribe mientras sigue abierto).
  /// Al cambiar, vuelve a quedar pendiente de sincronizar.
  pub fn upsert_block(&self, b: &BlockRow) -> Result<()> {
    Self::upsert_block_on(&self.conn, b, self.user.as_deref())
  }

  fn upsert_block_on(conn: &Connection, b: &BlockRow, user: Option<&str>) -> Result<()> {
    conn
      .execute(
        "INSERT INTO activity_blocks_local
           (id, started_at, ended_at, app_name, title_enc, category, ai_tool, team_id, domain, user_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           started_at = excluded.started_at, ended_at = excluded.ended_at,
           app_name = excluded.app_name, title_enc = excluded.title_enc,
           category = excluded.category, ai_tool = excluded.ai_tool, domain = excluded.domain, synced_at = NULL",
        // team_id y user_id no se actualizan: una fila no cambia de equipo ni de cuenta.
        params![b.id, fmt(b.started_at), fmt(b.ended_at), b.app_name, b.title_enc, b.category.as_str(), b.ai_tool, b.team_id, b.domain, user],
      )
      .map_err(db)?;
    Ok(())
  }

  /// Aplica un lote de cambios del sensor en una sola transacción.
  pub fn apply_block_changes(&self, upserts: &[BlockRow], removes: &[String]) -> Result<()> {
    let tx = self.conn.unchecked_transaction().map_err(db)?;
    for b in upserts {
      Self::upsert_block_on(&tx, b, self.user.as_deref())?;
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
        "SELECT id, started_at, ended_at, app_name, title_enc, category, ai_tool, team_id, domain
         FROM activity_blocks_local WHERE started_at < ?2 AND ended_at > ?1
           AND (user_id IS ?3 OR user_id IS NULL)
         ORDER BY started_at",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![fmt(from), fmt(to), self.user], block_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  // ---- Entradas de tiempo ----

  pub fn open_timer(&self) -> Result<Option<TimeEntry>> {
    self
      .conn
      .query_row(
        "SELECT id, started_at, ended_at, task_id, source FROM time_entries_local
         WHERE ended_at IS NULL AND deleted_at IS NULL AND (user_id IS ?1 OR user_id IS NULL)",
        [&self.user],
        entry_from_row,
      )
      .optional()
      .map_err(db)?
      .transpose()
  }

  /// AC-12: crea una entrada abierta; con un temporizador en marcha devuelve error.
  pub fn timer_start(&self, now: DateTime<Utc>, task_id: Option<&str>, team_id: Option<&str>) -> Result<TimeEntry> {
    if self.open_timer()?.is_some() {
      return Err("Ya hay un temporizador en marcha. Deténlo antes de iniciar otro.".into());
    }
    let id = Uuid::new_v4().to_string();
    self
      .conn
      .execute(
        "INSERT INTO time_entries_local (id, started_at, ended_at, task_id, source, updated_at, team_id, user_id)
         VALUES (?1, ?2, NULL, ?3, 'timer', ?2, ?4, ?5)",
        params![id, fmt(now), task_id, team_id, self.user],
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
    team_id: Option<&str>,
    now: DateTime<Utc>,
  ) -> Result<TimeEntry> {
    Self::validate_range(start, end, now)?;
    let id = Uuid::new_v4().to_string();
    self
      .conn
      .execute(
        "INSERT INTO time_entries_local (id, started_at, ended_at, task_id, source, updated_at, team_id, user_id)
         VALUES (?1, ?2, ?3, ?4, 'manual', ?5, ?6, ?7)",
        params![id, fmt(start), fmt(end), task_id, fmt(now), team_id, self.user],
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
         WHERE id = ?5 AND deleted_at IS NULL AND ended_at IS NOT NULL AND (user_id IS ?6 OR user_id IS NULL)",
        params![fmt(start), fmt(end), task_id, fmt(now), id, self.user],
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
         WHERE id = ?2 AND deleted_at IS NULL AND (user_id IS ?3 OR user_id IS NULL)",
        params![fmt(now), id, self.user],
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
         WHERE deleted_at IS NULL AND started_at >= ?1 AND started_at < ?2 AND (user_id IS ?3 OR user_id IS NULL)
         ORDER BY started_at",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![fmt(from), fmt(to), self.user], entry_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  // ---- Sincronización (F2) ----

  /// Bloques de `team` sin subir que empezaron antes de `stable_before` (aunque sigan abiertos), sin título.
  pub fn pending_blocks(&self, team: &str, stable_before: DateTime<Utc>, limit: usize) -> Result<Vec<PendingBlock>> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, team_id, started_at, ended_at, app_name, category, ai_tool, domain
         FROM activity_blocks_local
         WHERE synced_at IS NULL AND team_id = ?1 AND started_at <= ?2 AND user_id IS ?4
         ORDER BY started_at LIMIT ?3",
      )
      .map_err(db)?;
    let rows = stmt
      .query_map(params![team, fmt(stable_before), limit as i64, self.user], pending_block_from_row)
      .map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  /// Entradas de `team` sin subir (también las borradas y la del temporizador en marcha).
  pub fn pending_entries(&self, team: &str, limit: usize) -> Result<Vec<PendingEntry>> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, team_id, started_at, ended_at, task_id, source, updated_at, deleted_at
         FROM time_entries_local WHERE synced_at IS NULL AND team_id = ?1 AND user_id IS ?3
         ORDER BY started_at LIMIT ?2",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![team, limit as i64, self.user], pending_entry_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  /// Cierres de `team` sin subir.
  pub fn pending_closures(&self, team: &str, limit: usize) -> Result<Vec<Closure>> {
    let mut stmt = self
      .conn
      .prepare(
        "SELECT id, team_id, closed_at, reopened_at FROM app_closures_local
         WHERE synced_at IS NULL AND team_id = ?1 AND user_id IS ?3 ORDER BY closed_at LIMIT ?2",
      )
      .map_err(db)?;
    let rows = stmt.query_map(params![team, limit as i64, self.user], closure_from_row).map_err(db)?;
    rows.map(|r| r.map_err(db)?).collect()
  }

  /// Marca como subidas las filas indicadas. En entradas, solo si no cambiaron desde que se
  /// leyeron (`updated_at` igual al de `versions`): una edición durante la subida vuelve a subirse.
  pub fn mark_synced(
    &self,
    kind: SyncKind,
    ids: &[String],
    versions: &HashMap<String, DateTime<Utc>>,
    now: DateTime<Utc>,
  ) -> Result<usize> {
    let tx = self.conn.unchecked_transaction().map_err(db)?;
    let mut n = 0;
    for id in ids {
      n += match kind {
        SyncKind::Blocks => tx
          .execute("UPDATE activity_blocks_local SET synced_at = ?1 WHERE id = ?2", params![fmt(now), id])
          .map_err(db)?,
        SyncKind::Closures => tx
          .execute("UPDATE app_closures_local SET synced_at = ?1 WHERE id = ?2", params![fmt(now), id])
          .map_err(db)?,
        SyncKind::Entries => match versions.get(id) {
          Some(v) => tx
            .execute(
              "UPDATE time_entries_local SET synced_at = ?1 WHERE id = ?2 AND updated_at = ?3",
              params![fmt(now), id, fmt(*v)],
            )
            .map_err(db)?,
          None => 0,
        },
      };
    }
    tx.commit().map_err(db)?;
    Ok(n)
  }

  pub fn insert_closure(&self, c: &Closure) -> Result<()> {
    self
      .conn
      .execute(
        "INSERT INTO app_closures_local (id, team_id, closed_at, reopened_at, user_id) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![c.id, c.team_id, fmt(c.closed_at), fmt(c.reopened_at), self.user],
      )
      .map_err(db)?;
    Ok(())
  }

  pub fn setting_delete(&self, key: &str) -> Result<()> {
    self.conn.execute("DELETE FROM kv_settings WHERE key = ?1", [key]).map_err(db)?;
    Ok(())
  }

  // ---- Ajustes ----

  pub fn setting_get(&self, key: &str) -> Result<Option<String>> {
    self
      .conn
      .query_row("SELECT value FROM kv_settings WHERE key = ?1", [key], |r| r.get(0))
      .optional()
      .map_err(db)
  }

  // ---- Copia local de tareas (F3) ----

  /// Sin cuenta no se guarda nada: la copia de una cuenta nunca se muestra con otra (ADR-0013).
  pub fn tasks_cache_put(&self, now: DateTime<Utc>, team_id: &str, json: &str) -> Result<()> {
    let Some(user) = &self.user else { return Ok(()) };
    self
      .conn
      .execute(
        "INSERT INTO tasks_cache (user_id, team_id, json, updated_at) VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(user_id, team_id) DO UPDATE SET json = excluded.json, updated_at = excluded.updated_at",
        params![user, team_id, json, fmt(now)],
      )
      .map_err(db)?;
    Ok(())
  }

  pub fn tasks_cache_get(&self, team_id: &str) -> Result<Option<String>> {
    let Some(user) = &self.user else { return Ok(None) };
    self
      .conn
      .query_row("SELECT json FROM tasks_cache WHERE user_id = ?1 AND team_id = ?2", params![user, team_id], |r| r.get(0))
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
  let team_id: Option<String> = r.get(7)?;
  let domain: Option<String> = r.get(8)?;
  Ok((|| {
    Ok(BlockRow {
      id: r.get(0).map_err(db)?,
      started_at: parse(&start)?,
      ended_at: parse(&end)?,
      app_name: r.get(3).map_err(db)?,
      title_enc: r.get(4).map_err(db)?,
      category: Category::parse(&category).ok_or_else(|| db(format!("categoría desconocida: {category}")))?,
      ai_tool: r.get(6).map_err(db)?,
      team_id,
      domain,
    })
  })())
}

fn pending_block_from_row(r: &Row) -> rusqlite::Result<Result<PendingBlock>> {
  let (id, team_id, start, end, app_name): (String, String, String, String, String) = (r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?);
  let (category, ai_tool, domain): (String, Option<String>, Option<String>) = (r.get(5)?, r.get(6)?, r.get(7)?);
  let category = Category::parse(&category).ok_or_else(|| db(format!("categoría desconocida: {category}")));
  Ok(category.and_then(|category| {
    Ok(PendingBlock { id, team_id, started_at: parse(&start)?, ended_at: parse(&end)?, app_name, category, ai_tool, domain })
  }))
}

fn pending_entry_from_row(r: &Row) -> rusqlite::Result<Result<PendingEntry>> {
  let (id, team_id, start, end, task_id): (String, String, String, Option<String>, Option<String>) = (r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get(4)?);
  let (source, updated, deleted): (String, String, Option<String>) = (r.get(5)?, r.get(6)?, r.get(7)?);
  let source = if source == "timer" { EntrySource::Timer } else { EntrySource::Manual };
  Ok(parse(&start).and_then(|started_at| {
    Ok(PendingEntry {
      id,
      team_id,
      started_at,
      ended_at: end.as_deref().map(parse).transpose()?,
      task_id,
      source,
      updated_at: parse(&updated)?,
      deleted_at: deleted.as_deref().map(parse).transpose()?,
    })
  }))
}

fn closure_from_row(r: &Row) -> rusqlite::Result<Result<Closure>> {
  let (id, team_id, closed, reopened): (String, Option<String>, String, String) = (r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?);
  Ok(parse(&closed).and_then(|closed_at| Ok(Closure { id, team_id, closed_at, reopened_at: parse(&reopened)? })))
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
      team_id: None,
      domain: None,
    }
  }

  fn team_block(id: &str, team: Option<&str>, start: DateTime<Utc>, end: DateTime<Utc>) -> BlockRow {
    BlockRow { team_id: team.map(String::from), ..block(id, start, end) }
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
    s.timer_start(t(9, 0), None, None).unwrap();
    let err = s.timer_start(t(9, 5), None, None).unwrap_err();
    assert!(err.contains("en marcha"));
    let done = s.timer_stop(t(10, 0)).unwrap();
    assert_eq!(done.ended_at, Some(t(10, 0)));
    assert!(s.open_timer().unwrap().is_none());
    assert!(s.timer_stop(t(10, 1)).is_err());
    s.timer_start(t(10, 2), None, None).unwrap();
  }

  #[test]
  fn manual_entry_validation() {
    let s = Store::open_in_memory().unwrap();
    let now = t(12, 0);
    assert!(s.time_entry_add(t(9, 0), t(8, 0), None, None, now).is_err(), "fin antes del inicio");
    assert!(s.time_entry_add(t(9, 0), t(9, 0), None, None, now).is_err(), "duración cero");
    assert!(s.time_entry_add(t(9, 0), t(13, 0), None, None, now).is_err(), "futuro");
    let long_start = now - Duration::hours(25);
    assert!(s.time_entry_add(long_start, now, None, None, now).is_err(), "más de 24 h");
    assert!(s.time_entry_add(t(9, 0), t(10, 0), None, None, now).is_ok());
    assert!(s.time_entry_add(now - Duration::hours(24), now, None, None, now).is_ok(), "exactamente 24 h");
  }

  #[test]
  fn update_and_soft_delete() {
    let s = Store::open_in_memory().unwrap();
    let now = t(12, 0);
    let e = s.time_entry_add(t(9, 0), t(10, 0), None, None, now).unwrap();
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

  // ---- F2: sincronización ----

  const TEAM: &str = "11111111-1111-4111-8111-111111111111";
  const OTHER: &str = "22222222-2222-4222-8222-222222222222";

  #[test]
  fn pending_blocks_only_from_the_team_stable_and_unsynced() {
    let s = Store::open_in_memory().unwrap();
    s.insert_block(&team_block("mine", Some(TEAM), t(9, 0), t(10, 0))).unwrap();
    s.insert_block(&team_block("no-team", None, t(9, 0), t(10, 0))).unwrap();
    s.insert_block(&team_block("other", Some(OTHER), t(9, 0), t(10, 0))).unwrap();
    s.insert_block(&team_block("recent", Some(TEAM), t(10, 40), t(10, 59))).unwrap();
    let got = s.pending_blocks(TEAM, t(10, 30), 200).unwrap();
    assert_eq!(got.iter().map(|b| b.id.as_str()).collect::<Vec<_>>(), ["mine"]);
    assert_eq!(got[0].team_id, TEAM);
  }

  #[test]
  fn marked_blocks_are_not_pending_until_they_change() {
    let s = Store::open_in_memory().unwrap();
    let mut b = team_block("b1", Some(TEAM), t(9, 0), t(10, 0));
    s.insert_block(&b).unwrap();
    s.mark_synced(SyncKind::Blocks, &["b1".into()], &HashMap::new(), t(11, 0)).unwrap();
    assert!(s.pending_blocks(TEAM, t(12, 0), 200).unwrap().is_empty());
    b.ended_at = t(10, 30);
    s.upsert_block(&b).unwrap();
    assert_eq!(s.pending_blocks(TEAM, t(12, 0), 200).unwrap().len(), 1);
  }

  #[test]
  fn a_block_never_changes_team_on_upsert() {
    let s = Store::open_in_memory().unwrap();
    s.insert_block(&team_block("b1", Some(TEAM), t(9, 0), t(10, 0))).unwrap();
    s.upsert_block(&team_block("b1", Some(OTHER), t(9, 0), t(10, 30))).unwrap();
    assert_eq!(s.blocks_between(t(0, 0), t(23, 0)).unwrap()[0].team_id.as_deref(), Some(TEAM));
  }

  #[test]
  fn pending_respects_the_limit_in_chronological_order() {
    let s = Store::open_in_memory().unwrap();
    for h in [12, 9, 10, 11] {
      s.insert_block(&team_block(&format!("b{h}"), Some(TEAM), t(h, 0), t(h, 30))).unwrap();
    }
    let got = s.pending_blocks(TEAM, t(23, 0), 2).unwrap();
    assert_eq!(got.iter().map(|b| b.id.as_str()).collect::<Vec<_>>(), ["b9", "b10"]);
  }

  #[test]
  fn pending_entries_include_deleted_and_running_ones() {
    let s = Store::open_in_memory().unwrap();
    let now = t(12, 0);
    let kept = s.time_entry_add(t(9, 0), t(10, 0), None, Some(TEAM), now).unwrap();
    let gone = s.time_entry_add(t(10, 0), t(11, 0), None, Some(TEAM), now).unwrap();
    s.time_entry_delete(&gone.id, now).unwrap();
    s.timer_start(t(11, 30), None, Some(TEAM)).unwrap();
    s.time_entry_add(t(8, 0), t(8, 30), None, None, now).unwrap();
    let got = s.pending_entries(TEAM, 200).unwrap();
    assert_eq!(got.len(), 3);
    assert!(got.iter().any(|e| e.id == kept.id && e.deleted_at.is_none()));
    assert!(got.iter().any(|e| e.id == gone.id && e.deleted_at == Some(now)));
    assert!(got.iter().any(|e| e.ended_at.is_none() && e.source == EntrySource::Timer));
  }

  #[test]
  fn an_entry_edited_during_upload_stays_pending() {
    let s = Store::open_in_memory().unwrap();
    let e = s.time_entry_add(t(9, 0), t(10, 0), None, Some(TEAM), t(12, 0)).unwrap();
    let read = s.pending_entries(TEAM, 200).unwrap();
    let versions: HashMap<_, _> = read.iter().map(|e| (e.id.clone(), e.updated_at)).collect();
    // Mientras se sube, la persona la edita.
    s.time_entry_update(&e.id, t(9, 0), t(10, 30), None, t(12, 5)).unwrap();
    assert_eq!(s.mark_synced(SyncKind::Entries, &[e.id.clone()], &versions, t(12, 6)).unwrap(), 0);
    assert_eq!(s.pending_entries(TEAM, 200).unwrap().len(), 1);
    // Sin cambios intermedios, sí queda marcada.
    let read = s.pending_entries(TEAM, 200).unwrap();
    let versions: HashMap<_, _> = read.iter().map(|e| (e.id.clone(), e.updated_at)).collect();
    assert_eq!(s.mark_synced(SyncKind::Entries, &[e.id], &versions, t(12, 7)).unwrap(), 1);
    assert!(s.pending_entries(TEAM, 200).unwrap().is_empty());
  }

  #[test]
  fn closures_are_pending_by_team() {
    let s = Store::open_in_memory().unwrap();
    let c = Closure { id: "c1".into(), team_id: Some(TEAM.into()), closed_at: t(9, 0), reopened_at: t(10, 0) };
    s.insert_closure(&c).unwrap();
    s.insert_closure(&Closure { id: "c2".into(), team_id: None, ..c.clone() }).unwrap();
    assert_eq!(s.pending_closures(TEAM, 200).unwrap(), vec![c]);
    s.mark_synced(SyncKind::Closures, &["c1".into()], &HashMap::new(), t(11, 0)).unwrap();
    assert!(s.pending_closures(TEAM, 200).unwrap().is_empty());
  }

  #[test]
  fn each_account_sees_and_uploads_only_its_own_rows_plus_those_without_account() {
    let mut s = Store::open_in_memory().unwrap();
    s.insert_block(&team_block("sin-cuenta", Some(TEAM), t(8, 0), t(8, 30))).unwrap();
    s.set_user(Some("ana".into()));
    s.insert_block(&team_block("de-ana", Some(TEAM), t(9, 0), t(9, 30))).unwrap();
    s.time_entry_add(t(9, 0), t(9, 30), None, Some(TEAM), t(12, 0)).unwrap();
    s.set_user(Some("beto".into()));
    s.insert_block(&team_block("de-beto", Some(TEAM), t(10, 0), t(10, 30))).unwrap();
    // Beto ve lo suyo y lo sin cuenta, nunca lo de Ana.
    let seen: Vec<String> = s.blocks_between(t(0, 0), t(23, 0)).unwrap().into_iter().map(|b| b.id).collect();
    assert_eq!(seen, ["sin-cuenta", "de-beto"]);
    assert!(s.entries_between(t(0, 0), t(23, 0)).unwrap().is_empty());
    // Y solo sube lo suyo: ni lo de Ana ni lo sin cuenta.
    let up: Vec<String> = s.pending_blocks(TEAM, t(23, 0), 200).unwrap().into_iter().map(|b| b.id).collect();
    assert_eq!(up, ["de-beto"]);
    assert!(s.pending_entries(TEAM, 200).unwrap().is_empty());
    // Beto no puede borrar la entrada de Ana.
    s.set_user(Some("ana".into()));
    let id = s.entries_between(t(0, 0), t(23, 0)).unwrap()[0].id.clone();
    s.set_user(Some("beto".into()));
    assert!(s.time_entry_delete(&id, t(12, 0)).is_err());
  }

  #[test]
  fn migrating_an_f1_database_keeps_its_rows_without_team() {
    let conn = Connection::open_in_memory().unwrap();
    conn
      .execute_batch(
        "CREATE TABLE activity_blocks_local (
           id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NOT NULL,
           app_name TEXT NOT NULL, title_enc BLOB NULL, category TEXT NOT NULL,
           ai_tool TEXT NULL, synced_at TEXT NULL);
         CREATE TABLE time_entries_local (
           id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ended_at TEXT NULL,
           task_id TEXT NULL, source TEXT NOT NULL, updated_at TEXT NOT NULL,
           deleted_at TEXT NULL, synced_at TEXT NULL);
         CREATE TABLE kv_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
         INSERT INTO activity_blocks_local VALUES
           ('old', '2026-10-05T09:00:00Z', '2026-10-05T10:00:00Z', 'code', NULL, 'productive', NULL, NULL);
         PRAGMA user_version = 1;",
      )
      .unwrap();
    let s = Store::init(conn).unwrap();
    let got = s.blocks_between(t(0, 0), t(23, 0)).unwrap();
    assert_eq!(got.len(), 1);
    assert_eq!(got[0].team_id, None);
  }
}
