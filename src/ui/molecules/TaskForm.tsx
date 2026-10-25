import { useEffect, useId, useRef, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { TASK_TYPES, type NewTaskExtras, type TaskInput } from '@/cloud/contract';
import { t } from '@/i18n';
import { EVIDENCE_KEYS, evidenceLabel } from '@/lib/evidence';
import { forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { TYPE_LABEL } from '@/lib/tasks';
import { useForm } from '@/lib/useForm';
import { Button, Checkbox, Select, Textarea, type SelectOption } from '@/ui/atoms';
import { EstimateInput } from './EstimateInput';
import { DiscardDialog } from './DiscardDialog';
import { FormField } from './FormField';

/** Campos que viven en «Más detalles»: si el primer error está en uno, la sección se abre. */
const MORE_FIELDS = ['description', 'labels', 'criteria'];

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
  evidence: [],
};

/**
 * Crear o editar una tarea o una subtarea (PT-03, ADR-0014): el mismo formulario para las dos (C6).
 * `people`: a quién se puede asignar. `manage`: muestra apoyos, criterios y el permiso del responsable.
 * El estado no se elige aquí: avanza con los pasos del flujo de la tarea (AC-45 v4).
 * Validación por campo (AC-42); Enter avanza, Ctrl+Enter guarda desde un área de texto y Esc cancela (AC-43).
 * A la vista solo lo que casi siempre se toca (título, responsable, fecha, estimación); el resto en «Más
 * detalles», plegado al crear y abierto al editar. Si el primer error está ahí, se abre y lo enfoca.
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
  const { ref, errors: err, formError, busy, submit, onKeyDown, cancel, discard } = useForm(forms.task, onCancel);
  const set = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => setV((prev) => ({ ...prev, [key]: value }));
  const moreId = useId();
  const more = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(!isNew);
  const firstError = Object.keys(err)[0];
  const errorInMore = firstError !== undefined && MORE_FIELDS.includes(firstError);
  const showMore = moreOpen || errorInMore;

  // useForm enfoca el primer error antes de que «Más detalles» se abra: si está ahí, se enfoca al mostrarse.
  useEffect(() => {
    if (errorInMore) more.current?.querySelector<HTMLElement>(`[name="${firstError}"]`)?.focus();
  }, [errorInMore, firstError, err]);

  return (
    <>
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
      {/* F-17: el asterisco se explica; `required` también hace que Enter no pase por los campos opcionales (F-14). */}
      <p className="text-sm text-fg-muted">{t('forms.requiredLegend')}</p>
      <FormField
        name="title"
        required
        label={`${t('tasks.form.title')} *`}
        value={v.title}
        maxLength={LIMITS.taskTitle.max}
        error={err.title}
        autoFocus
        onChange={(e) => set('title', e.target.value)}
      />
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {t('tasks.form.assignee')}
        <Select name="assigneeId" value={v.assigneeId ?? ''} onChange={(e) => set('assigneeId', e.target.value || null)} options={[{ value: '', label: t('tasks.noAssignee') }, ...people]} />
      </label>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <FormField name="dueDate" label={t('tasks.form.dueDate')} type="date" value={v.dueDate ?? ''} onChange={(e) => set('dueDate', e.target.value || null)} />
        </div>
        <div className="min-w-48 flex-1">
          <EstimateInput minutes={v.estimateMinutes} error={err.estimateMinutes} onChange={(m) => set('estimateMinutes', m)} />
        </div>
      </div>
      <div>
        {/* Misma forma que el resumen de «Evidencia requerida», debajo: dos secciones plegables iguales. */}
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls={moreId}
          onClick={() => setMoreOpen(!showMore)}
          className="flex cursor-pointer items-center gap-1 rounded-xs text-sm font-medium text-fg"
        >
          <ChevronRight size={14} aria-hidden="true" className={showMore ? 'rotate-90 transition-transform' : 'transition-transform'} />
          {t('tasks.form.more')}
        </button>
        <div ref={more} id={moreId} hidden={!showMore} className="mt-3 flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium text-fg">
            {t('tasks.form.type')}
            <Select name="type" value={v.type} onChange={(e) => set('type', e.target.value as TaskInput['type'])} options={TASK_TYPES.map((k) => ({ value: k, label: TYPE_LABEL[k] }))} />
          </label>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-description`} className="text-sm font-medium text-fg">
              {t('tasks.form.description')}
            </label>
            <Textarea
              id={`${id}-description`}
              name="description"
              rows={4}
              maxLength={LIMITS.taskDescription.max}
              value={v.description}
              invalid={Boolean(err.description)}
              aria-describedby={err.description ? `${id}-description-help` : undefined}
              onChange={(e) => set('description', e.target.value)}
            />
            {err.description && (
              <p id={`${id}-description-help`} className="text-sm text-danger">
                {err.description}
              </p>
            )}
          </div>
          {manage && (
            <label className="flex items-center gap-2 text-sm text-fg">
              <Checkbox name="assigneeCanManage" checked={v.assigneeCanManage} onChange={(e) => set('assigneeCanManage', e.target.checked)} />
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
                      <Checkbox
                        checked={collaborators.includes(p.value)}
                        onChange={(e) => setCollaborators((c) => (e.target.checked ? [...c, p.value] : c.filter((x) => x !== p.value)))}
                      />
                      {p.label}
                    </label>
                  ))}
              </div>
            </fieldset>
          )}
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
              <Textarea
                id={`${id}-criteria`}
                name="criteria"
                rows={3}
                value={criteria}
                invalid={Boolean(err.criteria)}
                aria-describedby={`${id}-criteria-help`}
                onChange={(e) => setCriteria(e.target.value)}
              />
              <p id={`${id}-criteria-help`} className={err.criteria ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>
                {err.criteria ?? t('tasks.form.criteriaHint')}
              </p>
            </div>
          )}
        </div>
      </div>
      {(manage || isNew) && (
        // Plegada por defecto (F-17): casi nunca se usa al crear una tarea simple; el contador dice cuántas hay.
        <details className="group">
          {/* `flex` quita el triángulo nativo; el chevron gira al abrirse, como «Más detalles». */}
          <summary className="flex cursor-pointer items-center gap-1 rounded-xs text-sm font-medium text-fg">
            <ChevronRight size={14} aria-hidden="true" className="transition-transform group-open:rotate-90" />
            {t('evidence.title')} <span className="font-normal text-fg-muted">({t('evidence.selected', { n: v.evidence.length })})</span>
          </summary>
          <fieldset className="mt-2 flex flex-col gap-2">
            <legend className="sr-only">{t('evidence.title')}</legend>
            <p className="text-sm text-fg-muted">{t('evidence.hint')}</p>
            <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
              {EVIDENCE_KEYS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-fg">
                  <Checkbox
                    name={`evidence-${key}`}
                    checked={v.evidence.includes(key)}
                    onChange={(e) => set('evidence', e.target.checked ? [...v.evidence, key] : v.evidence.filter((x) => x !== key))}
                  />
                  {evidenceLabel(key)}
                </label>
              ))}
            </div>
          </fieldset>
        </details>
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
        <Button variant="ghost" onClick={cancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <span className="text-xs text-fg-muted">{t('forms.keysHint')}</span>
      </div>
    </form>
    <DiscardDialog discard={discard} />
    </>
  );
}
