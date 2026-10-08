/**
 * Motor de sincronización (ARQUITECTURA §7.3, ADR-0001, SY-02, SY-03, SY-05).
 *
 * 1. Cada 60 s, al recuperar la conexión y al enfocar la ventana: `sync_pending(200)`.
 * 2. `upsert` en Supabase por `id`: repetir una subida no duplica nada.
 * 3. `sync_mark_synced` con los ids aceptados.
 * 4. Si falla: reintento con espera creciente (5 s → 5 min). Los datos siguen a salvo en SQLite.
 *
 * Los cierres de Pulso (A-1) se suben solo si empezaron dentro de la jornada del equipo, en la zona
 * horaria de la persona; los demás se marcan como atendidos y no salen del equipo.
 */
import { errorMessage, t } from '@/i18n';
import type { Bridge, SyncBatch, SyncKind } from '@/bridge/contract';
import { CloudError, type Cloud } from '@/cloud/contract';
import { isWithinWorkday, type WorkdayWindow } from '@/lib/workday';

export const BATCH_SIZE = 200;
export const SYNC_EVERY_MS = 60_000;
export const RETRY_MIN_MS = 5_000;
export const RETRY_MAX_MS = 5 * 60_000;
/** Tope de lotes por ronda, para no bloquear si llega muchísimo pendiente de golpe. */
const MAX_ROUNDS = 20;

export interface SyncContext {
  userId: string;
  teamId: string;
  workday: WorkdayWindow;
  timezone: string;
}

export type SyncPhase = 'off' | 'syncing' | 'pending' | 'synced' | 'error';

export interface SyncState {
  /** off: sin equipo con consentimiento · pending: falta subir (sin red o en espera) · error: rechazado */
  phase: SyncPhase;
  message: string | null;
  lastSyncedAt: string | null;
  /** Registros que el servidor rechazó por inválidos (p. ej. fechas futuras). Se descartan. */
  rejected: number;
}

interface Deps {
  bridge: Bridge;
  cloud: Cloud;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => () => void;
  isOnline?: () => boolean;
}

const defaultTimer = (fn: () => void, ms: number) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export class SyncEngine {
  private state: SyncState = { phase: 'off', message: null, lastSyncedAt: null, rejected: 0 };
  private readonly listeners = new Set<() => void>();
  private context: SyncContext | null = null;
  private running: Promise<void> | null = null;
  private failures = 0;
  private cancelRetry: (() => void) | null = null;
  private readonly now: () => Date;
  private readonly setTimer: (fn: () => void, ms: number) => () => void;
  private readonly isOnline: () => boolean;

  constructor(private readonly deps: Deps) {
    this.now = deps.now ?? (() => new Date());
    this.setTimer = deps.setTimer ?? defaultTimer;
    this.isOnline = deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  }

  getState = (): SyncState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Equipo y persona actuales. `null` apaga la sincronización (sin sesión o sin consentimiento). */
  setContext(context: SyncContext | null): void {
    const changed = JSON.stringify(context) !== JSON.stringify(this.context);
    this.context = context;
    if (!changed) return;
    this.clearRetry();
    this.failures = 0;
    if (!context) this.set({ phase: 'off', message: null });
  }

  /** Espera de reintento tras `failures` fallos seguidos: 5 s, 10 s, 20 s… hasta 5 min. */
  static retryDelay(failures: number): number {
    return Math.min(RETRY_MAX_MS, RETRY_MIN_MS * 2 ** Math.max(0, failures - 1));
  }

  /** Sube todo lo pendiente. Si ya hay una subida en curso, devuelve esa misma. */
  syncNow(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.run().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(): Promise<void> {
    const ctx = this.context;
    if (!ctx) {
      this.set({ phase: 'off', message: null });
      return;
    }
    this.clearRetry();
    if (!this.isOnline()) {
      this.fail(new CloudError(t('sync.offline'), 'network'));
      return;
    }
    this.set({ phase: 'syncing', message: null });
    try {
      for (let round = 0; round < MAX_ROUNDS; round++) {
        const batch = await this.deps.bridge.syncPending(BATCH_SIZE);
        if (this.context !== ctx) return; // cambió de equipo o de sesión a mitad de camino
        await this.uploadBatch(ctx, batch);
        const full = [batch.blocks, batch.entries, batch.closures, batch.aiUsages].some((list) => list.length >= BATCH_SIZE);
        if (!full) break;
      }
      this.failures = 0;
      this.set({ phase: 'synced', message: null, lastSyncedAt: this.now().toISOString() });
    } catch (cause) {
      this.fail(cause);
    }
  }

  private async uploadBatch(ctx: SyncContext, batch: SyncBatch): Promise<void> {
    const { bridge, cloud } = this.deps;
    const inside = batch.closures.filter((c) => isWithinWorkday(c.closedAt, ctx.workday, ctx.timezone));
    const outside = batch.closures.filter((c) => !inside.includes(c));
    if (outside.length) await bridge.syncMarkSynced('closures', outside.map((c) => c.id));

    await this.upload('blocks', batch.blocks, (rows) => cloud.upsertBlocks(ctx.userId, rows));
    await this.upload('entries', batch.entries, (rows) => cloud.upsertEntries(ctx.userId, rows));
    await this.upload('closures', inside, (rows) => cloud.upsertClosures(ctx.userId, rows));
    // Etiquetas de IA de bloques ya subidos (F4 D-13): una llamada por bloque, sin volver a subirlo.
    await this.upload('aiUsages', batch.aiUsages, async (rows) => {
      for (const r of rows) await cloud.setBlockAiUsage(r.id, r.aiUsageType);
    });
  }

  /**
   * Sube un grupo. Si el servidor rechaza el lote por un dato inválido, prueba fila por fila:
   * las válidas se suben y las inválidas se descartan (no tiene sentido reintentarlas siempre).
   */
  private async upload<T extends { id: string }>(kind: SyncKind, rows: T[], send: (rows: T[]) => Promise<void>) {
    if (!rows.length) return;
    try {
      await send(rows);
      await this.deps.bridge.syncMarkSynced(kind, rows.map((r) => r.id));
      return;
    } catch (cause) {
      if (!(cause instanceof CloudError) || cause.kind !== 'invalid') throw cause;
    }
    for (const row of rows) {
      try {
        await send([row]);
      } catch (cause) {
        if (!(cause instanceof CloudError) || cause.kind !== 'invalid') throw cause;
        this.state = { ...this.state, rejected: this.state.rejected + 1 };
      }
      await this.deps.bridge.syncMarkSynced(kind, [row.id]);
    }
  }

  private fail(cause: unknown): void {
    this.failures += 1;
    const err = cause instanceof CloudError ? cause : null;
    const network = err?.kind === 'network';
    const message = err
      ? err.kind === 'forbidden'
        ? t('sync.forbidden')
        : err.message
      : t('sync.failed', { error: errorMessage(cause) });
    this.set({ phase: network ? 'pending' : 'error', message });
    this.cancelRetry = this.setTimer(() => void this.syncNow(), SyncEngine.retryDelay(this.failures));
  }

  private clearRetry() {
    this.cancelRetry?.();
    this.cancelRetry = null;
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  /** Programa la subida periódica y escucha la red y el foco. Devuelve la función para detenerlo. */
  start(): () => void {
    const tick = () => void this.syncNow();
    const interval = setInterval(tick, SYNC_EVERY_MS);
    window.addEventListener('online', tick);
    window.addEventListener('focus', tick);
    tick();
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', tick);
      window.removeEventListener('focus', tick);
      this.clearRetry();
    };
  }
}
