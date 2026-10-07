import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import type { Bridge } from '@/bridge/contract';
import { CloudError, type Cloud } from '@/cloud/contract';
import { parseTasksCache, type TasksCache } from '@/lib/tasks';

export interface WorkData {
  work: TasksCache;
  /** true: Supabase no respondió y se muestra la copia local (solo lectura, PT-09). */
  offline: boolean;
}

export const workKey = (teamId: string | null) => ['work', teamId] as const;

/**
 * Todo el trabajo visible del equipo activo en una sola lectura (`team_work`, AC-29). Cada lectura buena se
 * guarda en el equipo (`tasks_cache_put`); sin red se devuelve esa copia. Se vuelve a pedir cuando la
 * sincronización sube algo (`syncedAt`), para que el tiempo del temporizador aparezca en la tarea (AC-31).
 */
export function useWork(cloud: Cloud, bridge: Bridge, teamId: string | null, syncedAt: string | null) {
  const queryClient = useQueryClient();
  const key = workKey(teamId);
  const query = useQuery({
    queryKey: key,
    enabled: teamId !== null,
    queryFn: async (): Promise<WorkData> => {
      try {
        const work: TasksCache = { ...(await cloud.teamWork(teamId as string)), savedAt: new Date().toISOString() };
        // La copia es una ayuda: si no se puede guardar, el trabajo se muestra igual.
        await bridge.tasksCachePut(JSON.stringify(work)).catch(() => {});
        return { work, offline: false };
      } catch (cause) {
        if (!(cause instanceof CloudError && cause.kind === 'network')) throw cause;
        const cached = parseTasksCache(await bridge.tasksCacheGet());
        if (!cached) throw cause;
        return { work: cached, offline: true };
      }
    },
  });
  useEffect(() => {
    if (syncedAt) void queryClient.invalidateQueries({ queryKey: workKey(teamId) });
  }, [syncedAt, teamId, queryClient]);
  return { ...query, refresh: () => queryClient.invalidateQueries({ queryKey: key }) };
}
