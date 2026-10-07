import { t } from '@/i18n';
import { doneRatio, formatMinutes, timeRatio } from '@/lib/tasks';
import { ProgressBar } from '@/ui/atoms';

export interface ProjectProgressProps {
  tasksDone: number;
  tasksTotal: number;
  loggedSeconds: number;
  estimateMinutes: number;
}

/** Avance de un proyecto (PT-08): tareas hechas y tiempo real frente al estimado. Las cifras vienen de SQL. */
export function ProjectProgress({ tasksDone, tasksTotal, loggedSeconds, estimateMinutes }: ProjectProgressProps) {
  const time = timeRatio(loggedSeconds, estimateMinutes || null);
  const logged = formatMinutes(loggedSeconds / 60);
  const done = t('projects.progress.done', { done: tasksDone, n: tasksTotal });
  const spent = estimateMinutes ? t('projects.progress.time', { logged, estimate: formatMinutes(estimateMinutes) }) : t('projects.progress.timeNoEstimate', { logged });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg">{done}</p>
        <ProgressBar value={doneRatio({ tasksDone, tasksTotal })} label={done} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg">{spent}</p>
        <ProgressBar value={time ?? 0} label={spent} fill={time !== null && time > 1 ? 'bg-cat-distraction' : 'bg-accent'} />
        {time !== null && time > 1 && <p className="text-sm text-fg-muted">{t('projects.progress.over')}</p>}
      </div>
    </div>
  );
}
