import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deliveryFields, EVIDENCE_CATALOG, formatsOf } from './evidence';
import { EVIDENCE_TYPES } from './limits';

const sql = readFileSync('supabase/migrations/20261008000005_evidencia_por_tarea.sql', 'utf8');
const json = sql.slice(sql.indexOf("select '{") + 8, sql.indexOf("}'::jsonb") + 1);
const catalog = JSON.parse(json) as Record<string, { kind: string; types?: string[] }>;

describe('catálogo de evidencia (ADR-0020)', () => {
  it('es el mismo que evidence_catalog() en la base', () => {
    expect(EVIDENCE_CATALOG.map((e) => e.key)).toEqual(Object.keys(catalog));
    for (const e of EVIDENCE_CATALOG) {
      expect(catalog[e.key]!.kind).toBe(e.kind);
      expect(catalog[e.key]!.types ?? []).toEqual([...e.types]);
    }
  });

  it('todos sus formatos están admitidos en el bucket', () => {
    for (const e of EVIDENCE_CATALOG) for (const type of e.types) expect(EVIDENCE_TYPES).toContain(type);
  });

  it('cada evidencia elegida es un campo obligatorio después del formulario del proyecto', () => {
    const fields = deliveryFields([{ key: 'summary', label: 'Qué se hizo', kind: 'text', required: true }], ['video', 'code']);
    expect(fields.map((f) => [f.key, f.kind, f.required])).toEqual([
      ['summary', 'text', true],
      ['ev_code', 'url', true],
      ['ev_video', 'file', true],
    ]);
    expect(fields[2]!.accept).toContain('video/mp4');
    expect(formatsOf(fields[2]!.accept!)).toBe('MP4, WEBM, MOV');
  });
});
