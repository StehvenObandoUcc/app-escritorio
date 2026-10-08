/**
 * Reportes en la app (spec F4): generar con la clave propia o en modo Manual, etiquetas de las cifras y exportación.
 * El modo Gratis va entero por la Edge Function (`cloud.generateFreeReport`); estos dos usan el mismo prompt v2,
 * el mismo validador y el mismo reintento que ella (D-6 a D-8, D-11, D-12).
 */
import type { Bridge } from '@/bridge/contract';
import type { Cloud, Fact, Narrative, ReportFacts, ReportLanguage, ReportRequest, ReportRun } from '@/cloud/contract';
import { formatDate, intlLocale, t, type TKey } from '@/i18n';
import { CATEGORY_STYLE } from '@/lib/categories';
import { buildMessages, manualPrompt, retryMessages } from '../../supabase/functions/_shared/report-prompt.ts';
import {
  extractJson,
  fallbackNarrative,
  validateNarrative,
  type ValidationContext,
  type ValidationError,
} from '../../supabase/functions/_shared/report-validator.ts';

export type { ValidationError };

const contextOf = async (cloud: Cloud, facts: ReportFacts): Promise<ValidationContext> => ({
  facts: facts.facts,
  names: await cloud.memberNames(),
  periodFrom: facts.periodFrom,
  periodTo: facts.periodTo,
});

async function saved(cloud: Cloud, id: string): Promise<ReportRun> {
  const report = await cloud.report(id);
  if (!report) throw new Error(t('reports.failed', { error: id }));
  return report;
}

/**
 * Clave propia: hechos → IA (Rust) → validador → un reintento → plantilla. Si ya existe un reporte con los mismos
 * hechos, se devuelve ese sin llamar a la IA (D-9). Un fallo del proveedor se lanza tal cual: no se guarda nada.
 */
export async function generateWithOwnKey(cloud: Cloud, bridge: Bridge, req: ReportRequest, language: ReportLanguage): Promise<{ report: ReportRun; cached: boolean }> {
  const facts = await cloud.reportFacts(req);
  const cached = await cloud.findReport(req, facts, language);
  if (cached) return { report: cached, cached: true };
  const context = await contextOf(cloud, facts);
  const messages = buildMessages(facts.facts, language);
  const first = await bridge.aiChat(messages);
  let narrative: Narrative;
  let validation: 'ok' | 'retried' | 'fallback';
  const check = validateNarrative(extractJson(first), context);
  if (check.ok) {
    narrative = check.narrative;
    validation = 'ok';
  } else {
    // Si el reintento falla por el proveedor, sale la plantilla: la primera respuesta sí llegó.
    const second = await bridge.aiChat(retryMessages(messages, first, check.errors)).catch(() => null);
    const recheck = second === null ? null : validateNarrative(extractJson(second), context);
    if (recheck?.ok) {
      narrative = recheck.narrative;
      validation = 'retried';
    } else {
      narrative = fallbackNarrative(facts.facts, language);
      validation = 'fallback';
    }
  }
  const id = await cloud.saveReport(req, facts.factsHash, narrative, 'own_key', validation, language);
  return { report: await saved(cloud, id), cached: false };
}

/** Modo Manual, paso 1: los hechos y el texto para copiar (o el reporte ya guardado con los mismos hechos). */
export async function prepareManual(cloud: Cloud, req: ReportRequest, language: ReportLanguage): Promise<{ facts: ReportFacts; prompt: string; cached: ReportRun | null }> {
  const facts = await cloud.reportFacts(req);
  return { facts, prompt: manualPrompt(facts.facts, language), cached: await cloud.findReport(req, facts, language) };
}

/** La respuesta pegada no pasó el validador: `errors` dice por qué, para mostrarlo con claridad (AC-21). */
export class ManualAnswerError extends Error {
  constructor(readonly errors: ValidationError[]) {
    super('invalid');
    this.name = 'ManualAnswerError';
  }
}

/** Modo Manual, paso 2: valida la respuesta pegada y la guarda. Sin reintento: la persona corrige y vuelve a pegar. */
export async function finishManual(cloud: Cloud, req: ReportRequest, facts: ReportFacts, answer: string, language: ReportLanguage): Promise<ReportRun> {
  const check = validateNarrative(extractJson(answer), await contextOf(cloud, facts));
  if (!check.ok) throw new ManualAnswerError(check.errors);
  return saved(cloud, await cloud.saveReport(req, facts.factsHash, check.narrative, 'manual', 'ok', language));
}

/** Mensaje de cada error del validador para la persona. */
export function describeError(e: ValidationError): string {
  switch (e.code) {
    case 'no_json':
      return t('reports.manual.errors.no_json');
    case 'schema':
      return t('reports.manual.errors.schema', { field: e.field });
    case 'unknown_fact':
      return t('reports.manual.errors.unknown_fact', { field: e.field, factId: e.factId });
    case 'number':
      return t('reports.manual.errors.number', { field: e.field, number: e.number });
    case 'email':
      return t('reports.manual.errors.email', { field: e.field });
    case 'name':
      return t('reports.manual.errors.name', { field: e.field });
  }
}

// ---- Cifras: etiquetas y valores (las cifras de la pantalla salen de aquí, D-19) ----

const AI_TOOLS = ['chatgpt', 'claude', 'gemini', 'deepseek', 'copilot', 'ollama', 'lmstudio', 'other'];
const USAGES = ['code', 'writing', 'analysis', 'other', 'untagged'];

/** Nombre de una cifra: «Tiempo por categoría · Productivo». */
export function factLabel(f: Fact): string {
  const metric = t(`reports.metrics.${f.metric}` as TKey);
  if (!f.dimension) return metric;
  let dimension = f.dimension;
  if ((f.metric === 'hours_category' || f.metric === 'share_category') && f.dimension in CATEGORY_STYLE) {
    dimension = CATEGORY_STYLE[f.dimension as keyof typeof CATEGORY_STYLE].label;
  } else if (f.metric === 'hours_ai_tool' && AI_TOOLS.includes(f.dimension)) {
    dimension = t(`reports.tools.${f.dimension}` as TKey);
  } else if (f.metric === 'hours_ai_usage' && USAGES.includes(f.dimension)) {
    dimension = t(`aiUsage.${f.dimension}` as TKey);
  }
  return `${metric} · ${dimension}`;
}

export const formatNumber = (v: number) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(v);

/** Valor con su unidad: «2,7 h», «37 %», «0,4 días». */
export function factValue(f: Fact): string {
  const v = formatNumber(f.value);
  const key = { h: 'h', '%': 'pct', n: 'n', d: 'd' }[f.unit];
  return t(`reports.units.${key}` as TKey, { v });
}

export const periodLabel = (r: Pick<ReportRun, 'periodFrom' | 'periodTo'>) => {
  const day = (d: string) => formatDate(d, { day: 'numeric', month: 'short' });
  return r.periodFrom === r.periodTo ? day(r.periodFrom) : t('reports.view.period', { from: day(r.periodFrom), to: day(r.periodTo) });
};

// ---- Exportación (RI-10, D-15): la genera el código, con las mismas cifras ----

export function toMarkdown(r: ReportRun, title: string): string {
  const byId = new Map(r.facts.map((f) => [f.id, f]));
  const cites = (ids: string[]) => ids.map((id) => byId.get(id)).filter((f): f is Fact => Boolean(f)).map((f) => `${factLabel(f)}: ${factValue(f)}`).join('; ');
  const items = (list: Narrative['insights']) => list.map((i) => `- ${i.text} _(${t('reports.view.cites')}: ${cites(i.fact_ids)})_`).join('\n');
  return [
    `# ${title}`,
    '',
    periodLabel(r),
    '',
    `## ${t('reports.view.figures')}`,
    '',
    ...r.facts.map((f) => `- ${factLabel(f)}: **${factValue(f)}**`),
    '',
    `## ${t('reports.view.summary')}`,
    '',
    r.narrative.summary,
    ...(r.narrative.insights.length ? ['', `## ${t('reports.view.insights')}`, '', items(r.narrative.insights)] : []),
    ...(r.narrative.recommendations.length ? ['', `## ${t('reports.view.recommendations')}`, '', items(r.narrative.recommendations)] : []),
    '',
    `_${t('reports.view.aiWritten')}_`,
    '',
  ].join('\n');
}

export const toJson = (r: ReportRun) =>
  JSON.stringify({ period: { from: r.periodFrom, to: r.periodTo }, scope: r.scope, facts: r.facts, narrative: r.narrative, mode: r.mode, validation: r.validation }, null, 2);

/** CSV con solo los hechos. Los campos se citan siempre: ningún texto rompe las columnas. */
export function toCsv(r: ReportRun): string {
  const cell = (v: string | number) => `"${String(v).replaceAll('"', '""')}"`;
  const header = [t('reports.export.metric'), t('reports.export.detail'), t('reports.export.value'), t('reports.export.unit')];
  return [header, ...r.facts.map((f) => [f.metric, f.dimension ?? '', f.value, f.unit])].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** Descarga un archivo generado en la página. En la app real va a Descargas (V1 de la spec F4). */
export function downloadText(name: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: `${type};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
