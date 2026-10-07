/**
 * Agrupación de los bloques del día para mostrarlos sin ruido. Solo cambia la presentación:
 * la suma de los segundos agrupados es exactamente la de los bloques originales (R5).
 */
import { t } from '@/i18n';
import type { ActivityBlock, Category } from '@/bridge/contract';

const secondsOf = (b: { startedAt: string; endedAt: string }) =>
  Math.max(0, Math.round((Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000));

/** Bloques seguidos de la misma app y categoría, unidos en uno. */
export interface Segment {
  appName: string;
  category: Category;
  aiTool: string | null;
  startedAt: string;
  endedAt: string;
  seconds: number;
  /** Títulos distintos, en orden de aparición (solo locales) */
  titles: string[];
  blockIds: string[];
}

export type TimelineRow =
  | { kind: 'segment'; segment: Segment }
  /** Racha de cambios cortos (menos de `minSeconds` cada uno), en una sola fila desplegable */
  | { kind: 'quick'; startedAt: string; endedAt: string; seconds: number; segments: Segment[] };

/** Hueco máximo entre dos bloques para considerarlos seguidos. */
const MAX_GAP_MS = 5_000;

export function groupConsecutive(blocks: ActivityBlock[]): Segment[] {
  const out: Segment[] = [];
  for (const b of [...blocks].sort((x, y) => x.startedAt.localeCompare(y.startedAt))) {
    const last = out[out.length - 1];
    const joins =
      last &&
      last.appName === b.appName &&
      last.category === b.category &&
      last.aiTool === b.aiTool &&
      Date.parse(b.startedAt) - Date.parse(last.endedAt) <= MAX_GAP_MS;
    if (last && joins) {
      last.endedAt = b.endedAt > last.endedAt ? b.endedAt : last.endedAt;
      last.seconds += secondsOf(b);
      last.blockIds.push(b.id);
      if (b.title && !last.titles.includes(b.title)) last.titles.push(b.title);
    } else {
      out.push({
        appName: b.appName,
        category: b.category,
        aiTool: b.aiTool,
        startedAt: b.startedAt,
        endedAt: b.endedAt,
        seconds: secondsOf(b),
        titles: b.title ? [b.title] : [],
        blockIds: [b.id],
      });
    }
  }
  return out;
}

/**
 * Línea de tiempo: los tramos largos se ven solos; dos o más tramos cortos seguidos se juntan en
 * una fila «Cambios rápidos». Un tramo corto aislado se deja tal cual.
 */
export function buildTimeline(blocks: ActivityBlock[], minSeconds = 60): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let quick: Segment[] = [];
  const flush = () => {
    if (quick.length === 1) rows.push({ kind: 'segment', segment: quick[0]! });
    if (quick.length > 1) {
      rows.push({
        kind: 'quick',
        startedAt: quick[0]!.startedAt,
        endedAt: quick[quick.length - 1]!.endedAt,
        seconds: quick.reduce((sum, s) => sum + s.seconds, 0),
        segments: quick,
      });
    }
    quick = [];
  };
  for (const segment of groupConsecutive(blocks)) {
    if (segment.seconds < minSeconds) {
      quick.push(segment);
    } else {
      flush();
      rows.push({ kind: 'segment', segment });
    }
  }
  flush();
  return rows;
}

export interface AppTotal {
  appName: string;
  seconds: number;
  /** Categoría con más tiempo en esta app */
  mainCategory: Category;
  /** Segundos por categoría dentro de la app */
  byCategory: Partial<Record<Category, number>>;
  /** Herramientas de IA usadas dentro de la app (p. ej. Claude en Brave) */
  aiTools: string[];
}

/** Tiempo por sitio web (dominio, ADR-0009), de más a menos. Mismo cálculo que `appTotals`. */
export function domainTotals(blocks: ActivityBlock[]): AppTotal[] {
  return appTotals(blocks.filter((b) => b.domain).map((b) => ({ ...b, appName: b.domain! })));
}

/** Tiempo por herramienta de IA (Claude, Gemini, Perplexity…), de más a menos. */
export function aiToolTotals(blocks: ActivityBlock[]): { tool: string; seconds: number }[] {
  const map = new Map<string, number>();
  for (const b of blocks) {
    if (b.category !== 'ai') continue;
    const tool = b.aiTool ?? t('apps.otherAi');
    map.set(tool, (map.get(tool) ?? 0) + secondsOf(b));
  }
  return [...map.entries()].map(([tool, seconds]) => ({ tool, seconds })).sort((a, b) => b.seconds - a.seconds);
}

/** Categorías que no son una app: no entran en el resumen por app. */
const NOT_APPS: Category[] = ['idle', 'paused', 'break'];

/** Tiempo por app, de más a menos. Sin inactividad, pausas ni descansos. */
export function appTotals(blocks: ActivityBlock[]): AppTotal[] {
  const map = new Map<string, AppTotal>();
  for (const b of blocks) {
    if (NOT_APPS.includes(b.category)) continue;
    const t = map.get(b.appName) ?? { appName: b.appName, seconds: 0, mainCategory: b.category, byCategory: {}, aiTools: [] };
    const s = secondsOf(b);
    t.seconds += s;
    t.byCategory[b.category] = (t.byCategory[b.category] ?? 0) + s;
    if (b.aiTool && !t.aiTools.includes(b.aiTool)) t.aiTools.push(b.aiTool);
    map.set(b.appName, t);
  }
  for (const t of map.values()) {
    t.mainCategory = (Object.entries(t.byCategory) as [Category, number][]).sort((a, b) => b[1] - a[1])[0]![0];
  }
  return [...map.values()].sort((a, b) => b.seconds - a.seconds);
}
