import { Play, Square } from 'lucide-react';
import { useState } from 'react';
import type { Project, Task } from '@/cloud/contract';
import { errorMessage, formatDate, t } from '@/i18n';
import { canManagePeople, formatMinutes, timeRatio, TYPE_LABEL } from '@/lib/tasks';
import { Badge, Button, Heading, ProgressBar, type SelectOption } from '@/ui/atoms';

export interface TaskSidebarProps {
  task: Task;
  project: Pick<Project, 'myRole' | 'archivedAt'>;
  me: string;
  nameOf: (userId: string | null) => string | null;
  /** A quién se puede añadir como apoyo. */
  people: SelectOption[];
  readOnly: boolean;
  timer: { running: boolean; onThis: boolean };
  onCollaborators: (userIds: string[]) => Promise<void>;
  onTimer: () => void;
}

/**
 * Columna lateral de la tarea (D-16): tipo, personas, fechas, tiempo frente a lo estimado y temporizador.
 * Los pasos del flujo (empezar, enviar, completar, revisar) están en `TaskWorkflow`, arriba de la pantalla.
 */
export function TaskSidebar(p: TaskSidebarProps) {
  const { task, project, me } = p;
  const writable = !p.readOnly && !project.archivedAt;
  const [editingPeople, setEditingPeople] = useState(false);
  const [picked, setPicked] = useState(task.collaborators);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const ratio = timeRatio(task.loggedSeconds, task.estimateMinutes);
  const helpers = task.collaborators.map((c) => p.nameOf(c) ?? t('common.exMember'));

  return (
    <aside aria-label={t('tasks.sidebar.label')} className="flex flex-col gap-4">
      <dl className="flex flex-col gap-3 text-sm">
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t('tasks.form.type')}</dt>
          <dd>
            <Badge>{TYPE_LABEL[task.type]}</Badge>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t('tasks.form.assignee')}</dt>
          <dd className="text-fg">{p.nameOf(task.assigneeId) ?? t('tasks.noAssignee')}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-fg-muted">{t('tasks.form.collaborators')}</dt>
          <dd className="flex flex-col gap-2 text-fg">
            {editingPeople ? (
              <>
                <div className="flex flex-col gap-1">
                  {p.people
                    .filter((o) => o.value !== task.assigneeId)
                    .map((o) => (
                      <label key={o.value} className="flex items-center gap-2">
                        <input type="checkbox" checked={picked.includes(o.value)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, o.value] : x.filter((v) => v !== o.value)))} />
                        {o.label}
                      </label>
                    ))}
                </div>
                {peopleError && (
                  <p role="alert" className="text-danger">
                    {peopleError}
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      void p.onCollaborators(picked).then(
                        () => setEditingPeople(false),
                        (cause: unknown) => setPeopleError(errorMessage(cause)),
                      )
                    }
                  >
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingPeople(false)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <span>{helpers.length ? helpers.join(', ') : t('tasks.panel.noHelpers')}</span>
                {writable && canManagePeople(project, task, me) && (
                  <span>
                    <Button size="sm" variant="ghost" onClick={() => setEditingPeople(true)}>
                      {t('tasks.panel.manageHelpers')}
                    </Button>
                  </span>
                )}
              </>
            )}
          </dd>
        </div>
        {task.dueDate && (
          <div className="flex flex-col gap-1">
            <dt className="text-fg-muted">{t('tasks.form.dueDate')}</dt>
            <dd className="text-fg">{formatDate(task.dueDate, { day: 'numeric', month: 'long', year: 'numeric' })}</dd>
          </div>
        )}
        {task.completedAt && (
          <div className="flex flex-col gap-1">
            <dt className="text-fg-muted">{t('tasks.sidebar.completedAt')}</dt>
            <dd className="text-fg">{formatDate(task.completedAt, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}</dd>
          </div>
        )}
      </dl>

      <div className="flex flex-col gap-2">
        <Heading level={3}>{t('tasks.sidebar.time')}</Heading>
        <p className="text-sm text-fg">
          {task.estimateMinutes
            ? t('tasks.timeOf', { logged: formatMinutes(task.loggedSeconds / 60), estimate: formatMinutes(task.estimateMinutes) })
            : t('tasks.panel.logged', { logged: formatMinutes(task.loggedSeconds / 60) })}
        </p>
        {ratio !== null && <ProgressBar value={ratio} label={t('tasks.panel.timeVsEstimate')} fill={ratio > 1 ? 'bg-cat-distraction' : 'bg-accent'} />}
        {writable && task.status !== 'done' && (
          <>
            <Button
              variant={p.timer.onThis ? 'primary' : 'secondary'}
              icon={p.timer.onThis ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              onClick={p.onTimer}
            >
              {p.timer.onThis ? t('tasks.panel.stopTimer') : p.timer.running ? t('tasks.panel.moveTimer') : t('tasks.panel.startTimer')}
            </Button>
            <p className="text-xs text-fg-muted">{t('tasks.panel.timerHint')}</p>
          </>
        )}
      </div>

    </aside>
  );
}
