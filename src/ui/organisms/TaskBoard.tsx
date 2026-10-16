import { TASK_STATUSES } from '@/cloud/contract';
import { t } from '@/i18n';
import { STATUS_LABEL } from '@/lib/tasks';
import { Heading } from '@/ui/atoms';
import { TaskMeta } from '@/ui/molecules';
import { TaskStatusCell, type TaskViewProps } from './TaskList';

/**
 * Tablero de cuatro columnas (PT-06, ADR-0014): Por hacer, En curso, En revisión y Hecha. Cada tarjeta muestra
 * el siguiente paso de quien mira (Empezar, Enviar a revisión, Completar, Revisar…), que la mueve de columna.
 * Con el teclado: flechas arriba y abajo dentro de una columna, izquierda y derecha entre columnas, Enter abre.
 */
export function TaskBoard(props: TaskViewProps) {
  const cards = props.tree.flatMap(({ task, children }) => [{ task, parent: null as string | null }, ...children.map((c) => ({ task: c, parent: task.title }))]);
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {TASK_STATUSES.map((status) => {
        const column = cards.filter((c) => c.task.status === status);
        return (
          <section key={status} aria-label={STATUS_LABEL[status]} className="flex min-w-0 flex-col gap-2 rounded-lg bg-sunken p-3">
            <Heading level={3}>
              {STATUS_LABEL[status]} <span className="text-fg-muted tabular-nums">{column.length}</span>
            </Heading>
            <ul className="flex flex-col gap-2">
              {column.map(({ task, parent }) => (
                <li key={task.id} className="flex flex-col gap-2 rounded-md border border-line bg-surface p-3">
                  {parent && <p className="truncate text-xs text-fg-muted">{t('tasks.subtaskOf', { title: parent })}</p>}
                  <button
                    type="button"
                    onClick={() => props.onOpen(task)}
                    className="truncate rounded-xs text-left font-medium text-fg hover:underline"
                  >
                    {task.title}
                  </button>
                  <TaskMeta task={task} assigneeName={props.nameOf(task.assigneeId)} today={props.today} />
                  <TaskStatusCell task={task} props={props} showStatus={false} />
                </li>
              ))}
            </ul>
            {column.length === 0 && <p className="text-sm text-fg-muted">{t('tasks.emptyColumn')}</p>}
          </section>
        );
      })}
    </div>
  );
}
