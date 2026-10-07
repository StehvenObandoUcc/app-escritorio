//! Lote que entrega `sync_pending` a la interfaz (F2, ADR-0001).
//! Los tipos de fila no tienen campo de título: los títulos de ventana nunca salen del equipo (D-05, R8).
//! La subida a Supabase la hace TypeScript; Rust solo entrega y marca.

use crate::store::{Closure, PendingBlock, PendingEntry};
use serde::Serialize;

/// Lote pendiente del equipo activo y la cuenta actual. Vacío si falta alguno de los dos.
#[derive(Debug, Default, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncBatch {
  pub blocks: Vec<PendingBlock>,
  pub entries: Vec<PendingEntry>,
  pub closures: Vec<Closure>,
}
