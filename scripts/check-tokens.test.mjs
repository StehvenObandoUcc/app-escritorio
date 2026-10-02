import { describe, expect, it } from 'vitest';
import { findViolations } from './check-tokens.mjs';

describe('check-tokens', () => {
  it('acepta clases basadas en tokens', () => {
    expect(findViolations('<div className="bg-surface text-fg p-4 md:w-rail rounded-lg" />')).toEqual([]);
  });
  it('rechaza colores escritos a mano', () => {
    expect(findViolations('color: #ff0000;')[0]?.rule).toBe('color escrito a mano');
    expect(findViolations("style={{ color: 'rgb(0,0,0)' }}")[0]?.rule).toBe('color escrito a mano');
  });
  it('rechaza la paleta por defecto de Tailwind', () => {
    expect(findViolations('className="bg-blue-500"')[0]?.match).toBe('bg-blue-500');
    expect(findViolations('className="text-white"')[0]?.match).toBe('text-white');
  });
  it('rechaza valores arbitrarios', () => {
    expect(findViolations('className="w-[13px]"')[0]?.match).toBe('w-[13px]');
  });
});
