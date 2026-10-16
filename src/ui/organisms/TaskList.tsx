import { CornerDownRight } from 'lucide-react';
import type { Task } from '@/cloud/contract';
import { t } from '@/i18n';
import { STATUS_LABEL, type Step } from '@/lib/tasks';
import { Badge } from '@/ui/atoms';
import { TaskMeta } from '@/ui/molecules';
import { StepButton } from './TaskWorkflow';

export interface TaskViewProps {
  /** Tareas madre con sus subtareas (ya filtradas). */
  tree: { task: Task; children: Task[] }[];
  /** Nombre visible del responsable (null = sin responsable). */
  nameOf: (userId: string | null) => string | null;
  today: string;
  /** Siguiente paso de quien mira para cada tarea (null = nada que hacer). */
  primaryStep: (task: Task) => Step | null;
  onStep: (task: Task, step: Step) => void;
  onOpen: (task: Task) => void;
}

/** Estado como etiqueta y, si a quien mira le toca algo, el botón de su siguiente paso (AC-45 v4). */
export function TaskStatusCell({ task, props, showStatus = true }: { task: Task; props: TaskViewProps; showStatus?: boolean }) {
  const step = props.primaryStep(task);
  if (!showStatus && !step) return null;
  return (
    <span className="flex flex-wrap items-center gap-2">
      {showStatus && <Badge tone={task.status === 'done' ? 'accent' : 'neutral'}>{STATUS_LABEL[task.status]}</Badge>}
      {step && <StepButton step={step} primary={false} compact onStep={(s) => props.onStep(task, s)} />}
    </span>
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
          className={`max-w-full truncate rounded-xs text-left font-medium hover:underline ${task.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'}`}
        >
          {task.title}
        </button>
        <TaskMeta task={task} assigneeName={props.nameOf(task.assigneeId)} today={props.today} />
      </div>
      <TaskStatusCell task={task} props={props} />
    </li>
  );
}

/** Lista de tareas (PT-05) con sus subtareas debajo. Flechas arriba y abajo para recorrerla, Enter para abrir. */
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
