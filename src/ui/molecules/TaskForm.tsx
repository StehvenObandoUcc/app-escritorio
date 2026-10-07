import { useId, useState, type FormEvent } from 'react';
import { TASK_TYPES, type NewTaskExtras, type TaskInput } from '@/cloud/contract';
import { t } from '@/i18n';
import { STATUS_LABEL, TYPE_LABEL } from '@/lib/tasks';
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

/**
 * Crear o editar una tarea (PT-03, ADR-0014). `people`: a quién se puede asignar (todo el equipo salvo
 * observadores si gestionas; solo tú si eres colaborador). `manage`: muestra apoyos, criterios y el permiso
 * del responsable. Al editar, los apoyos y criterios se cambian desde el panel de la tarea.
 */
export function TaskForm({
  initial = EMPTY_TASK,
  people,
  manage,
  isNew,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TaskInput;
  people: SelectOption[];
  manage: boolean;
  isNew: boolean;
  submitLabel: string;
  /** Si rechaza, el mensaje del error se muestra en el formulario. */
  onSubmit: (input: TaskInput, extras: NewTaskExtras) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [v, setV] = useState(initial);
  const [labels, setLabels] = useState(initial.labels.join(', '));
  const [criteria, setCriteria] = useState('');
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setV((prev) => ({ ...prev, [key]: value }));
  // Una tarea en revisión o hecha conserva su estado: a esos estados se llega con la revisión.
  const statuses = v.status === 'review' || v.status === 'done' ? [v.status, 'todo', 'doing'] : ['todo', 'doing'];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!v.title.trim()) return setError(t('tasks.form.errorTitle'));
    if (v.estimateMinutes !== null && !(v.estimateMinutes >= 1 && v.estimateMinutes <= 100_000)) return setError(t('tasks.form.errorEstimate'));
    const tags = labels.split(',').map((l) => l.trim()).filter(Boolean);
    if (tags.length > 10 || tags.some((l) => l.length > 30)) return setError(t('tasks.form.errorLabels'));
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        { ...v, title: v.title.trim(), description: v.description.trim(), labels: tags },
        { criteria: criteria.split('\n').map((c) => c.trim()).filter(Boolean), collaborators },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-48 grow-2 basis-0">
          <FormField label={t('tasks.form.title')} value={v.title} maxLength={200} onChange={(e) => set('title', e.target.value)} />
        </div>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          {t('tasks.form.type')}
          <Select value={v.type} onChange={(e) => set('type', e.target.value as TaskInput['type'])} options={TASK_TYPES.map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-description`} className="text-sm font-medium text-fg">
          {t('tasks.form.description')}
        </label>
        <textarea
          id={`${id}-description`}
          rows={3}
          maxLength={5000}
          value={v.description}
          onChange={(e) => set('description', e.target.value)}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          {t('tasks.form.assignee')}
          <Select
            value={v.assigneeId ?? ''}
            onChange={(e) => set('assigneeId', e.target.value || null)}
            options={[{ value: '', label: t('tasks.noAssignee') }, ...people]}
          />
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          {t('tasks.form.status')}
          <Select
            value={v.status}
            onChange={(e) => set('status', e.target.value as TaskInput['status'])}
            options={statuses.map((s) => ({ value: s, label: STATUS_LABEL[s as TaskInput['status']] }))}
          />
        </label>
      </div>
      {manage && (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" checked={v.assigneeCanManage} onChange={(e) => set('assigneeCanManage', e.target.checked)} />
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
          <FormField label={t('tasks.form.dueDate')} type="date" value={v.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
        </div>
        <div className="min-w-48 flex-1">
          <EstimateInput minutes={v.estimateMinutes} onChange={(m) => set('estimateMinutes', m)} />
        </div>
      </div>
      <FormField label={t('tasks.form.labels')} hint={t('tasks.form.labelsHint')} value={labels} onChange={(e) => setLabels(e.target.value)} />
      {manage && isNew && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-criteria`} className="text-sm font-medium text-fg">
            {t('tasks.form.criteria')}
          </label>
          <textarea
            id={`${id}-criteria`}
            rows={3}
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
          />
          <p className="text-sm text-fg-muted">{t('tasks.form.criteriaHint')}</p>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
