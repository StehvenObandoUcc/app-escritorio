import { useId, useState, type FormEvent } from 'react';
import { TASK_STATUSES, type TaskInput } from '@/cloud/contract';
import { STATUS_LABEL } from '@/lib/tasks';
import { Button, Select, type SelectOption } from '@/ui/atoms';
import { FormField } from './FormField';

export const EMPTY_TASK: TaskInput = {
  title: '',
  description: '',
  assigneeId: null,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
};

/** Crear o editar una tarea (PT-03): todos los campos. `people` limita a quién se puede asignar. */
export function TaskForm({
  initial = EMPTY_TASK,
  people,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TaskInput;
  /** Responsables posibles (miembros del proyecto, o solo tú si eres colaborador). */
  people: SelectOption[];
  submitLabel: string;
  /** Si rechaza, el mensaje del error se muestra en el formulario. */
  onSubmit: (input: TaskInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [description, setDescription] = useState(initial.description);
  const [assignee, setAssignee] = useState(initial.assigneeId ?? '');
  const [status, setStatus] = useState(initial.status);
  const [due, setDue] = useState(initial.dueDate ?? '');
  const [labels, setLabels] = useState(initial.labels.join(', '));
  const [estimate, setEstimate] = useState(initial.estimateMinutes?.toString() ?? '');
  const descriptionId = useId();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const minutes = estimate.trim() === '' ? null : Number(estimate);
    if (!title.trim()) return setError('Escribe un título para la tarea.');
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 100_000)) {
      return setError('La estimación debe ser un número entero de minutos entre 1 y 100 000.');
    }
    const tags = labels.split(',').map((l) => l.trim()).filter(Boolean);
    if (tags.length > 10 || tags.some((l) => l.length > 30)) return setError('Usa hasta 10 etiquetas de máximo 30 caracteres.');
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        assigneeId: assignee || null,
        status,
        dueDate: due || null,
        labels: tags,
        estimateMinutes: minutes,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <FormField label="Título" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
      <div className="flex flex-col gap-1">
        <label htmlFor={descriptionId} className="text-sm font-medium text-fg">
          Descripción
        </label>
        <textarea
          id={descriptionId}
          rows={3}
          maxLength={5000}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          Responsable
          <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: '', label: 'Sin responsable' }, ...people]} />
        </label>
        <label className="flex min-w-32 flex-1 flex-col gap-1 text-sm font-medium text-fg">
          Estado
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskInput['status'])}
            options={TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <FormField label="Fecha límite" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </div>
        <div className="min-w-32 flex-1">
          <FormField
            label="Estimación (minutos)"
            type="number"
            inputMode="numeric"
            min={1}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </div>
      </div>
      <FormField label="Etiquetas" hint="Separadas por comas, por ejemplo: diseño, cliente" value={labels} onChange={(e) => setLabels(e.target.value)} />
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
          Cancelar
        </Button>
      </div>
    </form>
  );
}
