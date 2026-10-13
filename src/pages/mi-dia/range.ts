/**
 * Periodos de Mi semana y Mi mes (D-14) y sus cuentas. Las fechas son AAAA-MM-DD del día local; la aritmética
 * se hace en UTC al mediodía para que los cambios de hora no muevan ningún día.
 */
import type { Category, RangeView } from '@/bridge/contract';
import type { TimeByTask } from '@/cloud/contract';
import { WORK_CATEGORIES } from '@/lib/categories';
import { startOfDayIso } from '@/lib/time';

export type RangeKind = 'week' | 'month';
export interface DateRange {
  /** Primer día (incluido) */
  from: string;
  /** Último día (incluido) */
  to: string;
}

const parse = (date: string) => new Date(`${date}T12:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  const d = parse(date);
  d.setUTCDate(d.getUTCDate() + days);
  return iso(d);
}

/** Lunes a domingo del periodo que contiene `date`. */
export function weekOf(date: string): DateRange {
  const sinceMonday = (parse(date).getUTCDay() + 6) % 7;
  const from = addDays(date, -sinceMonday);
  return { from, to: addDays(from, 6) };
}

/** Del día 1 al último día del mes que contiene `date`. */
export function monthOf(date: string): DateRange {
  const d = parse(date);
  const from = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12)));
  const to = iso(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)));
  return { from, to };
}

export const rangeOf = (kind: RangeKind, date: string): DateRange => (kind === 'week' ? weekOf(date) : monthOf(date));

/** Periodo anterior (-1) o siguiente (+1). */
export function shiftRange(kind: RangeKind, range: DateRange, direction: -1 | 1): DateRange {
  return kind === 'week' ? weekOf(addDays(range.from, 7 * direction)) : monthOf(addDays(direction < 0 ? range.from : range.to, direction));
}

/** Todos los días del periodo, en orden. */
export function daysOf(range: DateRange): string[] {
  const days: string[] = [];
  for (let d = range.from; d <= range.to; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * Periodo exclusivo `[from, to)` para la nube: 00:00 del primer día y 00:00 del día siguiente al último,
 * en la zona horaria del perfil (spec F5, «Definiciones → Periodo»).
 */
export function cloudPeriod(range: DateRange, timeZone: string): { from: string; to: string } {
  return { from: startOfDayIso(range.from, timeZone), to: startOfDayIso(addDays(range.to, 1), timeZone) };
}

export interface RangeTotals {
  /** Segundos activos (productivo, neutro, distracción e IA) */
  active: number;
  /** Segundos productivos; con `aiCounts` suman también los de IA (D-7) */
  productive: number;
  ai: number;
}

/** Suma de segundos del periodo a partir de los días de `RangeView` (dato local: se puede sumar aquí). */
export function rangeTotals(view: RangeView, aiCounts: boolean): RangeTotals {
  const sum = (c: Category) => view.days.reduce((acc, d) => acc + (d.totals[c] ?? 0), 0);
  const ai = sum('ai');
  return {
    active: WORK_CATEGORIES.reduce((acc, c) => acc + sum(c), 0),
    productive: sum('productive') + (aiCounts ? ai : 0),
    ai,
  };
}

export interface TaskGroup {
  key: string;
  /** null = entradas sin tarea */
  projectName: string | null;
  seconds: number;
  tasks: { key: string; title: string; seconds: number }[];
}

/** Agrupa `my_time_by_task` por proyecto (el mayor primero); las entradas sin tarea van en un grupo propio. */
export function groupByProject(rows: TimeByTask[], noTask: string): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  for (const row of rows) {
    if (row.seconds <= 0) continue;
    const key = row.projectId ?? 'none';
    const group = groups.get(key) ?? { key, projectName: row.projectId ? (row.projectName ?? noTask) : null, seconds: 0, tasks: [] };
    group.seconds += row.seconds;
    if (row.projectId) group.tasks.push({ key: row.taskId ?? `${key}:none`, title: row.taskTitle ?? noTask, seconds: row.seconds });
    groups.set(key, group);
  }
  const list = [...groups.values()];
  for (const g of list) g.tasks.sort((a, b) => b.seconds - a.seconds);
  // «Sin tarea» siempre al final.
  return list.sort((a, b) => Number(a.projectName === null) - Number(b.projectName === null) || b.seconds - a.seconds);
}
