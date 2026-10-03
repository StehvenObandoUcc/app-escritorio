import { describe, expect, it } from 'vitest';
import { CATEGORIES, DayViewSchema, SensorStatusSchema } from './contract';
import { createMockBridge, sampleDay } from './mock';

describe('puente simulado', () => {
  it('cumple el contrato DayView', () => {
    const day = sampleDay('2026-10-01');
    expect(() => DayViewSchema.parse(day)).not.toThrow();
    expect(Object.keys(day.totals).sort()).toEqual([...CATEGORIES].sort());
  });

  it('los totales suman la duración de los bloques', () => {
    const day = sampleDay('2026-10-01');
    const fromBlocks = day.blocks.reduce(
      (sum, b) => sum + (Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000,
      0,
    );
    const fromTotals = Object.values(day.totals).reduce((a, b) => a + b, 0);
    expect(fromTotals).toBe(fromBlocks);
  });

  it('el temporizador arranca y se detiene', async () => {
    const bridge = createMockBridge(() => new Date('2026-10-01T09:00:00Z'));
    const started = await bridge.timerStart();
    expect(started.timer).toEqual({
      running: true,
      startedAt: '2026-10-01T09:00:00.000Z',
      taskId: null,
    });
    const stopped = await bridge.timerStop();
    expect(stopped.timer.running).toBe(false);
  });

  it('la pausa de privacidad fija hasta cuándo dura', async () => {
    const bridge = createMockBridge(() => new Date('2026-10-01T09:00:00Z'));
    const paused = await bridge.privacyPause(15);
    expect(SensorStatusSchema.parse(paused).state).toBe('paused');
    expect(paused.pausedUntil).toBe('2026-10-01T09:15:00.000Z');
    expect((await bridge.privacyResume()).state).toBe('tracking');
  });
});
