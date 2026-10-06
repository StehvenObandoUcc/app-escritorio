/**
 * CONTRATO DEL PUENTE (webview ⇄ núcleo Rust)
 *
 * Fuente de verdad de los datos que cruzan entre la interfaz y Rust.
 * - La interfaz SOLO habla con Rust a través de la interfaz `Bridge`.
 * - Hay dos implementaciones: `mock.ts` (datos de ejemplo, corre en el navegador)
 *   y `tauri.ts` (comandos reales). Ambas deben cumplir este contrato.
 * - Todo lo que llega del puente se valida con zod antes de usarse.
 * - Agregar o cambiar un comando requiere actualizar docs/ARQUITECTURA.md §6.
 */
import { z } from 'zod';

export const CATEGORIES = [
  'productive',
  'neutral',
  'distraction',
  'ai',
  'break',
  'idle',
  'paused',
] as const;
export const CategorySchema = z.enum(CATEGORIES);
export type Category = z.infer<typeof CategorySchema>;

export const ActivityBlockSchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  appName: z.string(),
  /** Título de la ventana. Solo existe en este equipo: nunca se sincroniza. */
  title: z.string().nullable(),
  category: CategorySchema,
  /** Herramienta de IA detectada (p. ej. "ChatGPT"). Solo si category = "ai". */
  aiTool: z.string().nullable(),
});
export type ActivityBlock = z.infer<typeof ActivityBlockSchema>;

export const DayViewSchema = z.object({
  /** Día local en formato AAAA-MM-DD */
  date: z.iso.date(),
  blocks: z.array(ActivityBlockSchema),
  /** Segundos por categoría */
  totals: z.record(CategorySchema, z.number().int().nonnegative()),
  workdayStart: z.iso.datetime({ offset: true }).nullable(),
  workdayEnd: z.iso.datetime({ offset: true }).nullable(),
});
export type DayView = z.infer<typeof DayViewSchema>;

export const SensorStatusSchema = z.object({
  state: z.enum(['tracking', 'paused', 'break', 'stopped']),
  pausedUntil: z.iso.datetime({ offset: true }).nullable(),
  timer: z.object({
    running: z.boolean(),
    startedAt: z.iso.datetime({ offset: true }).nullable(),
    taskId: z.uuid().nullable(),
  }),
});
export type SensorStatus = z.infer<typeof SensorStatusSchema>;

/** Entrada de tiempo: de un temporizador o registrada a mano. `endedAt` es null mientras corre. */
export const TimeEntrySchema = z.object({
  id: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  taskId: z.uuid().nullable(),
  source: z.enum(['timer', 'manual']),
});
export type TimeEntry = z.infer<typeof TimeEntrySchema>;

/** Totales por día y categoría (segundos) de un rango de fechas. */
export const RangeViewSchema = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  days: z.array(
    z.object({
      date: z.iso.date(),
      totals: z.record(CategorySchema, z.number().int().nonnegative()),
    }),
  ),
});
export type RangeView = z.infer<typeof RangeViewSchema>;

export const IDLE_MINUTES_MIN = 3;
export const IDLE_MINUTES_MAX = 15;

/** Ajustes locales de este equipo. */
export const SettingsSchema = z.object({
  /** Minutos sin teclado ni ratón para considerar inactividad */
  idleMinutes: z.number().int().min(IDLE_MINUTES_MIN).max(IDLE_MINUTES_MAX),
  /** Procesos cuyo nombre y título no se registran */
  hiddenApps: z.array(z.string()),
});
export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = Partial<Settings>;

// ---- F2: sincronización, sesión y reglas del equipo ----

/** Bloque pendiente de subir. No tiene título: los títulos nunca salen del equipo (D-05). */
export const SyncBlockSchema = z.strictObject({
  id: z.uuid(),
  teamId: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }),
  appName: z.string().min(1),
  category: CategorySchema,
  aiTool: z.string().nullable(),
});
export type SyncBlock = z.infer<typeof SyncBlockSchema>;

export const SyncEntrySchema = z.strictObject({
  id: z.uuid(),
  teamId: z.uuid(),
  startedAt: z.iso.datetime({ offset: true }),
  endedAt: z.iso.datetime({ offset: true }).nullable(),
  taskId: z.uuid().nullable(),
  source: z.enum(['timer', 'manual']),
  updatedAt: z.iso.datetime({ offset: true }),
  deletedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type SyncEntry = z.infer<typeof SyncEntrySchema>;

/** Hueco porque Pulso estuvo cerrado (A-1). La interfaz decide si cae dentro de la jornada. */
export const SyncClosureSchema = z.strictObject({
  id: z.uuid(),
  teamId: z.uuid(),
  closedAt: z.iso.datetime({ offset: true }),
  reopenedAt: z.iso.datetime({ offset: true }),
});
export type SyncClosure = z.infer<typeof SyncClosureSchema>;

/** `strictObject`: si Rust añadiera un campo (p. ej. un título), la validación falla. */
export const SyncBatchSchema = z.strictObject({
  blocks: z.array(SyncBlockSchema),
  entries: z.array(SyncEntrySchema),
  closures: z.array(SyncClosureSchema),
});
export type SyncBatch = z.infer<typeof SyncBatchSchema>;
export type SyncKind = 'blocks' | 'entries' | 'closures';

/** Regla de clasificación del equipo, con la forma de `rules/default.json`. */
export const TeamRuleSchema = z.object({
  match: z.enum(['process', 'title']),
  pattern: z.string().min(1).max(120),
  category: z.enum(['productive', 'neutral', 'distraction', 'ai']),
  ai_tool: z.string().nullable(),
});
export type TeamRule = z.infer<typeof TeamRuleSchema>;

export interface Bridge {
  /** "mock" = datos de ejemplo; "tauri" = sensor real. La interfaz lo muestra al usuario. */
  readonly source: 'mock' | 'tauri';

  sensorStatus(): Promise<SensorStatus>;
  dayView(date: string): Promise<DayView>;

  timerStart(taskId?: string): Promise<SensorStatus>;
  timerStop(): Promise<SensorStatus>;

  breakStart(): Promise<SensorStatus>;
  breakEnd(): Promise<SensorStatus>;

  privacyPause(minutes: number): Promise<SensorStatus>;
  privacyResume(): Promise<SensorStatus>;

  /** Totales por día entre dos fechas AAAA-MM-DD (ambas incluidas). */
  rangeView(from: string, to: string): Promise<RangeView>;

  /** Entradas de tiempo del día local (ADR-0005). */
  timeEntries(date: string): Promise<TimeEntry[]>;
  timeEntryAdd(start: string, end: string, taskId?: string): Promise<TimeEntry>;
  timeEntryUpdate(id: string, start: string, end: string, taskId?: string): Promise<void>;
  timeEntryDelete(id: string): Promise<void>;

  settingsGet(): Promise<Settings>;
  settingsSet(patch: SettingsPatch): Promise<Settings>;

  // ---- F2 ----

  /** Sesión de Supabase guardada por Rust (cifrada). `null` si no hay. */
  sessionGet(): Promise<string | null>;
  sessionSet(json: string): Promise<void>;
  sessionClear(): Promise<void>;

  /** Equipo al que se asignan las filas nuevas (ADR-0007). Solo con consentimiento; si no, `null`. */
  activeTeamSet(teamId: string | null): Promise<void>;
  /** Registros del equipo activo sin subir, sin títulos. */
  syncPending(limit: number): Promise<SyncBatch>;
  syncMarkSynced(kind: SyncKind, ids: string[]): Promise<void>;
  /** Reglas de clasificación del equipo activo. */
  rulesSet(rules: TeamRule[]): Promise<void>;
}
