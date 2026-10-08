/**
 * Lógica de la Edge Function `ai-trial` (modo Gratis, docs/IA.md §4, spec F4 D-6 a D-10), sin Deno ni red:
 * todo lo de fuera llega en `TrialDeps` (cliente de Supabase con el JWT de la persona, cliente de servicio, fetch y
 * reloj). `index.ts` arma esas dependencias; `supabase/tests/ai_trial.test.ts` la prueba con dobles.
 */
import { buildMessages, PROMPT_VERSION, retryMessages, type ChatMessage } from '../_shared/report-prompt.ts';
import { extractJson, fallbackNarrative, validateNarrative, type Fact, type Language, type Narrative } from '../_shared/report-validator.ts';

export const DEEPSEEK_URL = 'https://api.deepseek.com/chat/completions';
/** Si la primera respuesta llegó después de esto, no hay tiempo para el reintento: sale la plantilla. */
export const RETRY_BUDGET_MS = 20_000;
const PROVIDER_TIMEOUT_MS = 30_000;
const SCOPES = ['personal', 'project', 'team'] as const;
const PERIODS = ['today', 'yesterday', 'this_week', 'last_week'] as const;
const LANGUAGES = ['es', 'en'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DbError = { message: string; code?: string };
export type DbResult<T> = { data: T | null; error: DbError | null };

export interface TrialRequest {
  team: string;
  scope: (typeof SCOPES)[number];
  subject: string;
  period: (typeof PERIODS)[number];
  language: Language;
}

export interface ReportKey {
  team: string;
  scope: string;
  subject: string;
  periodFrom: string;
  periodTo: string;
  factsHash: string;
  promptVersion: string;
  language: Language;
}

/** Lo que la función necesita de Supabase. `index.ts` lo implementa con supabase-js. */
export interface Db {
  rpc<T>(fn: string, args: Record<string, unknown>): Promise<DbResult<T>>;
  /** Reporte con la misma clave de caché (D-9), con SELECT bajo RLS. */
  findReport(key: ReportKey): Promise<Record<string, unknown> | null>;
  reportById(id: string): Promise<Record<string, unknown> | null>;
  /** Nombres visibles de las personas que comparten equipo: no pueden aparecer en el texto. */
  memberNames(): Promise<string[]>;
}

export interface TrialDeps {
  enabled: boolean;
  model: string;
  apiKey: string;
  /** Persona de la sesión (null si el JWT no es válido). */
  userId: string | null;
  /** Cliente con el JWT de la persona: RLS y permisos son los suyos. */
  user: Db;
  /** Cliente con service_role: solo `refund_ai_trial` y `mark_trial_report`. */
  service: Pick<Db, 'rpc'>;
  fetch: typeof fetch;
  now: () => number;
}

export type TrialResponse = { status: number; body: Record<string, unknown> };

type FactsResult = { facts: Fact[]; facts_hash: string; period_from: string; period_to: string };
type ProviderAnswer = { failed: true } | { failed: false; text: string };

const reply = (status: number, body: Record<string, unknown>): TrialResponse => ({ status, body });

function parseRequest(body: unknown): TrialRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Record<string, unknown>;
  const ok =
    typeof b.team === 'string' && UUID.test(b.team) &&
    typeof b.subject === 'string' && UUID.test(b.subject) &&
    SCOPES.includes(b.scope as TrialRequest['scope']) &&
    PERIODS.includes(b.period as TrialRequest['period']) &&
    LANGUAGES.includes(b.language as Language);
  return ok ? (b as unknown as TrialRequest) : null;
}

/** Llamada a DeepSeek (formato OpenAI). Falla del proveedor = sin respuesta, error de red o estado distinto de 2xx. */
async function callProvider(deps: TrialDeps, messages: ChatMessage[]): Promise<ProviderAnswer> {
  try {
    const res = await deps.fetch(DEEPSEEK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deps.apiKey}` },
      body: JSON.stringify({ model: deps.model, messages, temperature: 0.2, max_tokens: 800, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    });
    if (!res.ok) return { failed: true };
    const data = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = data.choices?.[0]?.message?.content;
    return { failed: false, text: typeof content === 'string' ? content : '' };
  } catch {
    return { failed: true };
  }
}

export async function handleTrial(body: unknown, deps: TrialDeps): Promise<TrialResponse> {
  // 1. Interruptor de apagado y sesión.
  if (!deps.enabled || !deps.model || !deps.apiKey) return reply(503, { reason: 'disabled' });
  if (!deps.userId) return reply(401, { reason: 'unauthorized' });
  const req = parseRequest(body);
  if (!req) return reply(400, { reason: 'bad_request' });

  // 2. Hechos con el JWT de la persona: la base decide qué puede ver (D-1).
  const facts = await deps.user.rpc<FactsResult>('get_report_facts', { p_team: req.team, p_scope: req.scope, p_subject: req.subject, p_period: req.period });
  if (facts.error || !facts.data) return reply(facts.error?.code === '42501' ? 403 : 400, { reason: 'facts', message: facts.error?.message ?? '' });
  const { facts: list, facts_hash, period_from, period_to } = facts.data;

  // 3. Caché: mismos hechos, fechas, prompt e idioma → el guardado, sin gastar cupo (D-9).
  const cached = await deps.user.findReport({
    team: req.team, scope: req.scope, subject: req.subject, periodFrom: period_from, periodTo: period_to,
    factsHash: facts_hash, promptVersion: PROMPT_VERSION, language: req.language,
  });
  if (cached) return reply(200, { report: cached, cached: true });

  // 4. Cupo.
  const quota = await deps.user.rpc<{ ok: boolean; reason?: string }>('consume_ai_trial', { p_team: req.team });
  if (quota.error || !quota.data) return reply(quota.error?.code === '42501' ? 403 : 500, { reason: 'quota', message: quota.error?.message ?? '' });
  if (!quota.data.ok) return reply(429, { reason: quota.data.reason ?? 'user_limit' });
  const refund = () => deps.service.rpc('refund_ai_trial', { p_team: req.team, p_user: deps.userId });

  // 5. IA, validador, un reintento y plantilla (D-8). La plantilla cuenta cupo; solo se devuelve si falla el proveedor.
  const started = deps.now();
  const context = { facts: list, names: await deps.user.memberNames(), periodFrom: period_from, periodTo: period_to };
  const messages = buildMessages(list, req.language);
  const first = await callProvider(deps, messages);
  if (first.failed) {
    await refund();
    return reply(502, { reason: 'provider' });
  }
  let narrative: Narrative;
  let validation: 'ok' | 'retried' | 'fallback';
  const check = validateNarrative(extractJson(first.text), context);
  if (check.ok) {
    narrative = check.narrative;
    validation = 'ok';
  } else {
    const second = deps.now() - started < RETRY_BUDGET_MS ? await callProvider(deps, retryMessages(messages, first.text, check.errors)) : null;
    const recheck = second && !second.failed ? validateNarrative(extractJson(second.text), context) : null;
    if (recheck?.ok) {
      narrative = recheck.narrative;
      validation = 'retried';
    } else {
      narrative = fallbackNarrative(list, req.language);
      validation = 'fallback';
    }
  }

  // 6. Guardar con el JWT de la persona y marcarlo como validado en el servidor (D-6).
  const saved = await deps.user.rpc<string>('save_report', {
    p_team: req.team, p_scope: req.scope, p_subject: req.subject, p_period: req.period, p_facts_hash: facts_hash,
    p_narrative: narrative, p_mode: 'free', p_validation: validation, p_prompt_version: PROMPT_VERSION, p_language: req.language,
  });
  if (saved.error || !saved.data) {
    // El cupo solo se devuelve por fallo de red o del proveedor (D-10); un fallo al guardar lo gasta.
    return reply(saved.error?.code === '40001' ? 409 : 500, { reason: saved.error?.code === '40001' ? 'changed' : 'save', message: saved.error?.message ?? '' });
  }
  // Si esto falla, el reporte queda «client»: es un dato informativo, no bloquea.
  await deps.service.rpc('mark_trial_report', { p_id: saved.data }).catch(() => undefined);
  return reply(200, { report: await deps.user.reportById(saved.data), cached: false });
}
