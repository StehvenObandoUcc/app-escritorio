import { describe, expect, it } from 'vitest';
import { en } from './en';
import { es } from './es';

/** Todas las cadenas del diccionario con su clave (`a.b.c`). */
function entries(node: unknown, path = ''): [string, string][] {
  if (typeof node === 'string') return [[path, node]];
  if (!node || typeof node !== 'object') return [];
  return Object.entries(node).flatMap(([k, v]) => entries(v, path ? `${path}.${k}` : k));
}

const offenders = (dict: unknown, banned: RegExp, allowed: (key: string) => boolean = () => false) =>
  entries(dict)
    .filter(([key, text]) => banned.test(text) && !allowed(key))
    .map(([key, text]) => `${key}: ${text}`);

/**
 * Glosario (Lote 3, F-02, F-06, F-07): un término por concepto.
 * - «equipo» es el grupo de trabajo; el aparato es «computador».
 * - Los roles se nombran en español: Propietario, Administrador, Miembro, Observador.
 * - A alguien se le «quita del equipo», no se le «expulsa».
 * - En inglés, «Owner» es solo el rol; quien tiene una tarea es «Assignee».
 */
describe('glosario de la interfaz', () => {
  it('en español, el aparato no se llama «equipo»', () => {
    expect(offenders(es, /\b(salen?|quedan?|guardad[oa]s?|registra[ns]?) (de|en) (tu|este|ese) equipo\b/i)).toEqual([]);
    expect(offenders(es, /\((en|solo en) (tu|este) equipo\)/i)).toEqual([]);
  });

  it('en español, los roles y las acciones usan un solo nombre', () => {
    expect(offenders(es, /\b(owners?|admins?|viewers?)\b/i)).toEqual([]);
    expect(offenders(es, /\bvisor\b|\bgrupo\b|expuls/i)).toEqual([]);
  });

  it('en inglés, «Owner» es solo el rol del equipo', () => {
    const roleKeys = (key: string) => /^roles\.|gallery|stopOwning|transferHint|createHint|\.hint$/.test(key);
    expect(offenders(en, /\bowner\b|\bown the\b/i, roleKeys)).toEqual([]);
  });
});
