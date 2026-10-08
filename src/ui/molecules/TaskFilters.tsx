import { TASK_STATUSES, TASK_TYPES } from '@/cloud/contract';
import { t } from '@/i18n';
import { isFiltered, NO_FILTER, STATUS_LABEL, TYPE_LABEL, type TaskFilter } from '@/lib/tasks';
import { Button, Input, Select, type SelectOption } from '@/ui/atoms';

/** Filtros de la lista y el tablero (PT-05): responsable, estado, tipo, etiqueta y fecha límite, con el conteo. */
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
        aria-label={t('tasks.filters.assignee')}
        value={filter.assignee}
        onChange={(e) => set('assignee', e.target.value)}
        options={[
          { value: '', label: t('tasks.filters.everyone') },
          { value: 'me', label: t('tasks.filters.mine') },
          { value: 'none', label: t('tasks.noAssignee') },
          ...people,
        ]}
      />
      <Select
        size="sm"
        aria-label={t('tasks.filters.status')}
        value={filter.status}
        onChange={(e) => set('status', e.target.value as TaskFilter['status'])}
        options={[{ value: '', label: t('tasks.filters.allStatuses') }, ...TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
      />
      <Select
        size="sm"
        aria-label={t('tasks.filters.type')}
        value={filter.type}
        onChange={(e) => set('type', e.target.value as TaskFilter['type'])}
        options={[{ value: '', label: t('tasks.filters.allTypes') }, ...TASK_TYPES.map((k) => ({ value: k, label: TYPE_LABEL[k] }))]}
      />
      <Select
        size="sm"
        aria-label={t('tasks.filters.label')}
        value={filter.label}
        onChange={(e) => set('label', e.target.value)}
        options={[{ value: '', label: t('tasks.filters.allLabels') }, ...labels.map((l) => ({ value: l, label: l }))]}
      />
      <label className="flex items-center gap-2 text-sm text-fg-muted">
        {t('tasks.filters.dueUntil')}
        <Input type="date" className="h-control-sm w-auto text-sm" value={filter.dueUntil} onChange={(e) => set('dueUntil', e.target.value)} />
      </label>
      <p className="text-sm text-fg-muted" aria-live="polite">
        {t('tasks.count', { n: count })}
      </p>
      {isFiltered(filter) && (
        <Button size="sm" variant="ghost" onClick={() => onChange(NO_FILTER)}>
          {t('tasks.filters.clear')}
        </Button>
      )}
    </div>
  );
}
