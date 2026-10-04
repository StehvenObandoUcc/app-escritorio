import { describe, expect, it } from 'vitest';
import { sampleDay } from '@/bridge/mock';
import { hourTicks, layoutBlocks, stripRange } from './pulseLayout';

const day = sampleDay('2026-10-01'); // 08:12 → 16:31

describe('franja de pulso', () => {
  it('redondea el rango a horas completas', () => {
    expect(stripRange(day.blocks)).toEqual({ startMin: 8 * 60, endMin: 17 * 60 });
  });

  it('usa un rango por defecto si no hay bloques', () => {
    expect(stripRange([])).toEqual({ startMin: 8 * 60, endMin: 17 * 60 });
  });

  it('coloca cada bloque dentro del 0–100 % sin solaparse', () => {
    const placed = layoutBlocks(day.blocks, stripRange(day.blocks));
    let cursor = 0;
    for (const p of placed) {
      expect(p.leftPct).toBeGreaterThanOrEqual(cursor - 1e-9);
      expect(p.leftPct + p.widthPct).toBeLessThanOrEqual(100 + 1e-9);
      cursor = p.leftPct + p.widthPct;
    }
    // 08:12 dentro de 08:00–17:00 (540 min) → 12/540
    expect(placed[0]?.leftPct).toBeCloseTo((12 / 540) * 100);
  });

  it('genera una marca por cada hora en punto', () => {
    expect(hourTicks({ startMin: 480, endMin: 1020 })).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});
