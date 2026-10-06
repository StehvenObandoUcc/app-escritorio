//! Vistas que Rust entrega a la interfaz (camelCase). Su forma es la de `src/bridge/contract.ts`,
//! que la interfaz valida con zod. Funciones puras: reciben bloques ya leídos y devuelven datos.

use crate::classifier::Category;
use crate::store::{BlockRow, EntrySource, TimeEntry};
use chrono::{DateTime, Duration, NaiveDate, SecondsFormat, TimeZone, Utc};
use serde::Serialize;
use std::collections::BTreeMap;

const ALL_CATEGORIES: [Category; 7] = [
  Category::Productive,
  Category::Neutral,
  Category::Distraction,
  Category::Ai,
  Category::Break,
  Category::Idle,
  Category::Paused,
];

/// Tope de días de `range_view` (evita consultas enormes por error).
pub const MAX_RANGE_DAYS: i64 = 366;

pub fn iso(t: DateTime<Utc>) -> String {
  t.to_rfc3339_opts(SecondsFormat::Secs, true)
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct BlockView {
  pub id: String,
  pub started_at: String,
  pub ended_at: String,
  pub app_name: String,
  pub title: Option<String>,
  pub category: Category,
  pub ai_tool: Option<String>,
  /// Dominio del sitio (solo navegadores, ADR-0009).
  pub domain: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DayView {
  pub date: String,
  pub blocks: Vec<BlockView>,
  /// Segundos por categoría; siempre trae las 7 categorías.
  pub totals: BTreeMap<&'static str, i64>,
  pub workday_start: Option<String>,
  pub workday_end: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct DayTotals {
  pub date: String,
  pub totals: BTreeMap<&'static str, i64>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
pub struct RangeView {
  pub from: String,
  pub to: String,
  pub days: Vec<DayTotals>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntryView {
  pub id: String,
  pub started_at: String,
  pub ended_at: Option<String>,
  pub task_id: Option<String>,
  pub source: &'static str,
}

impl From<&TimeEntry> for TimeEntryView {
  fn from(e: &TimeEntry) -> Self {
    Self {
      id: e.id.clone(),
      started_at: iso(e.started_at),
      ended_at: e.ended_at.map(iso),
      task_id: e.task_id.clone(),
      source: match e.source {
        EntrySource::Timer => "timer",
        EntrySource::Manual => "manual",
      },
    }
  }
}

pub fn parse_date(s: &str) -> Result<NaiveDate, String> {
  NaiveDate::parse_from_str(s, "%Y-%m-%d").map_err(|_| format!("Fecha inválida: «{s}». Usa AAAA-MM-DD."))
}

/// Inicio (incluido) y fin (excluido) del día local, en UTC.
pub fn day_bounds<Tz: TimeZone>(date: NaiveDate, tz: &Tz) -> Result<(DateTime<Utc>, DateTime<Utc>), String> {
  let midnight = |d: NaiveDate| {
    let naive = d.and_hms_opt(0, 0, 0).expect("medianoche válida");
    tz.from_local_datetime(&naive)
      .earliest()
      .or_else(|| tz.from_local_datetime(&(naive + Duration::hours(1))).earliest())
      .map(|t| t.with_timezone(&Utc))
      .ok_or_else(|| "No se pudo resolver el día local.".to_string())
  };
  let next = date.succ_opt().ok_or("Fecha fuera de rango.")?;
  Ok((midnight(date)?, midnight(next)?))
}

fn zero_totals() -> BTreeMap<&'static str, i64> {
  ALL_CATEGORIES.iter().map(|c| (c.as_str(), 0)).collect()
}

/// Parte del bloque que cae dentro de `[start, end)`.
fn clip(b: &BlockRow, start: DateTime<Utc>, end: DateTime<Utc>) -> Option<(DateTime<Utc>, DateTime<Utc>)> {
  let (s, e) = (b.started_at.max(start), b.ended_at.min(end));
  (e > s).then_some((s, e))
}

fn add_totals(totals: &mut BTreeMap<&'static str, i64>, blocks: &[BlockRow], start: DateTime<Utc>, end: DateTime<Utc>) {
  for b in blocks {
    if let Some((s, e)) = clip(b, start, end) {
      *totals.entry(b.category.as_str()).or_insert(0) += (e - s).num_seconds();
    }
  }
}

/// `blocks` trae el título ya descifrado (o `None`).
pub fn build_day_view(
  date: NaiveDate,
  bounds: (DateTime<Utc>, DateTime<Utc>),
  blocks: Vec<(BlockRow, Option<String>)>,
) -> DayView {
  let (start, end) = bounds;
  let rows: Vec<BlockRow> = blocks.iter().map(|(b, _)| b.clone()).collect();
  let mut totals = zero_totals();
  add_totals(&mut totals, &rows, start, end);

  let mut views = Vec::new();
  let mut work: Vec<(DateTime<Utc>, DateTime<Utc>)> = Vec::new();
  for (b, title) in blocks {
    let Some((s, e)) = clip(&b, start, end) else { continue };
    if !matches!(b.category, Category::Idle | Category::Paused) {
      work.push((s, e));
    }
    views.push(BlockView {
      id: b.id,
      started_at: iso(s),
      ended_at: iso(e),
      app_name: b.app_name,
      title,
      category: b.category,
      ai_tool: b.ai_tool,
      domain: b.domain,
    });
  }

  DayView {
    date: date.format("%Y-%m-%d").to_string(),
    blocks: views,
    totals,
    workday_start: work.first().map(|w| iso(w.0)),
    workday_end: work.last().map(|w| iso(w.1)),
  }
}

pub fn build_range_view<Tz: TimeZone>(
  from: NaiveDate,
  to: NaiveDate,
  tz: &Tz,
  blocks: &[BlockRow],
) -> Result<RangeView, String> {
  if to < from {
    return Err("El fin del rango es anterior al inicio.".into());
  }
  if (to - from).num_days() >= MAX_RANGE_DAYS {
    return Err(format!("El rango no puede superar {MAX_RANGE_DAYS} días."));
  }
  let mut days = Vec::new();
  let mut d = from;
  while d <= to {
    let (start, end) = day_bounds(d, tz)?;
    let mut totals = zero_totals();
    add_totals(&mut totals, blocks, start, end);
    days.push(DayTotals { date: d.format("%Y-%m-%d").to_string(), totals });
    d = d.succ_opt().ok_or("Fecha fuera de rango.")?;
  }
  Ok(RangeView { from: from.format("%Y-%m-%d").to_string(), to: to.format("%Y-%m-%d").to_string(), days })
}

#[cfg(test)]
mod tests {
  use super::*;
  use chrono::FixedOffset;

  fn bogota() -> FixedOffset {
    FixedOffset::west_opt(5 * 3600).unwrap()
  }

  fn row(id: &str, from: (u32, u32, u32), to: (u32, u32, u32), category: Category) -> BlockRow {
    // Horas en UTC, día 5 o 6 de octubre.
    let t = |(d, h, m): (u32, u32, u32)| Utc.with_ymd_and_hms(2026, 10, d, h, m, 0).unwrap();
    BlockRow {
      id: id.into(),
      started_at: t(from),
      ended_at: t(to),
      app_name: "app".into(),
      title_enc: None,
      category,
      ai_tool: None,
      team_id: None,
      domain: None,
    }
  }

  #[test]
  fn local_day_bounds_use_the_time_zone() {
    let (s, e) = day_bounds(parse_date("2026-10-05").unwrap(), &bogota()).unwrap();
    assert_eq!(iso(s), "2026-10-05T05:00:00Z");
    assert_eq!(iso(e), "2026-10-06T05:00:00Z");
  }

  #[test]
  fn totals_workday_and_all_categories_present() {
    // AC-15. Día local 5 de octubre = 05:00Z del 5 a 05:00Z del 6.
    let date = parse_date("2026-10-05").unwrap();
    let bounds = day_bounds(date, &bogota()).unwrap();
    let blocks = vec![
      (row("a", (5, 6, 0), (5, 7, 0), Category::Idle), None),
      (row("b", (5, 7, 0), (5, 9, 0), Category::Productive), Some("main.rs".into())),
      (row("c", (5, 9, 0), (5, 9, 30), Category::Ai), None),
      (row("d", (5, 9, 30), (5, 10, 0), Category::Paused), None),
    ];
    let v = build_day_view(date, bounds, blocks);
    assert_eq!(v.totals["productive"], 7200);
    assert_eq!(v.totals["ai"], 1800);
    assert_eq!(v.totals["idle"], 3600);
    assert_eq!(v.totals["break"], 0);
    assert_eq!(v.totals.len(), 7);
    assert_eq!(v.workday_start.as_deref(), Some("2026-10-05T07:00:00Z"));
    assert_eq!(v.workday_end.as_deref(), Some("2026-10-05T09:30:00Z"));
    assert_eq!(v.blocks[1].title.as_deref(), Some("main.rs"));
  }

  #[test]
  fn empty_day_has_no_workday() {
    let date = parse_date("2026-10-05").unwrap();
    let v = build_day_view(date, day_bounds(date, &bogota()).unwrap(), vec![]);
    assert_eq!((v.workday_start, v.workday_end), (None, None));
    assert!(v.totals.values().all(|s| *s == 0));
  }

  #[test]
  fn block_crossing_midnight_is_clipped_to_each_day() {
    // 04:00Z–07:00Z del día 6: 1 h cae en el día 5 local (hasta 05:00Z) y 2 h en el 6.
    let blocks = vec![row("n", (6, 4, 0), (6, 7, 0), Category::Productive)];
    let range = build_range_view(parse_date("2026-10-05").unwrap(), parse_date("2026-10-06").unwrap(), &bogota(), &blocks).unwrap();
    assert_eq!(range.days[0].totals["productive"], 3600);
    assert_eq!(range.days[1].totals["productive"], 7200);

    let date = parse_date("2026-10-05").unwrap();
    let v = build_day_view(date, day_bounds(date, &bogota()).unwrap(), vec![(blocks[0].clone(), None)]);
    assert_eq!(v.blocks[0].ended_at, "2026-10-06T05:00:00Z"); // recortado al fin del día
    assert_eq!(v.totals["productive"], 3600);
  }

  #[test]
  fn range_rejects_bad_ranges() {
    let d = |s| parse_date(s).unwrap();
    assert!(build_range_view(d("2026-10-06"), d("2026-10-05"), &bogota(), &[]).is_err());
    assert!(build_range_view(d("2025-01-01"), d("2026-10-05"), &bogota(), &[]).is_err());
    assert!(parse_date("05/10/2026").is_err());
  }

  #[test]
  fn json_is_camel_case_as_the_contract_expects() {
    let date = parse_date("2026-10-05").unwrap();
    let v = build_day_view(date, day_bounds(date, &bogota()).unwrap(), vec![]);
    let json = serde_json::to_value(&v).unwrap();
    assert!(json.get("workdayStart").is_some() && json.get("workday_start").is_none());
    assert_eq!(json["totals"]["productive"], 0);
  }
}
