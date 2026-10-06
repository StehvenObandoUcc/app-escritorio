//! Formas que entrega `sync_pending` a la interfaz (F2, ADR-0001).
//! Ninguna tiene campo de título: los títulos de ventana nunca salen del equipo (D-05, R8).
//! La subida a Supabase la hace TypeScript; Rust solo entrega y marca.

use crate::store::{Closure, PendingBlock, PendingEntry};
use crate::views::iso;
use serde::Serialize;

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncBlock {
  pub id: String,
  pub team_id: String,
  pub started_at: String,
  pub ended_at: String,
  pub app_name: String,
  pub category: &'static str,
  pub ai_tool: Option<String>,
  /// Solo el dominio (ADR-0009): nunca la ruta ni la búsqueda.
  pub domain: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncEntry {
  pub id: String,
  pub team_id: String,
  pub started_at: String,
  pub ended_at: Option<String>,
  pub task_id: Option<String>,
  pub source: &'static str,
  pub updated_at: String,
  pub deleted_at: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncClosure {
  pub id: String,
  pub team_id: String,
  pub closed_at: String,
  pub reopened_at: String,
}

/// Lote pendiente del equipo activo. Vacío si no hay equipo activo.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncBatch {
  pub blocks: Vec<SyncBlock>,
  pub entries: Vec<SyncEntry>,
  pub closures: Vec<SyncClosure>,
}

impl From<&PendingBlock> for SyncBlock {
  fn from(b: &PendingBlock) -> Self {
    Self {
      id: b.id.clone(),
      team_id: b.team_id.clone(),
      started_at: iso(b.started_at),
      ended_at: iso(b.ended_at),
      app_name: b.app_name.clone(),
      category: b.category.as_str(),
      ai_tool: b.ai_tool.clone(),
      domain: b.domain.clone(),
    }
  }
}

impl From<&PendingEntry> for SyncEntry {
  fn from(e: &PendingEntry) -> Self {
    Self {
      id: e.id.clone(),
      team_id: e.team_id.clone(),
      started_at: iso(e.started_at),
      ended_at: e.ended_at.map(iso),
      task_id: e.task_id.clone(),
      source: e.source.as_str(),
      updated_at: iso(e.updated_at),
      deleted_at: e.deleted_at.map(iso),
    }
  }
}

impl SyncClosure {
  /// Solo los cierres con equipo llegan aquí (`pending_closures` filtra por equipo).
  pub fn from_closure(c: &Closure, team: &str) -> Self {
    Self {
      id: c.id.clone(),
      team_id: c.team_id.clone().unwrap_or_else(|| team.to_string()),
      closed_at: iso(c.closed_at),
      reopened_at: iso(c.reopened_at),
    }
  }
}
