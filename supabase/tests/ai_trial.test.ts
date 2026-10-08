import { describe, expect, it, vi } from 'vitest';
import { DEEPSEEK_URL, handleTrial, RETRY_BUDGET_MS, type Db, type DbResult, type TrialDeps } from '../functions/ai-trial/handler.ts';
import { FACTS } from './fixtures/report-responses.ts';

/**
 * Edge Function ai-trial con dobles (spec F4: AC-12, AC-14, AC-16, AC-17, AC-10).
 * El doble de Supabase responde cada RPC con lo que diga la prueba y anota las llamadas.
 */
const TEAM = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const REQUEST = { team: TEAM, scope: 'personal', subject: USER, period: 'today', language: 'es' };
const GOOD = JSON.stringify({ summary: 'Resumen con 2,7 h.', insights: [{ text: 'Terminaste 1 tarea.', fact_ids: ['F6'] }], recommendations: [], insufficient_data: false });
const BAD = JSON.stringify({ summary: 'Trabajaste 9 h.', insights: [], recommendations: [], insufficient_data: false });

type Calls = { fn: string; args: Record<string, unknown> }[];

function fakeDb(rpcs: Record<string, DbResult<unknown> | (() => Promise<DbResult<unknown>>)>, cached: Record<string, unknown> | null = null) {
  const calls: Calls = [];
  const db: Db = {
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      calls.push({ fn, args });
      const r = rpcs[fn];
      if (!r) throw new Error(`RPC inesperada: ${fn}`);
      return (typeof r === 'function' ? await r() : r) as DbResult<T>;
    },
    findReport: async () => cached,
    reportById: async (id) => ({ id }),
    memberNames: async () => ['Daniela Ruiz'],
  };
  return { db, calls };
}

const answer = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function setup(opts: { answers?: (Response | Error)[]; quota?: { ok: boolean; reason?: string }; cached?: Record<string, unknown> | null; now?: () => number; mark?: () => Promise<DbResult<unknown>> } = {}) {
  const user = fakeDb(
    {
      get_report_facts: { data: { facts: FACTS, facts_hash: 'h1', period_from: '2026-10-08', period_to: '2026-10-08' }, error: null },
      consume_ai_trial: { data: opts.quota ?? { ok: true }, error: null },
      save_report: { data: 'report-1', error: null },
    },
    opts.cached ?? null,
  );
  const service = fakeDb({ refund_ai_trial: { data: null, error: null }, mark_trial_report: opts.mark ?? { data: true, error: null } });
  const queue = [...(opts.answers ?? [answer(GOOD)])];
  const fetch = vi.fn(async () => {
    const next = queue.shift();
    if (!next || next instanceof Error) throw next ?? new Error('sin respuesta');
    return next;
  });
  const deps: TrialDeps = { enabled: true, model: 'deepseek-chat', apiKey: 'clave-de-prueba', userId: USER, user: user.db, service: service.db, fetch: fetch as unknown as typeof globalThis.fetch, now: opts.now ?? (() => 0) };
  const rpcNames = (c: Calls) => c.map((x) => x.fn);
  return { deps, fetch, user: user.calls, service: service.calls, rpcNames };
}

describe('ai-trial', () => {
  it('con el interruptor apagado responde 503 sin tocar nada (AC-16)', async () => {
    const s = setup();
    expect(await handleTrial(REQUEST, { ...s.deps, enabled: false })).toEqual({ status: 503, body: { reason: 'disabled' } });
    expect(s.user).toEqual([]);
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('sin sesión 401 y con datos inválidos 400', async () => {
    const s = setup();
    expect((await handleTrial(REQUEST, { ...s.deps, userId: null })).status).toBe(401);
    expect((await handleTrial({ ...REQUEST, period: 'mañana' }, s.deps)).status).toBe(400);
    expect((await handleTrial({ ...REQUEST, team: 'x' }, s.deps)).status).toBe(400);
  });

  it('con el cupo agotado responde 429 con el motivo y no llama a la IA (AC-14)', async () => {
    const s = setup({ quota: { ok: false, reason: 'user_limit' } });
    expect(await handleTrial(REQUEST, s.deps)).toEqual({ status: 429, body: { reason: 'user_limit' } });
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it('un reporte ya guardado con los mismos hechos se devuelve sin gastar cupo (AC-17)', async () => {
    const s = setup({ cached: { id: 'viejo' } });
    expect(await handleTrial(REQUEST, s.deps)).toEqual({ status: 200, body: { report: { id: 'viejo' }, cached: true } });
    expect(s.rpcNames(s.user)).toEqual(['get_report_facts']);
    expect(s.fetch).not.toHaveBeenCalled();
  });

  it.each([
    ['un error 500', new Response('fallo', { status: 500 })],
    ['un 429 del proveedor', new Response('lento', { status: 429 })],
    ['un error de red', new Error('red caída')],
  ])('si el proveedor falla (%s), devuelve el cupo y responde 502 (AC-16)', async (_, failure) => {
    const s = setup({ answers: [failure] });
    expect(await handleTrial(REQUEST, s.deps)).toEqual({ status: 502, body: { reason: 'provider' } });
    expect(s.service).toEqual([{ fn: 'refund_ai_trial', args: { p_team: TEAM, p_user: USER } }]);
    expect(s.rpcNames(s.user)).not.toContain('save_report');
  });

  it('una respuesta válida se guarda en modo free y se marca como validada en el servidor (AC-10)', async () => {
    const s = setup();
    expect(await handleTrial(REQUEST, s.deps)).toEqual({ status: 200, body: { report: { id: 'report-1' }, cached: false } });
    const save = s.user.find((c) => c.fn === 'save_report')!.args;
    expect(save).toMatchObject({ p_mode: 'free', p_validation: 'ok', p_prompt_version: 'report.v2', p_facts_hash: 'h1', p_language: 'es' });
    expect(s.service).toEqual([{ fn: 'mark_trial_report', args: { p_id: 'report-1' } }]);
    const [url, init] = s.fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DEEPSEEK_URL);
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'deepseek-chat', temperature: 0.2, max_tokens: 800, response_format: { type: 'json_object' } });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer clave-de-prueba');
  });

  it('inválida y luego válida: se guarda como «retried»', async () => {
    const s = setup({ answers: [answer(BAD), answer(GOOD)] });
    await handleTrial(REQUEST, s.deps);
    expect(s.fetch).toHaveBeenCalledTimes(2);
    const retry = JSON.parse((s.fetch.mock.calls[1] as unknown as [string, RequestInit])[1].body as string) as { messages: { content: string }[] };
    expect(retry.messages.at(-1)!.content).toContain('menciona 9');
    expect(s.user.find((c) => c.fn === 'save_report')!.args).toMatchObject({ p_validation: 'retried' });
  });

  it('inválida dos veces: sale la plantilla, el cupo queda gastado (AC-12)', async () => {
    const s = setup({ answers: [answer(BAD), answer('sin json')] });
    expect((await handleTrial(REQUEST, s.deps)).status).toBe(200);
    const save = s.user.find((c) => c.fn === 'save_report')!.args;
    expect(save).toMatchObject({ p_validation: 'fallback' });
    expect((save.p_narrative as { summary: string }).summary).toMatch(/sin IA/);
    expect(s.rpcNames(s.service)).toEqual(['mark_trial_report']);
  });

  it('si la primera respuesta tardó demasiado, no reintenta: plantilla', async () => {
    let t = 0;
    const s = setup({ answers: [answer(BAD), answer(GOOD)], now: () => (t += RETRY_BUDGET_MS) });
    await handleTrial(REQUEST, s.deps);
    expect(s.fetch).toHaveBeenCalledTimes(1);
    expect(s.user.find((c) => c.fn === 'save_report')!.args).toMatchObject({ p_validation: 'fallback' });
  });

  it('si marcar falla, el reporte se entrega igual (queda «client»)', async () => {
    const s = setup({ mark: () => Promise.reject(new Error('caído')) });
    expect((await handleTrial(REQUEST, s.deps)).status).toBe(200);
  });

  it('si los datos cambiaron al guardar responde 409 y no devuelve el cupo', async () => {
    const s = setup();
    const deps: TrialDeps = {
      ...s.deps,
      user: { ...s.deps.user, rpc: async (fn, args) => (fn === 'save_report' ? { data: null, error: { message: 'cambiaron', code: '40001' } } : s.deps.user.rpc(fn, args)) },
    };
    expect(await handleTrial(REQUEST, deps)).toMatchObject({ status: 409, body: { reason: 'changed' } });
    expect(s.rpcNames(s.service)).toEqual([]);
  });
});
