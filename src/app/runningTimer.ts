import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { TIMER_CHANGED } from '@/pages/mi-dia/useDay';
import { useWork } from '@/pages/proyectos/useWork';
import { useSession } from './session';

/**
 * Temporizador en marcha para la navegación: segundos (cuenta cada segundo), tarea y detener. null si no corre.
 * Comparte la consulta `sensor-status` con la página de tareas (B6: se vuelve a pedir cada 15 s y al enfocar).
 */
export function useRunningTimer() {
  const { cloud, bridge, activeTeam, sync, syncNow } = useSession();
  const queryClient = useQueryClient();
  const status = useQuery({ queryKey: ['sensor-status'], queryFn: () => bridge.sensorStatus(), refetchInterval: 15_000, refetchOnWindowFocus: true });
  const work = useWork(cloud, bridge, activeTeam?.id ?? null, sync.lastSyncedAt);
  const timer = status.data?.timer;
  const startedAt = timer?.running && timer.startedAt ? Date.parse(timer.startedAt) : null;

  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (startedAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  useEffect(() => {
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['sensor-status'] });
    window.addEventListener(TIMER_CHANGED, refresh);
    return () => window.removeEventListener(TIMER_CHANGED, refresh);
  }, [queryClient]);

  if (startedAt === null) return null;
  const task = work.data?.work.tasks.find((x) => x.id === timer?.taskId);
  return {
    // Hasta el primer tic, `now` puede ser anterior al inicio.
    elapsedSeconds: Math.max(0, now - startedAt) / 1000,
    taskTitle: task?.title ?? null,
    href: task ? `#/proyectos/${task.projectId}/tareas/${task.id}` : '#/mi-dia',
    stop: async () => {
      await bridge.timerStop();
      syncNow();
      window.dispatchEvent(new Event(TIMER_CHANGED));
    },
  };
}
