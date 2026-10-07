import { CornerDownRight } from 'lucide-react';
import type { ManualStatus, Task } from '@/cloud/contract';
import { t } from '@/i18n';
import { STATUS_LABEL } from '@/lib/tasks';
import { Badge, Select } from '@/ui/atoms';
import { TaskMeta } from '@/ui/molecules';

export interface TaskViewProps {
  /** Tareas madre con sus subtareas (ya filtradas). */
  tree: { task: Task; children: Task[] }[];
  /** Nombre visible del responsable (null = sin responsable). */
  nameOf: (userId: string | null) => string | null;
  today: string;
  /** Si es false para una tarea, su estado se muestra sin selector. */
  canChangeStatus: (task: Task) => boolean;
  onStatusChange: (task: Task, status: ManualStatus) => void;
  onOpen: (task: Task) => void;
}

/**
 * Selector de estado si se puede cambiar; si no, una etiqueta. Solo ofrece «Por hacer» y «En curso»:
 * a «En revisión» se llega enviando la tarea y a «Hecha» aprobándola (ADR-0014).
 */
export function TaskStatusControl({ task, editable, onChange }: { task: Task; editable: boolean; onChange: (s: ManualStatus) => void }) {
  if (!editable) return <Badge tone={task.status === 'done' ? 'accent' : 'neutral'}>{STATUS_LABEL[task.status]}</Badge>;
  const manual: ManualStatus[] = ['todo', 'doing'];
  const options = (manual.includes(task.status as ManualStatus) ? manual : [task.status, ...manual]).map((s) => ({ value: s, label: STATUS_LABEL[s] }));
  return (
    <Select
      size="sm"
      aria-label={t('tasks.statusOf', { title: task.title })}
      value={task.status}
      onChange={(e) => onChange(e.target.value as ManualStatus)}
      options={options}
    />
  );
}

function Row({ task, sub, props }: { task: Task; sub: boolean; props: TaskViewProps }) {
  return (
    <li className={`flex flex-wrap items-center gap-3 py-3 ${sub ? 'pl-6' : ''}`}>
      {sub && <CornerDownRight size={16} aria-hidden="true" className="text-fg-muted" />}
      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => props.onOpen(task)}
          className={`max-w-full truncate text-left font-medium hover:underline ${task.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'}`}
        >
          {task.title}
        </button>
        <TaskMeta task={task} assigneeName={props.nameOf(task.assigneeId)} today={props.today} />
      </div>
      <TaskStatusControl task={task} editable={props.canChangeStatus(task)} onChange={(s) => props.onStatusChange(task, s)} />
    </li>
  );
}

/** Lista de tareas (PT-05) con sus subtareas debajo (un nivel, ADR-0014). */
export function TaskList(props: TaskViewProps) {
  return (
    <ul aria-label={t('tasks.listLabel')} className="flex flex-col divide-y divide-line">
      {props.tree.flatMap(({ task, children }) => [
        <Row key={task.id} task={task} sub={false} props={props} />,
        ...children.map((c) => <Row key={c.id} task={c} sub props={props} />),
      ])}
    </ul>
  );
}
