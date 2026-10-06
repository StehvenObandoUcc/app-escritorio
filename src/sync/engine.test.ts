import { describe, expect, it, vi } from 'vitest';
import { SyncBatchSchema, type Bridge, type SyncBatch, type SyncKind } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { CloudError } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { blockRow, closureRow, entryRow } from '@/cloud/supabase';
import { SyncEngine, type SyncContext } from './engine';

const TEAM = '11111111-1111-4111-8111-111111111111';
const WEEK = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };

/** Nube simulada con una persona que ya aceptó el consentimiento en su equipo. */
function setup() {
  const cloud = createMockCloud();
  const userId = cloud.debug.addAccount('caro@pulso.test', 'secreto-123', 'Caro');
  const teamId = cloud.debug.addTeam('Equipo A', cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana'));
  cloud.debug.addMember(teamId, userId, 'member', true);
  const ctx: SyncContext = { userId, teamId, workday: WEEK, timezone: 'America/Bogota' };
  return { cloud, ctx };
}

/** Puente falso que entrega un lote fijo y anota lo que se marca como subido. */
function fakeBridge(batch: Partial<SyncBatch>) {
  const marked: Record<SyncKind, string[]> = { blocks: [], entries: [], closures: [] };
  const full = SyncBatchSchema.parse({ blocks: [], entries: [], closures: [], ...batch });
  const bridge = {
    ...createMockBridge(),
    syncPending: async () => {
      const left = {
        blocks: full.blocks.filter((b) => !marked.blocks.includes(b.id)),
        entries: full.entries.filter((e) => !marked.entries.includes(e.id)),
        closures: full.closures.filter((c) => !marked.closures.includes(c.id)),
      };
      return left;
    },
    syncMarkSynced: async (kind: SyncKind, ids: string[]) => {
      marked[kind].push(...ids);
    },
  } satisfies Bridge;
  return { bridge, marked };
}

describe('motor de sincronización', () => {
  it('sube las entradas del equipo activo y las marca como subidas (AC-15)', async () => {
    const { cloud, ctx } = setup();
    const bridge = createMockBridge();
    await bridge.activeTeamSet(ctx.teamId);
    await bridge.timeEntryAdd('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z');
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
    engine.setContext(ctx);
    await engine.syncNow();
    expect(cloud.debug.uploaded.entries).toHaveLength(1);
    expect(engine.getState().phase).toBe('synced');
    expect((await bridge.syncPending(200)).entries).toHaveLength(0);
  });

  it('repetir la subida no duplica nada (AC-16)', async () => {
    const { cloud, ctx } = setup();
    const entry = {
      id: '33333333-3333-4333-8333-333333333333',
      teamId: ctx.teamId,
      startedAt: '2026-10-05T14:00:00Z',
      endedAt: '2026-10-05T15:00:00Z',
      taskId: null,
      source: 'manual' as const,
      updatedAt: '2026-10-05T15:00:00Z',
      deletedAt: null,
    };
    await cloud.upsertEntries(ctx.userId, [entry]);
    await cloud.upsertEntries(ctx.userId, [entry]);
    expect(cloud.debug.uploaded.entries).toHaveLength(1);
  });

  it('sin red queda pendiente y reintenta con espera creciente hasta 5 min (AC-17)', async () => {
    const { cloud, ctx } = setup();
    const bridge = createMockBridge();
    await bridge.activeTeamSet(ctx.teamId);
    await bridge.timeEntryAdd('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z');
    const timers: number[] = [];
    const engine = new SyncEngine({ bridge, cloud, setTimer: (_fn, ms) => (timers.push(ms), () => {}) });
    engine.setContext(ctx);
    cloud.debug.setOffline(true);
    for (let i = 0; i < 8; i++) await engine.syncNow();
    expect(engine.getState().phase).toBe('pending');
    expect(engine.getState().message).toMatch(/Sin conexión/);
    expect(timers).toEqual([5_000, 10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
    // Nada se perdió: al volver la red, se sube.
    cloud.debug.setOffline(false);
    await engine.syncNow();
    expect(cloud.debug.uploaded.entries).toHaveLength(1);
    expect(engine.getState().phase).toBe('synced');
  });

  it('el navegador sin red no intenta subir y muestra Pendiente (AC-19)', async () => {
    const { cloud, ctx } = setup();
    const bridge = createMockBridge();
    const spy = vi.spyOn(bridge, 'syncPending');
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {}, isOnline: () => false });
    engine.setContext(ctx);
    await engine.syncNow();
    expect(spy).not.toHaveBeenCalled();
    expect(engine.getState().phase).toBe('pending');
  });

  it('sin equipo con consentimiento la sincronización está apagada', async () => {
    const { cloud } = setup();
    const engine = new SyncEngine({ bridge: createMockBridge(), cloud, setTimer: () => () => {} });
    await engine.syncNow();
    expect(engine.getState().phase).toBe('off');
  });

  it('si el servidor lo rechaza por permisos, muestra Error con qué revisar', async () => {
    const { cloud, ctx } = setup();
    const bridge = createMockBridge();
    await bridge.activeTeamSet(ctx.teamId);
    await bridge.timeEntryAdd('2026-10-05T14:00:00Z', '2026-10-05T15:00:00Z');
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
    engine.setContext({ ...ctx, userId: cloud.debug.addAccount('nadie@pulso.test', 'secreto-123', 'Nadie') });
    await engine.syncNow();
    expect(engine.getState().phase).toBe('error');
    expect(engine.getState().message).toMatch(/consentimiento/);
    expect(cloud.debug.uploaded.entries).toHaveLength(0);
  });

  it('los cierres dentro de la jornada se suben; los de fuera se descartan sin salir del equipo (AC-22)', async () => {
    const { cloud, ctx } = setup();
    const { bridge, marked } = fakeBridge({
      closures: [
        // martes 10:00 en Bogotá
        { id: '44444444-4444-4444-8444-444444444444', teamId: ctx.teamId, closedAt: '2026-10-06T15:00:00Z', reopenedAt: '2026-10-06T16:00:00Z' },
        // martes 20:00 en Bogotá
        { id: '55555555-5555-4555-8555-555555555555', teamId: ctx.teamId, closedAt: '2026-10-07T01:00:00Z', reopenedAt: '2026-10-07T12:00:00Z' },
      ],
    });
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
    engine.setContext(ctx);
    await engine.syncNow();
    expect(cloud.debug.uploaded.closures.map((c) => c.id)).toEqual(['44444444-4444-4444-8444-444444444444']);
    expect(marked.closures.sort()).toEqual(['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']);
  });

  it('una fila inválida se descarta sin bloquear a las demás', async () => {
    const { cloud, ctx } = setup();
    const good = { id: '66666666-6666-4666-8666-666666666666', teamId: ctx.teamId, startedAt: '2026-10-05T14:00:00Z', endedAt: '2026-10-05T15:00:00Z', appName: 'code', category: 'productive' as const, aiTool: null, domain: null };
    const bad = { ...good, id: '77777777-7777-4777-8777-777777777777' };
    const { bridge, marked } = fakeBridge({ blocks: [good, bad] });
    const upsert = cloud.upsertBlocks.bind(cloud);
    cloud.upsertBlocks = async (userId, rows) => {
      if (rows.some((r) => r.id === bad.id)) throw new CloudError('No se puede registrar tiempo en el futuro', 'invalid');
      return upsert(userId, rows);
    };
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
    engine.setContext(ctx);
    await engine.syncNow();
    expect(cloud.debug.uploaded.blocks.map((b) => b.id)).toEqual([good.id]);
    expect(marked.blocks.sort()).toEqual([good.id, bad.id].sort());
    expect(engine.getState()).toMatchObject({ phase: 'synced', rejected: 1 });
  });

  it('ninguna fila enviada a Supabase lleva título (AC-18)', () => {
    const userId = '88888888-8888-4888-8888-888888888888';
    const rows = [
      blockRow(userId, { id: TEAM, teamId: TEAM, startedAt: 'a', endedAt: 'b', appName: 'chrome', category: 'ai', aiTool: 'ChatGPT', domain: 'chatgpt.com' }),
      entryRow(userId, { id: TEAM, teamId: TEAM, startedAt: 'a', endedAt: null, taskId: null, source: 'timer', updatedAt: 'a', deletedAt: null }),
      closureRow(userId, { id: TEAM, teamId: TEAM, closedAt: 'a', reopenedAt: 'b' }),
    ];
    for (const row of rows) expect(Object.keys(row).some((k) => /title/i.test(k))).toBe(false);
    // Y el contrato rechaza un lote de Rust que traiga un título.
    expect(() =>
      SyncBatchSchema.parse({
        blocks: [{ id: TEAM, teamId: TEAM, startedAt: '2026-10-05T14:00:00Z', endedAt: '2026-10-05T15:00:00Z', appName: 'x', category: 'ai', aiTool: null, title: 'Secreto' }],
        entries: [],
        closures: [],
      }),
    ).toThrow();
  });
});
