import type { Task } from '@/cloud/contract';
import { formatDate, t } from '@/i18n';
import { formatMinutes, isOverdue, TYPE_LABEL } from '@/lib/tasks';
import { Badge } from '@/ui/atoms';

/** Tipo, responsable, apoyos, fecha límite, etiquetas y tiempo frente a lo estimado de una tarea. */
export function TaskMeta({ task, assigneeName, today }: { task: Task; assigneeName: string | null; today: string }) {
  const logged = formatMinutes(task.loggedSeconds / 60);
  const overdue = isOverdue(task, today);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
      <Badge>{TYPE_LABEL[task.type]}</Badge>
      <span>
        {assigneeName ?? t('tasks.noAssignee')}
        {task.collaborators.length > 0 && ` ${t('tasks.plusHelpers', { n: task.collaborators.length })}`}
      </span>
      {task.dueDate && (
        <span className={overdue ? 'font-medium text-danger' : undefined}>
          {t(overdue ? 'tasks.overdue' : 'tasks.due', { date: formatDate(task.dueDate, { day: 'numeric', month: 'short' }) })}
        </span>
      )}
      <span className="tabular-nums">{task.estimateMinutes ? t('tasks.timeOf', { logged, estimate: formatMinutes(task.estimateMinutes) }) : logged}</span>
      {task.criteria.length > 0 && <span>{t('tasks.criteriaCount', { met: task.criteria.filter((c) => c.met).length, n: task.criteria.length })}</span>}
      {task.labels.map((l) => (
        <Badge key={l}>{l}</Badge>
      ))}
    </div>
  );
}
