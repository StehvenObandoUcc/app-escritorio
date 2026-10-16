import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/app/session';
import type { Member, Task } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { canManageProject } from '@/lib/tasks';
import { useWork } from './useWork';

/**
 * Datos de un proyecto para su página y la de sus tareas: el trabajo visible (`team_work`), las personas
 * a las que se puede asignar, los nombres y el estado del temporizador. Un solo lugar para no repetirlo.
 */
export function useProject(projectId: string) {
  const session = useSession();
  const { cloud, bridge, user, activeTeam, sync, syncNow } = session;
  const queryClient = useQueryClient();
  const data = useWork(cloud, bridge, activeTeam?.id ?? null, sync.lastSyncedAt);
  const work = data.data?.work;
  const project = work?.projects.find((p) => p.id === projectId) ?? null;
  const tasks = work?.tasks.filter((x) => x.projectId === projectId) ?? [];
  const members = work?.members[projectId] ?? [];
  const offline = data.data?.offline ?? false;
  const me = user?.id ?? '';
  const manager = project ? canManageProject(project) : false;

  // Quien gestiona asigna a cualquiera del equipo que no sea observador (se añade al proyecto solo, AC-21).
  const team = useQuery({
    queryKey: ['members', activeTeam?.id],
    enabled: manager && !offline && Boolean(activeTeam),
    queryFn: () => cloud.members(activeTeam!.id),
  });
  const names = new Map(members.map((m) => [m.userId, m.displayName ?? t('common.noName')]));
  for (const m of team.data ?? []) if (!names.has(m.userId)) names.set(m.userId, m.displayName ?? t('common.noName'));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? t('common.exMember')) : null);
  const projectPeople = members.map((m) => ({ value: m.userId, label: names.get(m.userId) ?? '' }));
  const teamPeople = (team.data ?? []).filter((m: Member) => m.role !== 'viewer').map((m) => ({ value: m.userId, label: m.displayName ?? t('common.noName') }));
  /** A quién puede asignar quien usa la app: todo el equipo si gestiona; si no, solo a sí mismo. */
  const assignable = manager ? (teamPeople.length ? teamPeople : projectPeople) : projectPeople.filter((o) => o.value === me);

  // B6: el estado del temporizador se vuelve a pedir al enfocar la ventana y cada 15 s.
  const status = useQuery({ queryKey: ['sensor-status'], queryFn: () => bridge.sensorStatus(), refetchInterval: 15_000, refetchOnWindowFocus: true });
  const timerFor = (task: Task) => ({
    running: Boolean(status.data?.timer.running),
    onThis: Boolean(status.data?.timer.running) && status.data?.timer.taskId === task.id,
  });
  /** TA-05 y B13: el temporizador va sobre la tarea; si corre en otra, se detiene y empieza en esta. */
  const toggleTimer = async (task: Task) => {
    const timer = status.data?.timer;
    const onThis = timer?.running && timer.taskId === task.id;
    if (timer?.running) await bridge.timerStop();
    if (!onThis) await bridge.timerStart(task.id);
    else syncNow();
    await queryClient.invalidateQueries({ queryKey: ['sensor-status'] });
  };

  return {
    ...session,
    data,
    work,
    project,
    tasks,
    members,
    offline,
    me,
    manager,
    nameOf,
    projectPeople,
    teamPeople,
    assignable,
    isProjectMember: members.some((m) => m.userId === me),
    timerFor,
    toggleTimer,
    refresh: data.refresh,
    loadError: data.isError ? errorMessage(data.error) : null,
  };
}
