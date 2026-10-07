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
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg">
          <span className="font-display text-xl font-semibold tabular-nums">
            {tasksDone} de {tasksTotal}
          </span>{' '}
          tareas hechas
        </p>
        <ProgressBar value={doneRatio({ tasksDone, tasksTotal })} label={`${tasksDone} de ${tasksTotal} tareas hechas`} />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg">
          <span className="font-display text-xl font-semibold tabular-nums">{logged}</span>{' '}
          {estimateMinutes ? `de ${formatMinutes(estimateMinutes)} estimadas` : 'registradas (sin estimación)'}
        </p>
        <ProgressBar
          value={time ?? 0}
          label={estimateMinutes ? `${logged} de ${formatMinutes(estimateMinutes)} estimadas` : `${logged} registradas`}
          fill={time !== null && time > 1 ? 'bg-cat-distraction' : 'bg-accent'}
        />
        {time !== null && time > 1 && <p className="text-sm text-fg-muted">Ya supera lo estimado.</p>}
      </div>
    </div>
  );
}
