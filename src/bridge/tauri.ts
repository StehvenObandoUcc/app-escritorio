/**
 * Puente real: llama a los comandos del núcleo Rust (src-tauri).
 * Los nombres de comando son los de docs/ARQUITECTURA.md §6 y NO se inventan aquí.
 * Estos comandos se implementan en la fase F1; hasta entonces la app usa mock.ts.
 */
import { invoke } from '@tauri-apps/api/core';
import { DayViewSchema, SensorStatusSchema, type Bridge } from './contract';

const status = async (command: string, args?: Record<string, unknown>) =>
  SensorStatusSchema.parse(await invoke(command, args));

export function createTauriBridge(): Bridge {
  return {
    source: 'tauri',
    sensorStatus: () => status('sensor_status'),
    dayView: async (date) => DayViewSchema.parse(await invoke('day_view', { date })),
    timerStart: (taskId) => status('timer_start', { taskId: taskId ?? null }),
    timerStop: () => status('timer_stop'),
    breakStart: () => status('break_start'),
    breakEnd: () => status('break_end'),
    privacyPause: (minutes) => status('privacy_pause', { minutes }),
    privacyResume: () => status('privacy_resume'),
  };
}
