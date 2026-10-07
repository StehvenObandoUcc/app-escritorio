import { useState } from 'react';
import { t } from '@/i18n';
import { bestUnit, ESTIMATE_UNITS, toMinutes, type EstimateUnit } from '@/lib/tasks';
import { Input, Select } from '@/ui/atoms';

/**
 * Estimación con unidad (AC-30): minutos, horas, días de 8 h o semanas de 5 días. Siempre devuelve minutos
 * (o null si está vacía). Un valor no válido devuelve NaN para que el formulario lo explique.
 */
export function EstimateInput({ minutes, onChange }: { minutes: number | null; onChange: (minutes: number | null) => void }) {
  const initial = minutes ? bestUnit(minutes) : { value: 0, unit: 'h' as EstimateUnit };
  const [text, setText] = useState(minutes ? String(initial.value) : '');
  const [unit, setUnit] = useState<EstimateUnit>(initial.unit);
  const emit = (value: string, u: EstimateUnit) => {
    const n = Number(value.replace(',', '.'));
    onChange(value.trim() === '' ? null : n > 0 && Number.isFinite(n) ? toMinutes(n, u) : Number.NaN);
  };
  return (
    <fieldset className="flex min-w-0 flex-col gap-1">
      <legend className="mb-1 text-sm font-medium text-fg">{t('tasks.form.estimate')}</legend>
      <div className="flex gap-2">
        <Input
          aria-label={t('tasks.form.estimateValue')}
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            emit(e.target.value, unit);
          }}
        />
        <Select
          aria-label={t('tasks.form.estimateUnit')}
          value={unit}
          onChange={(e) => {
            const u = e.target.value as EstimateUnit;
            setUnit(u);
            emit(text, u);
          }}
          options={ESTIMATE_UNITS.map((u) => ({ value: u, label: t(`tasks.units.${u}`) }))}
        />
      </div>
      <p className="text-sm text-fg-muted">{t('tasks.form.estimateHint')}</p>
    </fieldset>
  );
}
