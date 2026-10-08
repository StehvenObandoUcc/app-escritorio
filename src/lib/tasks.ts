/**
 * Lógica de tareas sin interfaz (ADR-0014): filtros (PT-05), subtareas, estimación con unidad, avance
 * (PT-07, PT-08), permisos visibles (docs/ROLES.md filas 16 a 19 y 27 a 30) y la copia sin conexión (PT-09).
 * Los permisos solo deciden qué botones aparecen: quien hace cumplir las reglas es la base de datos.
 */
import { z } from 'zod';
import { TASK_STATUSES, TASK_TYPES, TeamWorkSchema, type Project, type Task, type TeamWork } from '@/cloud/contract';
import { lazyLabels } from '@/i18n';
import type { Role } from './permissions';

export const STATUS_LABEL = lazyLabels(TASK_STATUSES, (s) => `tasks.status.${s}`);
export const TYPE_LABEL = lazyLabels(TASK_TYPES, (k) => `tasks.type.${k}`);
export const PROJECT_ROLE_LABEL = lazyLabels(['manager', 'lead', 'contributor'] as const, (r) => `projects.role.${r}`);

// ---- Filtros (PT-05) ----

export interface TaskFilter {
  /** 'me' = donde soy responsable o apoyo · 'none' = sin responsable · un id · '' = todas */
  assignee: string;
  status: Task['status'] | '';
  type: Task['type'] | '';
  label: string;
  /** Vence hasta esta fecha (AAAA-MM-DD), incluida. Las tareas sin fecha no cumplen este filtro. '' = sin filtro. */
  dueUntil: string;
}

export const NO_FILTER: TaskFilter = { assignee: '', status: '', type: '', label: '', dueUntil: '' };
export const isFiltered = (f: TaskFilter) => Object.values(f).some((v) => v !== '');

export const isWorker = (t: Pick<Task, 'assigneeId' | 'collaborators'>, me: string) => t.assigneeId === me || t.collaborators.includes(me);

export function matches(t: Task, f: TaskFilter, me: string): boolean {
  return (
    (f.assignee === '' ||
      (f.assignee === 'me' ? isWorker(t, me) : f.assignee === 'none' ? t.assigneeId === null : t.assigneeId === f.assignee)) &&
    (f.status === '' || t.status === f.status) &&
    (f.type === '' || t.type === f.type) &&
    (f.label === '' || t.labels.includes(f.label)) &&
    (f.dueUntil === '' || (t.dueDate !== null && t.dueDate <= f.dueUntil))
  );
}

/**
 * Tareas madre con sus subtareas, filtradas. Una madre aparece si cumple el filtro o si alguna subtarea lo cumple;
 * en ese caso solo se muestran las subtareas que lo cumplen.
 */
export function taskTree(tasks: Task[], f: TaskFilter, me: string): { task: Task; children: Task[] }[] {
  const filtered = isFiltered(f);
  return tasks
    .filter((t) => !t.parentId)
    .map((task) => {
      const all = tasks.filter((c) => c.parentId === task.id);
      const children = filtered ? all.filter((c) => matches(c, f, me)) : all;
      return { task, children, show: matches(task, f, me) || children.length > 0 };
    })
    .filter((x) => x.show)
    .map(({ task, children }) => ({ task, children }));
}

export const allLabels = (tasks: Task[]) => [...new Set(tasks.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b));

// ---- Estimación con unidad (AC-30): 1 día = 8 h, 1 semana = 5 días ----

export const UNIT_MINUTES = { min: 1, h: 60, d: 8 * 60, w: 5 * 8 * 60 } as const;
export type EstimateUnit = keyof typeof UNIT_MINUTES;
export const ESTIMATE_UNITS = Object.keys(UNIT_MINUTES) as EstimateUnit[];

export const toMinutes = (value: number, unit: EstimateUnit) => Math.round(value * UNIT_MINUTES[unit]);

/** Unidad más grande que expresa los minutos sin decimales feos: 960 → 2 d · 90 → 90 min · 2400 → 1 w. */
export function bestUnit(minutes: number): { value: number; unit: EstimateUnit } {
  for (const unit of ['w', 'd', 'h'] as const) {
    const value = minutes / UNIT_MINUTES[unit];
    if (value >= 1 && Number.isInteger(value * 2)) return { value, unit };
  }
  return { value: minutes, unit: 'min' };
}

/** Minutos en texto corto con días de 8 h: 90 → «1 h 30 min» · 1020 → «2 d 1 h» · 4000 → «8 d 2 h». */
export function formatMinutes(minutes: number): string {
  const m = Math.round(Math.max(0, minutes));
  const d = Math.floor(m / UNIT_MINUTES.d);
  const h = Math.floor((m % UNIT_MINUTES.d) / 60);
  const rest = m % 60;
  if (d > 0) return h ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return rest ? `${h} h ${rest} min` : `${h} h`;
  return `${rest} min`;
}

// ---- Avance (PT-07, PT-08) ----

/** Fracción del tiempo estimado ya registrado (puede pasar de 1). `null` sin estimación. */
export const timeRatio = (loggedSeconds: number, estimateMinutes: number | null) =>
  estimateMinutes ? loggedSeconds / (estimateMinutes * 60) : null;

export const doneRatio = (p: Pick<Project, 'tasksDone' | 'tasksTotal'>) => (p.tasksTotal ? p.tasksDone / p.tasksTotal : 0);

/** ¿Vencida? Solo si no está hecha y la fecha límite ya pasó. */
export const isOverdue = (t: Pick<Task, 'dueDate' | 'status'>, today: string) => t.status !== 'done' && t.dueDate !== null && t.dueDate < today;

// ---- Permisos visibles ----

/** Fila 16: owner y admin crean y archivan proyectos. */
export const canCreateProject = (teamRole: Role) => teamRole === 'owner' || teamRole === 'admin';

/** Filas 17, 18 y 30: owner, admin y el líder gestionan el proyecto. */
export const canManageProject = (p: Pick<Project, 'myRole'>) => p.myRole === 'manager' || p.myRole === 'lead';

type Proj = Pick<Project, 'myRole' | 'archivedAt'>;

/**
 * Fila 19 v3: el selector de estado lo usan quien gestiona, el responsable o un apoyo (AC-45). Elegir En revisión
 * o Hecha abre el formulario de entrega; una tarea en revisión o hecha solo la mueve quien gestiona.
 */
export const canChangeStatus = (p: Proj, t: Pick<Task, 'assigneeId' | 'collaborators' | 'status'>, me: string) =>
  !p.archivedAt && (canManageProject(p) || (t.status !== 'review' && t.status !== 'done' && isWorker(t, me)));

/** Fila 32: quien gestiona completa directamente con el formulario. */
export const canComplete = (p: Proj, t: Pick<Task, 'status'>) => !p.archivedAt && canManageProject(p) && t.status !== 'done';

/** Fila 31: cualquiera del proyecto toma una tarea sin responsable que no está en revisión ni hecha. */
export const canTake = (p: Proj, t: Pick<Task, 'assigneeId' | 'status'>, isProjectMember: boolean) =>
  !p.archivedAt && isProjectMember && t.assigneeId === null && (t.status === 'todo' || t.status === 'doing');

/** Qué hace el selector de estado al elegir un estado (AC-45). */
export function statusAction(p: Proj, t: Pick<Task, 'assigneeId' | 'collaborators' | 'status'>, me: string, next: Task['status']) {
  if (next === 'todo' || next === 'doing') return 'set' as const;
  if (next === 'review') return canSubmit(p, t, me) ? ('submit' as const) : ('forbidden' as const);
  return canComplete(p, t) ? ('complete' as const) : canSubmit(p, t, me) ? ('submit' as const) : ('forbidden' as const);
}

/** Fila 27: envía a revisión el responsable o un apoyo. */
export const canSubmit = (p: Proj, t: Pick<Task, 'assigneeId' | 'collaborators' | 'status'>, me: string) =>
  !p.archivedAt && (t.status === 'todo' || t.status === 'doing') && isWorker(t, me);

/** Fila 28: decide el revisor pedido o quien gestiona; quien envió no se aprueba salvo que gestione. */
export const canReview = (p: Proj, t: Pick<Task, 'pendingReview'>, me: string) => {
  const r = t.pendingReview;
  if (!r || p.archivedAt) return false;
  return canManageProject(p) || (r.reviewerId === me && r.submittedBy !== me);
};

/** Fila 29: apoyos los gestiona quien gestiona el proyecto, o el responsable si la tarea lo permite. */
export const canManagePeople = (p: Proj, t: Pick<Task, 'assigneeId' | 'assigneeCanManage'>, me: string) =>
  !p.archivedAt && (canManageProject(p) || (t.assigneeId === me && t.assigneeCanManage));

// ---- Mis tareas ----

/** Tareas donde soy responsable o apoyo, y revisiones que me tocan decidir. */
export function myWork(work: TeamWork, me: string) {
  const projectOf = new Map(work.projects.map((p) => [p.id, p]));
  return {
    mine: work.tasks.filter((t) => isWorker(t, me) && t.status !== 'done'),
    toReview: work.tasks.filter((t) => {
      const p = projectOf.get(t.projectId);
      return p ? canReview(p, t, me) && t.pendingReview?.submittedBy !== me : false;
    }),
  };
}

// ---- Copia local (PT-09, AC-29) ----

export const TasksCacheSchema = TeamWorkSchema.extend({ savedAt: z.string() });
export type TasksCache = z.infer<typeof TasksCacheSchema>;

/** Lee la copia guardada por Rust; si está dañada o es de otra versión, como si no hubiera. */
export function parseTasksCache(json: string | null): TasksCache | null {
  if (!json) return null;
  try {
    const parsed = TasksCacheSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
