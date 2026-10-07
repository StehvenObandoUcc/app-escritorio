import { TASK_STATUSES } from '@/cloud/contract';
import { STATUS_LABEL, type TaskFilter } from '@/lib/tasks';
import { Input, Select, type SelectOption } from '@/ui/atoms';

/** Filtros de la lista y el tablero (PT-05): responsable, estado, etiqueta y fecha límite, con el conteo. */
export function TaskFilters({
  filter,
  onChange,
  people,
  labels,
  count,
}: {
  filter: TaskFilter;
  onChange: (filter: TaskFilter) => void;
  /** Miembros del proyecto: id y nombre */
  people: SelectOption[];
  labels: string[];
  count: number;
}) {
  const set = <K extends keyof TaskFilter>(key: K, value: TaskFilter[K]) => onChange({ ...filter, [key]: value });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        size="sm"
        aria-label="Responsable"
        value={filter.assignee}
        onChange={(e) => set('assignee', e.target.value)}
        options={[
          { value: '', label: 'Todas las personas' },
          { value: 'me', label: 'Mis tareas' },
          { value: 'none', label: 'Sin responsable' },
          ...people,
        ]}
      />
      <Select
        size="sm"
        aria-label="Estado"
        value={filter.status}
        onChange={(e) => set('status', e.target.value as TaskFilter['status'])}
        options={[{ value: '', label: 'Todos los estados' }, ...TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
      />
      <Select
        size="sm"
        aria-label="Etiqueta"
        value={filter.label}
        onChange={(e) => set('label', e.target.value)}
        options={[{ value: '', label: 'Todas las etiquetas' }, ...labels.map((l) => ({ value: l, label: l }))]}
      />
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        Vence hasta
        <Input
          type="date"
          className="h-control-sm w-auto text-sm"
          value={filter.dueUntil}
          onChange={(e) => set('dueUntil', e.target.value)}
        />
      </label>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {count === 1 ? '1 tarea' : `${count} tareas`}
      </p>
    </div>
  );
}
