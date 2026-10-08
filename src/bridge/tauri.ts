/**
 * Puente real: llama a los comandos del núcleo Rust (src-tauri).
 * Los nombres de comando son los de docs/ARQUITECTURA.md §6 y NO se inventan aquí.
 * Todo lo que vuelve de Rust se valida con zod antes de usarse.
 */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { z } from 'zod';
import {
  DayViewSchema,
  InstalledAppSchema,
  NotAllowedAlertSchema,
  NotificationsStatusSchema,
  RangeViewSchema,
  SensorStatusSchema,
  SettingsSchema,
  SyncBatchSchema,
  TimeEntrySchema,
  type Bridge,
} from './contract';

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
    rangeView: async (from, to) => RangeViewSchema.parse(await invoke('range_view', { from, to })),
    timeEntries: async (date) => z.array(TimeEntrySchema).parse(await invoke('time_entries', { date })),
    timeEntryAdd: async (start, end, taskId) =>
      TimeEntrySchema.parse(await invoke('time_entry_add', { start, end, taskId: taskId ?? null })),
    timeEntryUpdate: async (id, start, end, taskId) => {
      await invoke('time_entry_update', { id, start, end, taskId: taskId ?? null });
    },
    timeEntryDelete: async (id) => {
      await invoke('time_entry_delete', { id });
    },
    settingsGet: async () => SettingsSchema.parse(await invoke('settings_get')),
    settingsSet: async (patch) => SettingsSchema.parse(await invoke('settings_set', { patch })),
    sessionGet: async () => z.string().nullable().parse(await invoke('session_get')),
    sessionSet: async (json) => {
      await invoke('session_set', { json });
    },
    sessionClear: async () => {
      await invoke('session_clear');
    },
    activeTeamSet: async (teamId, userId) => {
      await invoke('active_team_set', { teamId, userId });
    },
    syncPending: async (limit) => SyncBatchSchema.parse(await invoke('sync_pending', { limit })),
    syncMarkSynced: async (kind, ids) => {
      await invoke('sync_mark_synced', { kind, ids });
    },
    rulesSet: async (rules) => {
      await invoke('rules_set', { json: JSON.stringify(rules) });
    },
    teamPolicySet: async (policy) => {
      await invoke('team_policy_set', { policy });
    },
    installedApps: async () => z.array(InstalledAppSchema).parse(await invoke('installed_apps')),
    notificationsStatus: async () => NotificationsStatusSchema.parse(await invoke('notifications_status')),
    onNotAllowedAlert: (listener) => {
      let stopped = false;
      let unlisten: (() => void) | null = null;
      void listen('not-allowed-alert', (event) => {
        const alert = NotAllowedAlertSchema.safeParse(event.payload);
        if (alert.success) listener(alert.data);
      }).then((off) => {
        if (stopped) off();
        else unlisten = off;
      });
      return () => {
        stopped = true;
        unlisten?.();
      };
    },
    tasksCachePut: async (json) => {
      await invoke('tasks_cache_put', { json });
    },
    tasksCacheGet: async () => z.string().nullable().parse(await invoke('tasks_cache_get')),
    openExternal: async (url) => {
      await invoke('open_external', { url });
    },
  };
}
