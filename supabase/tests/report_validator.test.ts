import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildMessages, manualPrompt, PROMPT_V2, retryMessages } from '../functions/_shared/report-prompt.ts';
import { extractJson, fallbackNarrative, numbersIn, validateNarrative, type Narrative } from '../functions/_shared/report-validator.ts';
import { CONTEXT, FACTS, RESPONSES } from './fixtures/report-responses.ts';

/** Validador anti-alucinación y prompt v2 (spec F4: AC-8, AC-12, AC-13a, AC-21). */

const allTexts = (n: Narrative) => [n.summary, ...n.insights.map((i) => i.text), ...n.recommendations.map((r) => r.text)];

describe('20 respuestas grabadas (AC-8, AC-13a)', () => {
  it.each(RESPONSES)('$name → aceptada: $ok', ({ text, ok }) => {
    expect(validateNarrative(extractJson(text), CONTEXT).ok).toBe(ok);
  });

  it('ningún número inventado pasa: todo número aceptado está en los hechos o en las fechas del periodo', () => {
    const allowed = [...FACTS.map((f) => f.value), 5, 10, 11, 2026];
    for (const { text } of RESPONSES) {
      const result = validateNarrative(extractJson(text), CONTEXT);
      if (!result.ok) continue;
      for (const t of allTexts(result.narrative)) for (const num of numbersIn(t)) expect(allowed.some((v) => Math.round(v * 10) === Math.round(num.value * 10))).toBe(true);
    }
  });

  it('una respuesta aceptada sale sin las claves de más', () => {
    const result = validateNarrative(extractJson(RESPONSES.find((r) => r.name === 'claves de más se descartan')!.text), CONTEXT);
    expect(result.ok && Object.keys(result.narrative).sort()).toEqual(['insights', 'insufficient_data', 'recommendations', 'summary']);
  });
});

describe('lectura del JSON en modo Manual (AC-21)', () => {
  it('toma el primer objeto completo, respeta llaves dentro de cadenas y salta lo que no es JSON', () => {
    expect(extractJson('nada')).toBeUndefined();
    expect(extractJson('{roto} y luego {"a": "con } dentro", "b": {"c": 1}}')).toEqual({ a: 'con } dentro', b: { c: 1 } });
    expect(extractJson('```json\n{"a": "comillas \\" y llave {"}\n```')).toEqual({ a: 'comillas " y llave {' });
  });
});

describe('plantilla de respaldo (AC-12)', () => {
  it.each(['es', 'en'] as const)('en %s cita solo hechos y pasa el validador', (language) => {
    const n = fallbackNarrative(FACTS, language);
    expect(n.insights.length).toBeGreaterThan(0);
    expect(validateNarrative(n, CONTEXT).ok).toBe(true);
  });

  it('sin hechos útiles dice que no hay datos suficientes', () => {
    const n = fallbackNarrative([], 'es');
    expect(n.insufficient_data).toBe(true);
    expect(validateNarrative(n, { ...CONTEXT, facts: [] }).ok).toBe(true);
  });
});

describe('prompt v2', () => {
  it('el texto coincide con prompts/report.v2.md entre INICIO y FIN', () => {
    const md = readFileSync(new URL('../../prompts/report.v2.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    const body = md.slice(md.indexOf('\nINICIO\n') + '\nINICIO\n'.length, md.indexOf('\nFIN')).trim();
    expect(PROMPT_V2).toBe(body);
  });

  it('los mensajes llevan el idioma y solo los campos de los hechos', () => {
    const [system, user] = buildMessages([{ ...FACTS[0]!, extra: 'secreto' } as never], 'en');
    expect(system!.content).toContain('Escribes en English');
    expect(user!.content).not.toContain('secreto');
    expect(manualPrompt(FACTS, 'es')).toContain('Escribes en español');
    const retry = retryMessages(buildMessages(FACTS, 'es'), 'mal', [{ code: 'number', field: 'summary', number: '8' }]);
    expect(retry.at(-1)!.content).toContain('menciona 8');
  });
});
