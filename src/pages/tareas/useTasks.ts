import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Bridge } from '@/bridge/contract';
import { CloudError, type Cloud } from '@/cloud/contract';
import { parseTasksCache, type TasksCache } from '@/lib/tasks';

export interface TasksData {
  snapshot: TasksCache;
  /** true: Supabase no respondió y se muestra la copia local (solo lectura, PT-09). */
  offline: boolean;
}

/**
 * Proyectos, tareas y miembros del equipo activo en una sola lectura. Cada lectura buena se guarda en
 * el equipo (`tasks_cache_put`); sin red se devuelve esa copia.
 * ponytail: una llamada por proyecto; si un equipo llega a decenas de proyectos, una función SQL que lo traiga todo.
 */
export function useTasks(cloud: Cloud, bridge: Bridge, teamId: string | null) {
  const queryClient = useQueryClient();
  const key = ['tasks', teamId] as const;
  const query = useQuery({
    queryKey: key,
    enabled: teamId !== null,
    queryFn: async (): Promise<TasksData> => {
      const team = teamId as string;
      try {
        const projects = await cloud.myProjects(team);
        const [tasks, members] = await Promise.all([
          Promise.all(projects.map((p) => cloud.projectTasks(p.id))),
          Promise.all(projects.map((p) => cloud.projectMembers(p.id))),
        ]);
        const snapshot: TasksCache = {
          savedAt: new Date().toISOString(),
          projects,
          tasks: Object.fromEntries(projects.map((p, i) => [p.id, tasks[i] ?? []])),
          members: Object.fromEntries(projects.map((p, i) => [p.id, members[i] ?? []])),
        };
        // La copia es una ayuda: si no se puede guardar, la lista se muestra igual.
        await bridge.tasksCachePut(JSON.stringify(snapshot)).catch(() => {});
        return { snapshot, offline: false };
      } catch (cause) {
        if (!(cause instanceof CloudError && cause.kind === 'network')) throw cause;
        const cached = parseTasksCache(await bridge.tasksCacheGet());
        if (!cached) throw cause;
        return { snapshot: cached, offline: true };
      }
    },
  });
  return { ...query, refresh: () => queryClient.invalidateQueries({ queryKey: key }) };
}
