import { Check, CheckCircle2, Hand, Play, RotateCcw, Search, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { TASK_STATUSES, type Task } from '@/cloud/contract';
import { t } from '@/i18n';
import { cx } from '@/lib/cx';
import { STATUS_LABEL, type Step } from '@/lib/tasks';
import { Button } from '@/ui/atoms';

const ICON: Record<Step, ReactNode> = {
  take: <Hand size={16} aria-hidden="true" />,
  start: <Play size={16} aria-hidden="true" />,
  submit: <Send size={16} aria-hidden="true" />,
  complete: <CheckCircle2 size={16} aria-hidden="true" />,
  review: <Search size={16} aria-hidden="true" />,
  reopen: <RotateCcw size={16} aria-hidden="true" />,
};

/** Botón de un paso del flujo. `compact` para la lista y el tablero. */
export function StepButton({ step, primary, compact = false, onStep }: { step: Step; primary: boolean; compact?: boolean; onStep: (s: Step) => void }) {
  return (
    <Button size={compact ? 'sm' : 'md'} variant={primary ? 'primary' : 'secondary'} icon={ICON[step]} onClick={() => onStep(step)}>
      {t(`tasks.steps.${step}`)}
    </Button>
  );
}

/**
 * Flujo de la tarea (AC-45 v4): los cuatro estados como pasos, el actual marcado, y el siguiente paso de quien
 * mira como botón principal. Una frase dice en qué está la tarea y quién mueve ahora. Sin selectores de estado.
 */
export function TaskWorkflow({
  task,
  steps,
  waitingFor,
  onStep,
}: {
  task: Pick<Task, 'status'>;
  steps: { primary: Step | null; secondary: Step[] };
  /** Nombre de quien debe actuar si no es quien mira (responsable o revisor). */
  waitingFor: string | null;
  onStep: (s: Step) => void;
}) {
  const current = TASK_STATUSES.indexOf(task.status);
  return (
    <section aria-label={t('tasks.flow.label')} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-5">
      <ol className="grid grid-cols-4 gap-2">
        {TASK_STATUSES.map((status, i) => {
          const done = i < current || task.status === 'done';
          const active = i === current;
          return (
            <li key={status} aria-current={active ? 'step' : undefined} className="flex min-w-0 flex-col gap-2">
              <span className={cx('h-1 rounded-full', done || active ? 'bg-accent' : 'bg-sunken')} />
              <span className={cx('flex min-w-0 items-center gap-1 text-xs md:text-sm', active ? 'font-semibold text-fg' : done ? 'text-fg' : 'text-fg-muted')}>
                {done && !active && <Check size={14} aria-hidden="true" className="shrink-0 text-accent-text" />}
                <span className="truncate">{STATUS_LABEL[status]}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-fg" aria-live="polite">
          {t(`tasks.flow.${task.status}`)}
          {waitingFor && !steps.primary && <span className="text-fg-muted"> {t('tasks.flow.waiting', { name: waitingFor })}</span>}
        </p>
        {(steps.primary || steps.secondary.length > 0) && (
          <div className="flex flex-wrap gap-2">
            {steps.primary && <StepButton step={steps.primary} primary onStep={onStep} />}
            {steps.secondary.map((s) => (
              <StepButton key={s} step={s} primary={false} onStep={onStep} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
