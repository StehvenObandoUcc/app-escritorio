import type { Task } from '@/cloud/contract';
import { formatMinutes, isOverdue } from '@/lib/tasks';
import { Badge } from '@/ui/atoms';

const formatDue = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });

/** Responsable, fecha límite, etiquetas y tiempo frente a lo estimado de una tarea. */
export function TaskMeta({ task, assigneeName, today }: { task: Task; assigneeName: string | null; today: string }) {
  const logged = formatMinutes(task.loggedSeconds / 60);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
      <span>{assigneeName ?? 'Sin responsable'}</span>
      {task.dueDate && (
        <span className={isOverdue(task, today) ? 'font-medium text-danger' : undefined}>
          {isOverdue(task, today) ? 'Venció' : 'Vence'} {formatDue(task.dueDate)}
        </span>
      )}
      <span className="tabular-nums">{task.estimateMinutes ? `${logged} de ${formatMinutes(task.estimateMinutes)}` : logged}</span>
      {task.labels.map((l) => (
        <Badge key={l}>{l}</Badge>
      ))}
    </div>
  );
}
