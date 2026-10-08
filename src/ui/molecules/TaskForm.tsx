import { useId, useState } from 'react';
import { TASK_TYPES, type NewTaskExtras, type TaskInput } from '@/cloud/contract';
import { t } from '@/i18n';
import { forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { TYPE_LABEL } from '@/lib/tasks';
import { useForm } from '@/lib/useForm';
import { Button, Select, type SelectOption } from '@/ui/atoms';
import { EstimateInput } from './EstimateInput';
import { FormField } from './FormField';

export const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  type: 'task',
  assigneeId: null,
  assigneeCanManage: false,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
};

const textarea = 'w-full rounded-md border bg-surface px-3 py-2 text-base text-fg';

/**
 * Crear o editar una tarea o una subtarea (PT-03, ADR-0014): el mismo formulario para las dos (C6).
 * `people`: a quién se puede asignar. `manage`: muestra apoyos, criterios y el permiso del responsable.
 * El estado no se elige aquí: avanza con los pasos del flujo de la tarea (AC-45 v4).
 * Validación por campo (AC-42); Enter avanza, Ctrl+Enter guarda desde un área de texto y Esc cancela (AC-43).
 */
export function TaskForm({
  initial = EMPTY_TASK,
  people,
  manage,
  isNew,
  parentTitle,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TaskInput;
  people: SelectOption[];
  manage: boolean;
  isNew: boolean;
  /** Si es una subtarea, el título de su madre. */
  parentTitle?: string | null;
  submitLabel: string;
  onSubmit: (input: TaskInput, extras: NewTaskExtras) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [labels, setLabels] = useState(initial.labels.join(', '));
  const [criteria, setCriteria] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const { ref, errors: err, formError, busy, submit, onKeyDown } = useForm(forms.task, onCancel);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setV((prev) => ({ ...prev, [key]: value }));

  return (
    <form
      ref={ref}
      onKeyDown={onKeyDown}
      onSubmit={(e) =>
        void submit(
          { title: v.title, description: v.description, labels, estimateMinutes: v.estimateMinutes, criteria },
          (data) =>
            onSubmit(
              { ...v, title: data.title, description: data.description.trim(), labels: data.labels, estimateMinutes: data.estimateMinutes },
              { criteria: data.criteria, collaborators },
            ),
          e,
        )
      }
      className="flex flex-col gap-4"
      noValidate
    >
      {parentTitle && <p className="text-sm text-fg-muted">{t('tasks.subtaskOf', { title: parentTitle })}</p>}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-48 grow-2 basis-0">
          <FormField
            name="title"
            label={`${t('tasks.form.title')} *`}
            value={v.title}
            maxLength={LIMITS.taskTitle.max}
            error={err.title}
            autoFocus
            onChange={(e) => set('title', e.target.value)}
          />
        </div>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          {t('tasks.form.type')}
          <Select name="type" value={v.type} onChange={(e) => set('type', e.target.value as TaskInput['type'])} options={TASK_TYPES.map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-sm font-medium text-fg">
          {t('tasks.form.description')}
        </label>
        <textarea
          id={`${id}-description`}
          name="description"
          rows={4}
          maxLength={LIMITS.taskDescription.max}
          value={v.description}
          aria-invalid={Boolean(err.description) || undefined}
          onChange={(e) => set('description', e.target.value)}
          className={`${textarea} ${err.description ? 'border-danger' : 'border-line-strong'}`}
        />
        {err.description && <p className="text-sm text-danger">{err.description}</p>}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          {t('tasks.form.assignee')}
          <Select name="assigneeId" value={v.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value || null)} options={[{ value: '', label: t('tasks.noAssignee') }, ...people]} />
        </label>
      </div>
      {manage && (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" name="assigneeCanManage" checked={v.assigneeCanManage} onChange={(e) => set('assigneeCanManage', e.target.checked)} />
          {t('tasks.form.assigneeCanManage')}
        </label>
      )}
      {manage && isNew && people.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-fg">{t('tasks.form.collaborators')}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {people
              .filter((p) => p.value !== v.assigneeId)
              .map((p) => (
                <label key={p.value} className="flex items-center gap-2 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={collaborators.includes(p.value)}
                    onChange={(e) => setCollaborators((c) => (e.target.checked ? [...c, p.value] : c.filter((x) => x !== p.value)))}
                  />
                  {p.label}
                </label>
              ))}
          </div>
        </fieldset>
      )}
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <FormField name="dueDate" label={t('tasks.form.dueDate')} type="date" value={v.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
        </div>
        <div className="min-w-48 flex-1">
          <EstimateInput minutes={v.estimateMinutes} error={err.estimateMinutes} onChange={(m) => set('estimateMinutes', m)} />
        </div>
      </div>
      <FormField
        name="labels"
        label={t('tasks.form.labels')}
        hint={t('tasks.form.labelsHint')}
        error={err.labels}
        value={labels}
        onChange={(e) => setLabels(e.target.value)}
      />
      {manage && isNew && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-criteria`} className="text-sm font-medium text-fg">
            {t('tasks.form.criteria')}
          </label>
          <textarea
            id={`${id}-criteria`}
            name="criteria"
            rows={3}
            value={criteria}
            aria-invalid={Boolean(err.criteria) || undefined}
            onChange={(e) => setCriteria(e.target.value)}
            className={`${textarea} ${err.criteria ? 'border-danger' : 'border-line-strong'}`}
          />
          <p className={err.criteria ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>{err.criteria ?? t('tasks.form.criteriaHint')}</p>
        </div>
      )}
      {formError && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {submitLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <span className="text-xs text-fg-muted">{t('forms.keysHint')}</span>
      </div>
    </form>
  );
}
