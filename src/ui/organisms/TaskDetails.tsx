import { evidenceLabel } from '@/lib/evidence';
import { CheckCircle2, Circle, Plus } from 'lucide-react';
import { useState } from 'react';
import type { Task } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { fieldErrors, forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { STATUS_LABEL } from '@/lib/tasks';
import { Badge, Button, Heading } from '@/ui/atoms';

/**
 * Columna principal de la tarea (D-16): descripción, etiquetas, criterios de aceptación y subtareas.
 * Las subtareas se crean con el mismo formulario que una tarea (C6): «Añadir subtarea» llama a `onAddSubtask`.
 */
export function TaskDetails({
  task,
  subtasks,
  isSubtask,
  canEditCriteria,
  canAddSubtask,
  nameOf,
  onCriteria,
  onAddSubtask,
  onOpenTask,
}: {
  task: Task;
  subtasks: Task[];
  isSubtask: boolean;
  canEditCriteria: boolean;
  canAddSubtask: boolean;
  nameOf: (userId: string | null) => string | null;
  onCriteria: (texts: string[]) => Promise<void>;
  onAddSubtask: () => void;
  onOpenTask: (taskId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.criteria.map((c) => c.text).join('\n'));
  const [error, setError] = useState<string | null>(null);
  const done = subtasks.filter((s) => s.status === 'done').length;

  const saveCriteria = async () => {
    const result = fieldErrors(forms.task().pick({ criteria: true }), { criteria: text });
    if (result.errors) return setError(result.errors.criteria ?? null);
    try {
      await onCriteria(result.data.criteria);
      setEditing(false);
      setError(null);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <section aria-label={t('tasks.form.description')} className="flex flex-col gap-2">
        {task.description ? <p className="whitespace-pre-line text-fg">{task.description}</p> : <p className="text-fg-muted">{t('tasks.details.noDescription')}</p>}
        {task.labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {task.labels.map((l) => (
              <Badge key={l}>{l}</Badge>
            ))}
          </div>
        )}
      </section>

      <section aria-label={t('evidence.title')} className="flex flex-col gap-2">
        <Heading level={2}>{t('evidence.title')}</Heading>
        {task.evidence.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('evidence.none')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {task.evidence.map((key) => (
              <Badge key={key} tone="accent">
                {evidenceLabel(key)}
              </Badge>
            ))}
          </div>
        )}
      </section>

      <section aria-label={t('tasks.panel.criteria')} className="flex flex-col gap-2">
        <Heading level={2}>{t('tasks.panel.criteria')}</Heading>
        {editing ? (
          <>
            <textarea
              aria-label={t('tasks.form.criteria')}
              rows={5}
              autoFocus
              value={text}
              aria-invalid={Boolean(error) || undefined}
              maxLength={LIMITS.criteria.count * (LIMITS.criteria.length + 1)}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false);
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void saveCriteria();
              }}
              className={`w-full rounded-md border bg-surface px-3 py-2 text-base text-fg ${error ? 'border-danger' : 'border-line-strong'}`}
            />
            <p className={error ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>{error ?? t('tasks.form.criteriaHint')}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="primary" onClick={() => void saveCriteria()}>
                {t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <>
            {task.criteria.length === 0 ? (
              <p className="text-sm text-fg-muted">{t('tasks.panel.noCriteria')}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {task.criteria.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 text-sm text-fg">
                    {c.met ? (
                      <CheckCircle2 size={16} className="shrink-0 text-accent-text" aria-label={t('tasks.panel.met')} />
                    ) : (
                      <Circle size={16} className="shrink-0 text-fg-muted" aria-label={t('tasks.panel.notMet')} />
                    )}
                    {c.text}
                  </li>
                ))}
              </ul>
            )}
            {canEditCriteria && (
              <div>
                <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                  {t('tasks.panel.editCriteria')}
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {!isSubtask && (
        <section aria-label={t('tasks.panel.subtasks')} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Heading level={2}>{subtasks.length ? t('tasks.panel.subtasksCount', { done, n: subtasks.length }) : t('tasks.panel.subtasks')}</Heading>
            {canAddSubtask && (
              <Button size="sm" icon={<Plus size={16} aria-hidden="true" />} onClick={onAddSubtask}>
                {t('tasks.panel.addSubtask')}
              </Button>
            )}
          </div>
          {subtasks.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('tasks.details.noSubtasks')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {subtasks.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => onOpenTask(s.id)}
                    className={`min-w-0 flex-1 truncate rounded-xs text-left hover:underline ${s.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'}`}
                  >
                    {s.title}
                  </button>
                  <Badge tone={s.status === 'done' ? 'accent' : 'neutral'}>{STATUS_LABEL[s.status]}</Badge>
                  <span className="text-fg-muted">{nameOf(s.assigneeId) ?? t('tasks.noAssignee')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
