import { TASK_STATUSES } from '@/cloud/contract';
import { STATUS_LABEL } from '@/lib/tasks';
import { Heading } from '@/ui/atoms';
import { TaskMeta } from '@/ui/molecules';
import { TaskStatusControl, type TaskViewProps } from './TaskList';

/**
 * Tablero de tres columnas (PT-06). Una tarea cambia de columna con su selector de estado,
 * que también se usa con teclado (sin arrastrar y soltar: D-11 de la spec F3).
 */
export function TaskBoard({ tasks, nameOf, today, canChangeStatus, onStatusChange, onOpen }: TaskViewProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {TASK_STATUSES.map((status) => {
        const column = tasks.filter((t) => t.status === status);
        return (
          <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-w-0 flex-col gap-2 rounded-lg bg-sunken p-3">
            <Heading level={3}>
              {STATUS_LABEL[status]} <span className="text-fg-muted tabular-nums">{column.length}</span>
            </Heading>
            <ul className="flex flex-col gap-2">
              {column.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
                  <button type="button" onClick={() => onOpen(t)} className="truncate text-left font-medium text-fg hover:underline">
                    {t.title}
                  </button>
                  <TaskMeta task={t} assigneeName={nameOf(t.assigneeId)} today={today} />
                  <TaskStatusControl task={t} editable={canChangeStatus(t)} onChange={(s) => onStatusChange(t, s)} />
                </li>
              ))}
            </ul>
            {column.length === 0 && <p className="text-sm text-fg-muted">Sin tareas.</p>}
          </section>
        );
      })}
    </div>
  );
}
