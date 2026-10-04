import type { ActivityBlock } from '@/bridge/contract';
import { minutesOfDay } from '@/lib/time';

/** Rango visible de la franja, en minutos desde la medianoche (siempre horas completas). */
export interface StripRange {
  startMin: number;
  endMin: number;
}

export interface PlacedBlock {
  block: ActivityBlock;
  /** Posición y ancho en porcentaje del rango visible */
  leftPct: number;
  widthPct: number;
}

const DEFAULT_RANGE: StripRange = { startMin: 8 * 60, endMin: 17 * 60 };
const MIN_SPAN_MIN = 6 * 60;

export function stripRange(blocks: ActivityBlock[]): StripRange {
  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  if (!first || !last) return DEFAULT_RANGE;

  const startMin = Math.floor(minutesOfDay(first.startedAt) / 60) * 60;
  let endMin = Math.ceil(minutesOfDay(last.endedAt) / 60) * 60;
  if (endMin - startMin < MIN_SPAN_MIN) endMin = startMin + MIN_SPAN_MIN;
  return { startMin, endMin: Math.min(endMin, 24 * 60) };
}

export function layoutBlocks(blocks: ActivityBlock[], range: StripRange): PlacedBlock[] {
  const span = range.endMin - range.startMin;
  return blocks.map((block) => {
    const from = Math.max(minutesOfDay(block.startedAt), range.startMin);
    const to = Math.min(minutesOfDay(block.endedAt), range.endMin);
    return {
      block,
      leftPct: ((from - range.startMin) / span) * 100,
      widthPct: (Math.max(0, to - from) / span) * 100,
    };
  });
}

/** Horas en punto dentro del rango: [8, 9, 10, …] */
export function hourTicks(range: StripRange): number[] {
  const ticks: number[] = [];
  for (let m = range.startMin; m <= range.endMin; m += 60) ticks.push(m / 60);
  return ticks;
}
