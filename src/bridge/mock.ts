/**
 * Puente simulado: permite desarrollar y probar la interfaz en el navegador
 * (`npm run dev`) sin compilar Rust. Los datos son deterministas.
 */
import { localDate } from '@/lib/time';
import {
  CATEGORIES,
  DayViewSchema,
  IDLE_MINUTES_MAX,
  IDLE_MINUTES_MIN,
  RangeViewSchema,
  SensorStatusSchema,
  SettingsSchema,
  SyncBatchSchema,
  TeamRuleSchema,
  TimeEntrySchema,
  type ActivityBlock,
  type Bridge,
  type Category,
  type DayView,
  type SensorStatus,
  type Settings,
  type SyncEntry,
  type TimeEntry,
} from './contract';

type Sample = [from: string, to: string, app: string, title: string, category: Category, ai?: string];

const SAMPLE_DAY: Sample[] = [
  ['08:12', '09:40', 'Visual Studio Code', 'sensor.rs — pulso', 'productive'],
  ['09:40', '09:52', 'Google Chrome', 'ChatGPT', 'ai', 'ChatGPT'],
  ['09:52', '10:30', 'Visual Studio Code', 'classifier.rs — pulso', 'productive'],
  ['10:30', '10:45', 'Pulso', 'Descanso', 'break'],
  ['10:45', '11:05', 'Google Chrome', 'YouTube', 'distraction'],
  ['11:05', '12:28', 'Figma', 'Pulso — Mi día', 'productive'],
  ['12:28', '13:30', 'Sin actividad', '', 'idle'],
  ['13:30', '14:14', 'Google Chrome', 'Claude', 'ai', 'Claude'],
  ['14:14', '15:38', 'Visual Studio Code', 'MiDiaPage.tsx — pulso', 'productive'],
  ['15:38', '15:53', 'Pulso', 'Seguimiento en pausa', 'paused'],
  ['15:53', '16:31', 'Slack', 'equipo-pulso', 'neutral'],
];

/** Dominio de ejemplo de los bloques de navegador (ADR-0009). */
const SAMPLE_DOMAINS: Record<string, string> = {
  ChatGPT: 'chatgpt.com',
  YouTube: 'youtube.com',
  Claude: 'claude.ai',
};

function at(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00`).toISOString();
}

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

export function sampleDay(date: string): DayView {
  const blocks: ActivityBlock[] = SAMPLE_DAY.map(([from, to, app, title, category, ai], i) => ({
    id: uuid(i + 1),
    startedAt: at(date, from),
    endedAt: at(date, to),
    appName: app,
    title: title === '' ? null : title,
    category,
    aiTool: ai ?? null,
    domain: SAMPLE_DOMAINS[title] ?? null,
  }));

  const totals = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>;
  for (const b of blocks) {
    totals[b.category] += Math.round((Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000);
  }

  const first = blocks[0];
  const last = blocks[blocks.length - 1];
  return DayViewSchema.parse({
    date,
    blocks,
    totals,
    workdayStart: first?.startedAt ?? null,
    workdayEnd: last?.endedAt ?? null,
  });
}

const MAX_ENTRY_MS = 24 * 3_600_000;

/** Mismas reglas que Rust (AC-13): fin posterior al inicio, máximo 24 h, nada en el futuro. */
function validateRange(start: string, end: string, now: Date): void {
  const [s, e] = [Date.parse(start), Date.parse(end)];
  if (Number.isNaN(s) || Number.isNaN(e)) throw new Error('Fecha y hora inválidas.');
  if (e <= s) throw new Error('El fin debe ser posterior al inicio.');
  if (e - s > MAX_ENTRY_MS) throw new Error('Una entrada no puede durar más de 24 horas.');
  if (e > now.getTime()) throw new Error('No se puede registrar tiempo en el futuro.');
}

export function createMockBridge(now: () => Date = () => new Date()): Bridge {
  let status: SensorStatus = {
    state: 'tracking',
    pausedUntil: null,
    timer: { running: false, startedAt: null, taskId: null },
  };
  let entries: TimeEntry[] = [];
  let settings: Settings = { idleMinutes: 5, hiddenApps: [], language: 'es' };
  // F2: la sesión vive en memoria (en la app real, Rust la guarda cifrada).
  let session: string | null = null;
  let activeTeam: string | null = null;
  let activeUser: string | null = null;
  /** Copia de tareas por equipo y cuenta, como en Rust (ADR-0013). */
  const tasksCache = new Map<string, string>();
  const cacheKey = () => (activeTeam && activeUser ? `${activeTeam}|${activeUser}` : null);
  const entryTeam = new Map<string, string | null>();
  const synced = new Set<string>();
  const track = (id: string) => {
    entryTeam.set(id, activeTeam);
    synced.delete(id);
  };
  const set = (next: SensorStatus) => {
    status = SensorStatusSchema.parse(next);
    return status;
  };

  return {
    source: 'mock',
    sensorStatus: async () => status,
    dayView: async (date) => sampleDay(date),
    timerStart: async (taskId) => {
      if (status.timer.running) {
        throw new Error('Ya hay un temporizador en marcha. Deténlo antes de iniciar otro.');
      }
      const startedAt = now().toISOString();
      const id = crypto.randomUUID();
      entries.push({ id, startedAt, endedAt: null, taskId: taskId ?? null, source: 'timer' });
      track(id);
      return set({ ...status, timer: { running: true, startedAt, taskId: taskId ?? null } });
    },
    timerStop: async () => {
      if (!status.timer.running) throw new Error('No hay un temporizador en marcha.');
      const endedAt = now().toISOString();
      entries = entries.map((e) => (e.source === 'timer' && e.endedAt === null ? { ...e, endedAt } : e));
      return set({ ...status, timer: { running: false, startedAt: null, taskId: null } });
    },
    rangeView: async (from, to) => {
      if (to < from) throw new Error('El fin del rango es anterior al inicio.');
      const days = [];
      for (let d = new Date(`${from}T12:00:00`); localDate(d) <= to; d.setDate(d.getDate() + 1)) {
        days.push({ date: localDate(d), totals: sampleDay(localDate(d)).totals });
      }
      return RangeViewSchema.parse({ from, to, days });
    },
    timeEntries: async (date) =>
      entries
        .filter((e) => localDate(new Date(e.startedAt)) === date)
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt)),
    timeEntryAdd: async (start, end, taskId) => {
      validateRange(start, end, now());
      const entry = TimeEntrySchema.parse({
        id: crypto.randomUUID(),
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        taskId: taskId ?? null,
        source: 'manual',
      });
      entries.push(entry);
      track(entry.id);
      return entry;
    },
    timeEntryUpdate: async (id, start, end, taskId) => {
      validateRange(start, end, now());
      const current = entries.find((e) => e.id === id && e.endedAt !== null);
      if (!current) throw new Error('La entrada no existe o sigue en marcha.');
      Object.assign(current, {
        startedAt: new Date(start).toISOString(),
        endedAt: new Date(end).toISOString(),
        taskId: taskId ?? null,
      });
    },
    timeEntryDelete: async (id) => {
      if (!entries.some((e) => e.id === id)) throw new Error('La entrada no existe.');
      entries = entries.filter((e) => e.id !== id);
    },
    settingsGet: async () => settings,
    settingsSet: async (patch) => {
      const next = { ...settings, ...patch };
      if (next.idleMinutes < IDLE_MINUTES_MIN || next.idleMinutes > IDLE_MINUTES_MAX) {
        throw new Error(
          `El umbral de inactividad debe estar entre ${IDLE_MINUTES_MIN} y ${IDLE_MINUTES_MAX} minutos.`,
        );
      }
      const apps = next.hiddenApps.map((a) => a.trim().toLowerCase()).filter(Boolean);
      settings = SettingsSchema.parse({ ...next, hiddenApps: [...new Set(apps)] });
      return settings;
    },
    breakStart: async () => set({ ...status, state: 'break' }),
    breakEnd: async () => set({ ...status, state: 'tracking' }),
    privacyPause: async (minutes) =>
      set({
        ...status,
        state: 'paused',
        pausedUntil: new Date(now().getTime() + minutes * 60_000).toISOString(),
      }),
    privacyResume: async () => set({ ...status, state: 'tracking', pausedUntil: null }),
    sessionGet: async () => session,
    sessionSet: async (json) => {
      session = json;
    },
    sessionClear: async () => {
      session = null;
    },
    activeTeamSet: async (teamId, userId) => {
      activeTeam = teamId;
      activeUser = userId;
    },
    // Solo las entradas creadas con un equipo activo quedan pendientes; los bloques de ejemplo no se suben.
    syncPending: async (limit) => {
      const team = activeTeam;
      const pending: SyncEntry[] = team
        ? entries
            .filter((e) => entryTeam.get(e.id) === team && !synced.has(e.id))
            .slice(0, limit)
            .map((e) => ({ ...e, teamId: team, updatedAt: e.endedAt ?? e.startedAt, deletedAt: null }))
        : [];
      return SyncBatchSchema.parse({ blocks: [], entries: pending, closures: [] });
    },
    syncMarkSynced: async (_kind, ids) => {
      for (const id of ids) synced.add(id);
    },
    rulesSet: async (rules) => {
      rules.forEach((r) => TeamRuleSchema.parse(r));
    },
    teamPolicySet: async () => {},
    notificationsStatus: async () => ({ windowsToastsEnabled: true }),
    // Datos de ejemplo: nunca hay avisos reales.
    onNotAllowedAlert: () => () => {},
    // Datos de ejemplo: unas pocas apps instaladas y abiertas.
    installedApps: async () => [
      { process: 'slack', label: 'Slack', source: 'open' },
      { process: 'whatsapp.root', label: 'WhatsApp.Root', source: 'open' },
      { process: 'figma', label: 'Figma', source: 'installed' },
      { process: 'keepass', label: 'KeePass Password Safe', source: 'installed' },
      { process: 'spotify', label: 'Spotify', source: 'installed' },
    ],
    tasksCachePut: async (json) => {
      const key = cacheKey();
      if (key) tasksCache.set(key, json);
    },
    tasksCacheGet: async () => {
      const key = cacheKey();
      return (key && tasksCache.get(key)) ?? null;
    },
  };
}
