import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import type { ReportRequest, ReportRun } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { setLocale } from '@/i18n';
import { factLabel, factValue, finishManual, generateWithOwnKey, ManualAnswerError, prepareManual, toCsv, toMarkdown } from './reports';

/** Reportes con clave propia y en modo Manual (spec F4: AC-12, AC-13a, AC-17, AC-21, AC-26). */
async function setup() {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana Gómez');
  const team = cloud.debug.addTeam('Equipo A', ana);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  const req: ReportRequest = { teamId: team, scope: 'personal', subjectId: ana, period: 'today' };
  return { cloud, req };
}

/** Puente simulado cuya IA responde en orden lo que diga la prueba. */
function bridgeAnswering(...answers: (string | Error)[]) {
  const bridge = createMockBridge();
  const aiChat = vi.fn(async () => {
    const next = answers.shift();
    if (next === undefined || next instanceof Error) throw next ?? new Error('sin respuesta');
    return next;
  });
  return { bridge: { ...bridge, aiChat }, aiChat };
}

const json = (summary: string, insights: [string, string[]][] = []) =>
  JSON.stringify({ summary, insights: insights.map(([text, fact_ids]) => ({ text, fact_ids })), recommendations: [], insufficient_data: false });

afterEach(() => setLocale('es'));

describe('clave propia', () => {
  it('una respuesta válida se guarda tal cual, en modo own_key', async () => {
    const { cloud, req } = await setup();
    const { bridge, aiChat } = bridgeAnswering(json('Sin tareas terminadas: 0.', [['Ninguna tarea vencida (0).', ['F3']]]));
    const { report, cached } = await generateWithOwnKey(cloud, bridge, req, 'es');
    expect(cached).toBe(false);
    expect(report).toMatchObject({ mode: 'own_key', validation: 'ok', validatedBy: 'client' });
    expect(report.narrative.insights[0]!.text).toContain('vencida');
    expect(aiChat).toHaveBeenCalledTimes(1);
  });

  it('inválida y luego válida → «retried»; inválida dos veces → plantilla (AC-12)', async () => {
    const first = await setup();
    const retried = bridgeAnswering(json('Trabajaste 37 h.'), json('Resumen sin cifras.'));
    expect((await generateWithOwnKey(first.cloud, retried.bridge, first.req, 'es')).report.validation).toBe('retried');

    const second = await setup();
    const bad = bridgeAnswering(json('Trabajaste 37 h.'), 'sin json');
    const { report } = await generateWithOwnKey(second.cloud, bad.bridge, second.req, 'es');
    expect(report.validation).toBe('fallback');
    expect(report.narrative.summary).toMatch(/sin IA/);
  });

  it('con los mismos hechos devuelve el guardado sin llamar a la IA (AC-17)', async () => {
    const { cloud, req } = await setup();
    const one = bridgeAnswering(json('Resumen.'));
    const first = await generateWithOwnKey(cloud, one.bridge, req, 'es');
    const two = bridgeAnswering();
    const again = await generateWithOwnKey(cloud, two.bridge, req, 'es');
    expect(again).toEqual({ report: first.report, cached: true });
    expect(two.aiChat).not.toHaveBeenCalled();
  });

  it('si el proveedor falla, no se guarda nada y el error llega tal cual (AC-18)', async () => {
    const { cloud, req } = await setup();
    const { bridge } = bridgeAnswering(new Error('La clave de IA no es válida o no tiene permiso.'));
    await expect(generateWithOwnKey(cloud, bridge, req, 'es')).rejects.toThrow(/clave de IA/);
    expect(await cloud.reports(req.teamId)).toEqual([]);
  });
});

describe('modo Manual (AC-21)', () => {
  it('el prompt lleva solo los hechos; una respuesta con nombres o cifras inventadas se rechaza con el motivo', async () => {
    const { cloud, req } = await setup();
    const { facts, prompt } = await prepareManual(cloud, req, 'es');
    expect(prompt).toContain('HECHOS:');
    expect(prompt).toContain('"tasks_done"');
    expect(prompt).not.toMatch(/Ana|ana@pulso/);
    const attempt = (answer: string) => finishManual(cloud, req, facts, answer, 'es');
    const rejected = await attempt(json('Ana trabajó 37 h.')).catch((e: unknown) => e);
    expect(rejected).toBeInstanceOf(ManualAnswerError);
    expect((rejected as ManualAnswerError).errors.map((e) => e.code).sort()).toEqual(['name', 'number']);
    const saved = await attempt('Claro, aquí está:\n```json\n' + json('Día tranquilo.') + '\n```');
    expect(saved).toMatchObject({ mode: 'manual', validation: 'ok' });
  });
});

describe('cifras y exportación (AC-13a, AC-26)', () => {
  const report: ReportRun = {
    id: '11111111-1111-4111-8111-111111111111',
    teamId: '22222222-2222-4222-8222-222222222222',
    scope: 'personal',
    subjectId: '33333333-3333-4333-8333-333333333333',
    period: 'yesterday',
    periodFrom: '2026-10-07',
    periodTo: '2026-10-07',
    facts: [
      { id: 'F1', metric: 'hours_active', dimension: null, value: 2.7, unit: 'h' },
      { id: 'F2', metric: 'share_category', dimension: 'ai', value: 37, unit: '%' },
      { id: 'F3', metric: 'hours_ai_tool', dimension: 'chatgpt', value: 0.5, unit: 'h' },
    ],
    narrative: { summary: 'Buen día, "con comillas".', insights: [{ text: 'IA al 37 %.', fact_ids: ['F2'] }], recommendations: [], insufficient_data: false },
    mode: 'free',
    validation: 'ok',
    validatedBy: 'server',
    language: 'es',
    dataUntil: null,
    createdBy: null,
    createdAt: '2026-10-08T12:00:00Z',
  };

  it('las cifras se leen de los hechos, con su unidad y en el idioma de la app', () => {
    expect(report.facts.map((f) => `${factLabel(f)}: ${factValue(f)}`)).toEqual([
      'Tiempo activo: 2,7 h',
      'Parte del tiempo activo · Con IA: 37 %',
      'Tiempo por herramienta de IA · ChatGPT: 0,5 h',
    ]);
    setLocale('en');
    expect(factValue(report.facts[0]!)).toBe('2.7 h');
  });

  it('Markdown y CSV llevan las mismas cifras; el CSV no se rompe con comillas', () => {
    const md = toMarkdown(report, 'Mi trabajo');
    expect(md).toContain('- Tiempo activo: **2,7 h**');
    expect(md).toContain('IA al 37 %. _(Se apoya en: Parte del tiempo activo · Con IA: 37 %)_');
    const csv = toCsv(report).trim().split('\r\n');
    expect(csv).toEqual(['"Métrica","Detalle","Valor","Unidad"', '"hours_active","","2.7","h"', '"share_category","ai","37","%"', '"hours_ai_tool","chatgpt","0.5","h"']);
  });
});
