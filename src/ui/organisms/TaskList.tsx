import { TASK_STATUSES, type Task, type TaskStatus } from '@/cloud/contract';
import { STATUS_LABEL } from '@/lib/tasks';
import { Badge, Select } from '@/ui/atoms';
import { TaskMeta } from '@/ui/molecules';

export interface TaskViewProps {
  tasks: Task[];
  /** Nombre visible del responsable (null = sin responsable). */
  nameOf: (userId: string | null) => string | null;
  today: string;
  /** Si es false para una tarea, su estado se muestra sin selector. */
  canChangeStatus: (task: Task) => boolean;
  onStatusChange: (task: Task, status: TaskStatus) => void;
  onOpen: (task: Task) => void;
}

const statusOptions = TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }));

/** Selector de estado si se puede cambiar; si no, una etiqueta. Mueve la tarea de columna en el tablero (PT-06). */
export function TaskStatusControl({ task, editable, onChange }: { task: Task; editable: boolean; onChange: (s: TaskStatus) => void }) {
  return editable ? (
    <Select
      size="sm"
      aria-label={`Estado de ${task.title}`}
      value={task.status}
      onChange={(e) => onChange(e.target.value as TaskStatus)}
      options={statusOptions}
    />
  ) : (
    <Badge tone={task.status === 'done' ? 'accent' : 'neutral'}>{STATUS_LABEL[task.status]}</Badge>
  );
}

/** Lista de tareas (PT-05). Cada tarea se abre con su título; el estado se cambia en la fila. */
export function TaskList({ tasks, nameOf, today, canChangeStatus, onStatusChange, onOpen }: TaskViewProps) {
  return (
    <ul aria-label="Tareas" className="flex flex-col divide-y divide-line">
      {tasks.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
          <div className="min-w-0 flex-1">
            <button
              type="button"
              onClick={() => onOpen(t)}
              className={`max-w-full truncate text-left font-medium hover:underline ${t.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'}`}
            >
              {t.title}
            </button>
            <TaskMeta task={t} assigneeName={nameOf(t.assigneeId)} today={today} />
          </div>
          <TaskStatusControl task={t} editable={canChangeStatus(t)} onChange={(s) => onStatusChange(t, s)} />
        </li>
      ))}
    </ul>
  );
}
