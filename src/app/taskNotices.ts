import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import type { TaskStatus, TeamWork } from '@/cloud/contract';
import { useWork, workKey, type WorkData } from '@/pages/proyectos/useWork';
import type { TaskNoticeItem } from '@/ui/organisms';
import { useSession } from './session';

/** Cada cuánto se vuelve a leer el trabajo del equipo para avisar de revisiones (igual que la sincronización). */
const POLL_MS = 60_000;
const MAX_NOTICES = 3;

export type TaskNotice = TaskNoticeItem;

/** Lo último que esta persona vio de cada tarea: estado, revisión pendiente y quién la envió. */
export type TaskSnapshot = Record<string, { status: TaskStatus; review: string | null; by: string | null }>;

export const snapshotOf = (work: TeamWork): TaskSnapshot =>
  Object.fromEntries(work.tasks.map((x) => [x.id, { status: x.status, review: x.pendingReview?.id ?? null, by: x.pendingReview?.submittedBy ?? null }]));

/**
 * F6-3: avisos de revisión comparando con lo último visto.
 * - toReview: llegó una revisión que decido yo (me eligieron, o no eligieron a nadie y gestiono o lidero el proyecto).
 * - returned / approved: se decidió una revisión que envié yo.
 */
export function taskNotices(prev: TaskSnapshot, work: TeamWork, me: string): TaskNotice[] {
  const roles = new Map(work.projects.map((p) => [p.id, p.myRole]));
  const out: TaskNotice[] = [];
  for (const x of work.tasks) {
    const before = prev[x.id];
    const r = x.pendingReview;
    const base = { taskId: x.id, projectId: x.projectId, title: x.title };
    if (r && r.id !== before?.review && r.submittedBy !== me) {
      const mine = r.reviewerId === me || (r.reviewerId === null && roles.get(x.projectId) !== 'contributor');
      if (mine) out.push({ ...base, kind: 'toReview', key: `r:${r.id}` });
    } else if (!r && before?.review && before.by === me) {
      out.push({ ...base, kind: x.status === 'done' ? 'approved' : 'returned', key: `d:${before.review}` });
    }
  }
  return out;
}

const read = (key: string): TaskSnapshot | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as TaskSnapshot) : null;
  } catch {
    return null;
  }
};
const write = (key: string, value: TaskSnapshot) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento solo se avisa de lo que pase con la app abierta.
  }
};

/**
 * Avisos de revisión en cualquier pantalla. Lo visto se guarda por persona y equipo, así que al abrir la app
 * también avisa de lo que pasó mientras estaba cerrada. La primera vez solo se toma la foto, sin avisos.
 */
export function useTaskNotices() {
  const { cloud, bridge, user, activeTeam, sync } = useSession();
  const teamId = (user && activeTeam?.id) || null;
  useWork(cloud, bridge, teamId, sync.lastSyncedAt);
  const queryClient = useQueryClient();
  const [notices, setNotices] = useState<TaskNotice[]>([]);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!teamId || !userId) return;
    const storeKey = `pulso.taskNotices.${userId}.${teamId}`;
    const check = (data: WorkData | undefined) => {
      if (!data || data.offline) return;
      const prev = read(storeKey);
      if (prev) {
        const fresh = taskNotices(prev, data.work, userId);
        if (fresh.length) setNotices((list) => [...fresh, ...list.filter((n) => !fresh.some((f) => f.key === n.key))].slice(0, MAX_NOTICES));
      }
      write(storeKey, snapshotOf(data.work));
    };
    const queryKey = workKey(teamId);
    check(queryClient.getQueryData<WorkData>(queryKey));
    // Cada lectura buena del trabajo (de esta pantalla o de cualquier otra) se compara con lo último visto.
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type === 'updated' && event.action.type === 'success' && event.query.queryHash === JSON.stringify(queryKey)) {
        check(event.query.state.data as WorkData | undefined);
      }
    });
    const id = setInterval(() => void queryClient.invalidateQueries({ queryKey }), POLL_MS);
    return () => {
      unsubscribe();
      clearInterval(id);
    };
  }, [teamId, userId, queryClient]);

  const dismiss = useCallback((key: string) => setNotices((list) => list.filter((n) => n.key !== key)), []);
  return { notices, dismiss };
}
