/**
 * Puente simulado: permite desarrollar y probar la interfaz en el navegador
 * (`npm run dev`) sin compilar Rust. Los datos son deterministas.
 */
import {
  CATEGORIES,
  DayViewSchema,
  SensorStatusSchema,
  type ActivityBlock,
  type Bridge,
  type Category,
  type DayView,
  type SensorStatus,
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

export function createMockBridge(now: () => Date = () => new Date()): Bridge {
  let status: SensorStatus = {
    state: 'tracking',
    pausedUntil: null,
    timer: { running: false, startedAt: null, taskId: null },
  };
  const set = (next: SensorStatus) => {
    status = SensorStatusSchema.parse(next);
    return status;
  };

  return {
    source: 'mock',
    sensorStatus: async () => status,
    dayView: async (date) => sampleDay(date),
    timerStart: async (taskId) =>
      set({
        ...status,
        timer: { running: true, startedAt: now().toISOString(), taskId: taskId ?? null },
      }),
    timerStop: async () =>
      set({ ...status, timer: { running: false, startedAt: null, taskId: null } }),
    breakStart: async () => set({ ...status, state: 'break' }),
    breakEnd: async () => set({ ...status, state: 'tracking' }),
    privacyPause: async (minutes) =>
      set({
        ...status,
        state: 'paused',
        pausedUntil: new Date(now().getTime() + minutes * 60_000).toISOString(),
      }),
    privacyResume: async () => set({ ...status, state: 'tracking', pausedUntil: null }),
  };
}
