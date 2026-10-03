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
}
