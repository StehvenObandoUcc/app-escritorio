/**
 * Validador anti-alucinación de los reportes (docs/IA.md §3, spec F4 D-6 a D-8 y D-12).
 * Un solo archivo SIN importaciones: lo usan la Edge Function `ai-trial` (Deno) y la app (Clave propia y Manual).
 *
 * Reglas: 1) esquema; 2) cada fact_id existe; 3) cada número del texto está en los hechos citados (el resumen, en
 * cualquier hecho), redondeado a un decimal; 4) sin correos ni nombres de miembros.
 * Para los números: se ignoran los identificadores de hechos (F1), se aceptan coma y punto decimal y se permiten el
 * día, el mes y el año de las fechas del periodo. Límite aceptado: los números escritos en letras no se detectan.
 */

export type Fact = { id: string; metric: string; dimension: string | null; value: number; unit: string };
export type ReportItem = { text: string; fact_ids: string[] };
export type Narrative = { summary: string; insights: ReportItem[]; recommendations: ReportItem[]; insufficient_data: boolean };
export type Language = 'es' | 'en';

/** Los mismos máximos que comprueba `save_report` en SQL. */
export const NARRATIVE_LIMITS = { summary: 800, text: 400, insights: 4, recommendations: 3, factIds: 10 } as const;

export type ValidationError =
  | { code: 'no_json' }
  | { code: 'schema'; field: string }
  | { code: 'unknown_fact'; field: string; factId: string }
  | { code: 'number'; field: string; number: string }
  | { code: 'email'; field: string }
  | { code: 'name'; field: string };

export type ValidationResult = { ok: true; narrative: Narrative } | { ok: false; errors: ValidationError[] };

export interface ValidationContext {
  facts: Fact[];
  /** Nombres visibles de los miembros del equipo: no pueden aparecer en el texto. */
  names: string[];
  /** Fechas del periodo en formato AAAA-MM-DD. */
  periodFrom: string;
  periodTo: string;
}

/**
 * Primer objeto JSON del texto, con un lector de llaves balanceadas que respeta las cadenas.
 * Tolera bloques de código (```json) y texto antes o después. `undefined` si no hay ninguno válido.
 */
export function extractJson(text: string): unknown {
  for (let start = text.indexOf('{'); start !== -1; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(text.slice(start, i + 1));
        } catch {
          break;
        }
      }
    }
  }
  return undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const round1 = (n: number) => Math.round(n * 10) / 10;
const plain = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Números del texto, sin los identificadores de hechos. «37,5» y «37.5» valen lo mismo. */
export function numbersIn(text: string): { raw: string; value: number }[] {
  const withoutIds = text.replace(/\bF\d+\b/g, ' ');
  return [...withoutIds.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => ({ raw: m[0], value: Number(m[0].replace(',', '.')) }));
}

/** Números que una fecha AAAA-MM-DD permite mencionar: día, mes y año. */
const dateNumbers = (date: string) => date.split('-').map(Number).filter((n) => Number.isFinite(n));

function readItems(raw: unknown, field: 'insights' | 'recommendations', max: number, errors: ValidationError[]): ReportItem[] {
  if (!Array.isArray(raw) || raw.length > max) {
    errors.push({ code: 'schema', field });
    return [];
  }
  return raw.map((item, i) => {
    const at = `${field}[${i}]`;
    if (!isRecord(item) || typeof item.text !== 'string' || !Array.isArray(item.fact_ids)) {
      errors.push({ code: 'schema', field: at });
      return { text: '', fact_ids: [] };
    }
    const ids = item.fact_ids;
    if (item.text.trim().length === 0 || item.text.length > NARRATIVE_LIMITS.text || ids.length === 0 || ids.length > NARRATIVE_LIMITS.factIds || !ids.every((x) => typeof x === 'string')) {
      errors.push({ code: 'schema', field: at });
    }
    return { text: item.text, fact_ids: ids.filter((x): x is string => typeof x === 'string') };
  });
}

/** Aplica las cuatro reglas. Si pasa, devuelve la narrativa limpia (sin claves de más), lista para `save_report`. */
export function validateNarrative(raw: unknown, ctx: ValidationContext): ValidationResult {
  if (raw === undefined) return { ok: false, errors: [{ code: 'no_json' }] };
  if (!isRecord(raw)) return { ok: false, errors: [{ code: 'schema', field: 'root' }] };
  const errors: ValidationError[] = [];

  const summary = typeof raw.summary === 'string' ? raw.summary : '';
  if (summary.trim().length === 0 || summary.length > NARRATIVE_LIMITS.summary) errors.push({ code: 'schema', field: 'summary' });
  if (typeof raw.insufficient_data !== 'boolean') errors.push({ code: 'schema', field: 'insufficient_data' });
  const insights = readItems(raw.insights, 'insights', NARRATIVE_LIMITS.insights, errors);
  const recommendations = readItems(raw.recommendations, 'recommendations', NARRATIVE_LIMITS.recommendations, errors);
  const narrative: Narrative = { summary, insights, recommendations, insufficient_data: raw.insufficient_data === true };
  if (narrative.insufficient_data && insights.length + recommendations.length > 0) errors.push({ code: 'schema', field: 'insufficient_data' });

  const byId = new Map(ctx.facts.map((f) => [f.id, f]));
  const periodNumbers = [...dateNumbers(ctx.periodFrom), ...dateNumbers(ctx.periodTo)];
  const allValues = ctx.facts.map((f) => f.value);
  const namePatterns = [...new Set(ctx.names.flatMap((n) => [n, ...n.split(/\s+/)]).map((n) => plain(n.trim())).filter((n) => n.length >= 3))].map(
    (n) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'u'),
  );

  const checkText = (field: string, text: string, allowed: number[]) => {
    for (const n of numbersIn(text)) {
      if (!allowed.some((v) => round1(v) === round1(n.value)) && !periodNumbers.includes(n.value)) errors.push({ code: 'number', field, number: n.raw });
    }
    if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(text)) errors.push({ code: 'email', field });
    const lower = plain(text);
    if (namePatterns.some((re) => re.test(lower))) errors.push({ code: 'name', field });
  };

  checkText('summary', summary, allValues);
  for (const [field, list] of [['insights', insights], ['recommendations', recommendations]] as const) {
    list.forEach((item, i) => {
      const cited: number[] = [];
      for (const id of item.fact_ids) {
        const fact = byId.get(id);
        if (fact) cited.push(fact.value);
        else errors.push({ code: 'unknown_fact', field: `${field}[${i}]`, factId: id });
      }
      checkText(`${field}[${i}]`, item.text, cited);
    });
  }

  return errors.length ? { ok: false, errors } : { ok: true, narrative };
}

const FALLBACK_TEXT = {
  es: {
    summary: 'Resumen hecho sin IA: la respuesta de la IA no cumplió las reglas del reporte, así que aquí solo están las cifras principales.',
    empty: 'No hay datos suficientes en este periodo para un resumen.',
    hours_active: 'Tiempo activo: {v} h.',
    share_ai: 'El {v} % del tiempo activo fue con IA.',
    tasks_done: 'Tareas terminadas: {v}.',
    tasks_overdue: 'Tareas vencidas: {v}.',
  },
  en: {
    summary: 'Summary made without AI: the AI response did not follow the report rules, so only the main figures are shown here.',
    empty: 'There is not enough data in this period for a summary.',
    hours_active: 'Active time: {v} h.',
    share_ai: '{v}% of active time was with AI.',
    tasks_done: 'Tasks finished: {v}.',
    tasks_overdue: 'Overdue tasks: {v}.',
  },
} as const;

/** Plantilla fija hecha por el código (D-8): cita solo hechos y sus valores exactos, así que siempre pasa el validador. */
export function fallbackNarrative(facts: Fact[], language: Language): Narrative {
  const text = FALLBACK_TEXT[language];
  const format = (v: number) => (language === 'es' ? String(v).replace('.', ',') : String(v));
  const pick: [keyof typeof text, (f: Fact) => boolean][] = [
    ['hours_active', (f) => f.metric === 'hours_active'],
    ['share_ai', (f) => f.metric === 'share_category' && f.dimension === 'ai'],
    ['tasks_done', (f) => f.metric === 'tasks_done'],
    ['tasks_overdue', (f) => f.metric === 'tasks_overdue'],
  ];
  const insights = pick.flatMap(([key, match]) => {
    const fact = facts.find(match);
    return fact ? [{ text: text[key].replace('{v}', format(fact.value)), fact_ids: [fact.id] }] : [];
  });
  if (insights.length === 0) return { summary: text.empty, insights: [], recommendations: [], insufficient_data: true };
  return { summary: text.summary, insights, recommendations: [], insufficient_data: false };
}
