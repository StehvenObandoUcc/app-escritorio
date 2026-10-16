import { describe, expect, it } from 'vitest';
import { CATEGORIES, DayViewSchema, RangeViewSchema, SensorStatusSchema, SettingsSchema, TimeEntrySchema } from './contract';
import { createMockBridge, sampleDay } from './mock';

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

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

  it('un segundo temporizador mientras hay uno en marcha da un error claro', async () => {
    const bridge = createMockBridge();
    await bridge.timerStart();
    await expect(bridge.timerStart()).rejects.toThrow(/en marcha/);
  });

  it('el temporizador deja su entrada de tiempo, abierta y luego cerrada', async () => {
    let t = new Date('2026-10-01T09:00:00Z');
    const bridge = createMockBridge(() => t);
    await bridge.timerStart();
    const open = await bridge.timeEntries(localDay(t));
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ endedAt: null, source: 'timer' });
    t = new Date('2026-10-01T09:30:00Z');
    await bridge.timerStop();
    expect((await bridge.timeEntries(localDay(t)))[0]?.endedAt).toBe('2026-10-01T09:30:00.000Z');
  });

  it('las entradas manuales se validan igual que en Rust (AC-13)', async () => {
    const now = new Date('2026-10-01T12:00:00Z');
    const bridge = createMockBridge(() => now);
    await expect(bridge.timeEntryAdd('2026-10-01T09:00:00Z', '2026-10-01T08:00:00Z')).rejects.toThrow(/posterior al inicio/);
    await expect(bridge.timeEntryAdd('2026-09-30T09:00:00Z', '2026-10-01T10:00:00Z')).rejects.toThrow(/24 horas/);
    await expect(bridge.timeEntryAdd('2026-10-01T11:00:00Z', '2026-10-01T13:00:00Z')).rejects.toThrow(/futuro/);
    await expect(bridge.timeEntryAdd('ayer', 'hoy')).rejects.toThrow(/inválidas/);
  });

  it('crea, edita y elimina una entrada manual', async () => {
    const now = new Date('2026-10-01T18:00:00Z');
    const bridge = createMockBridge(() => now);
    const added = await bridge.timeEntryAdd('2026-10-01T14:00:00Z', '2026-10-01T15:00:00Z');
    expect(() => TimeEntrySchema.parse(added)).not.toThrow();
    expect(added.source).toBe('manual');
    const day = localDay(new Date(added.startedAt));
    await bridge.timeEntryUpdate(added.id, '2026-10-01T14:00:00Z', '2026-10-01T16:00:00Z');
    expect((await bridge.timeEntries(day))[0]?.endedAt).toBe('2026-10-01T16:00:00.000Z');
    await bridge.timeEntryDelete(added.id);
    expect(await bridge.timeEntries(day)).toEqual([]);
    await expect(bridge.timeEntryDelete(added.id)).rejects.toThrow(/no existe/);
  });

  it('range_view cumple el contrato y trae todas las categorías por día', async () => {
    const range = await createMockBridge().rangeView('2026-10-01', '2026-10-03');
    expect(() => RangeViewSchema.parse(range)).not.toThrow();
    expect(range.days.map((d) => d.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03']);
    expect(Object.keys(range.days[0]!.totals).sort()).toEqual([...CATEGORIES].sort());
    await expect(createMockBridge().rangeView('2026-10-03', '2026-10-01')).rejects.toThrow(/anterior/);
  });

  it('los ajustes se validan, normalizan y persisten', async () => {
    const bridge = createMockBridge();
    expect(SettingsSchema.parse(await bridge.settingsGet())).toEqual({ idleMinutes: 5, hiddenApps: [], language: 'es' });
    await expect(bridge.settingsSet({ idleMinutes: 2 })).rejects.toThrow(/entre 3 y 15/);
    await expect(bridge.settingsSet({ idleMinutes: 16 })).rejects.toThrow(/entre 3 y 15/);
    const next = await bridge.settingsSet({ idleMinutes: 10, hiddenApps: ['  KeePass ', 'keepass', ''] });
    expect(next).toEqual({ idleMinutes: 10, hiddenApps: ['keepass'], language: 'es' });
    expect(await bridge.settingsGet()).toEqual(next);
  });
});
