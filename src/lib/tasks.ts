/**
 * Lógica de tareas sin interfaz: filtros (PT-05), avance (PT-07, PT-08), permisos visibles
 * (docs/ROLES.md filas 16 a 19) y la copia local para verlas sin conexión (PT-09).
 * Los permisos solo deciden qué botones aparecen: quien hace cumplir las reglas es la base de datos.
 */
import { z } from 'zod';
import { ProjectMemberSchema, ProjectSchema, TaskSchema, type Project, type Task, type TaskStatus } from '@/cloud/contract';
import type { Role } from './permissions';

export const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'Por hacer', doing: 'En curso', done: 'Hecha' };

export const PROJECT_ROLE_LABEL = { manager: 'Gestión del equipo', lead: 'Líder', contributor: 'Colaborador' } as const;

// ---- Filtros (PT-05) ----

export interface TaskFilter {
  /** 'me' = mis tareas · 'none' = sin responsable · un id · '' = todas */
  assignee: string;
  status: TaskStatus | '';
  label: string;
  /** Vence hasta esta fecha (AAAA-MM-DD), incluida. '' = sin filtro. */
  dueUntil: string;
}

export const NO_FILTER: TaskFilter = { assignee: '', status: '', label: '', dueUntil: '' };

export function filterTasks(tasks: Task[], f: TaskFilter, me: string): Task[] {
  return tasks.filter(
    (t) =>
      (f.assignee === '' ||
        (f.assignee === 'me' ? t.assigneeId === me : f.assignee === 'none' ? t.assigneeId === null : t.assigneeId === f.assignee)) &&
      (f.status === '' || t.status === f.status) &&
      (f.label === '' || t.labels.includes(f.label)) &&
      (f.dueUntil === '' || (t.dueDate !== null && t.dueDate <= f.dueUntil)),
  );
}

export const allLabels = (tasks: Task[]) => [...new Set(tasks.flatMap((t) => t.labels))].sort((a, b) => a.localeCompare(b));

// ---- Avance (PT-07, PT-08) ----

/** Fracción del tiempo estimado ya registrado (puede pasar de 1). `null` sin estimación. */
export const timeRatio = (loggedSeconds: number, estimateMinutes: number | null) =>
  estimateMinutes ? loggedSeconds / (estimateMinutes * 60) : null;

export const doneRatio = (p: Pick<Project, 'tasksDone' | 'tasksTotal'>) => (p.tasksTotal ? p.tasksDone / p.tasksTotal : 0);

/** Minutos en texto corto: 90 → «1 h 30 min». */
export function formatMinutes(minutes: number): string {
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  if (h === 0) return `${m} min`;
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}

/** ¿Vencida? Solo si no está hecha y la fecha límite ya pasó. */
export const isOverdue = (t: Pick<Task, 'dueDate' | 'status'>, today: string) => t.status !== 'done' && t.dueDate !== null && t.dueDate < today;

// ---- Permisos visibles (filas 16 a 19) ----

/** Fila 16: owner y admin crean y archivan proyectos. */
export const canCreateProject = (teamRole: Role) => teamRole === 'owner' || teamRole === 'admin';

/** Filas 17 y 18: owner, admin y el lead gestionan miembros y editan cualquier tarea. */
export const canManageProject = (p: Pick<Project, 'myRole'>) => p.myRole === 'manager' || p.myRole === 'lead';

/** Fila 19: quien gestiona, o el responsable de la tarea, cambia su estado. */
export const canChangeStatus = (p: Pick<Project, 'myRole' | 'archivedAt'>, t: Pick<Task, 'assigneeId'>, me: string) =>
  !p.archivedAt && (canManageProject(p) || t.assigneeId === me);

// ---- Copia local (PT-09, D-9) ----

export const TasksCacheSchema = z.object({
  savedAt: z.string(),
  projects: z.array(ProjectSchema),
  tasks: z.record(z.string(), z.array(TaskSchema)),
  members: z.record(z.string(), z.array(ProjectMemberSchema)),
});
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
