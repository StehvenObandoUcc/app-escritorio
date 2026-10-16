import { t } from '@/i18n';
import { useState, type FormEvent } from 'react';
import { forms } from '@/lib/forms';
import { useForm } from '@/lib/useForm';
import { Button } from '@/ui/atoms';
import { FormField } from './FormField';

/** Día y horas en hora local: "2026-10-01", "09:30". */
export interface TimeEntryValues {
  date: string;
  start: string;
  end: string;
}

export interface TimeEntryFormProps {
  initial: TimeEntryValues;
  submitLabel: string;
  /** Si rechaza, el mensaje del error se muestra en el formulario. */
  onSubmit: (values: TimeEntryValues) => Promise<void>;
  onCancel?: () => void;
  /** Vacía las horas tras guardar (para registrar varias entradas seguidas). */
  clearOnSuccess?: boolean;
}

/** Registro manual de tiempo: día, inicio y fin. Validación por campo y teclado (AC-42, AC-43). */
export function TimeEntryForm({ initial, submitLabel, onSubmit, onCancel, clearOnSuccess }: TimeEntryFormProps) {
  const [values, setValues] = useState(initial);
  const { ref, errors, formError, busy, submit: send, onKeyDown } = useForm(forms.timeEntry, onCancel);

  const change = (field: keyof TimeEntryValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = (e: FormEvent) =>
    void send(
      values,
      async () => {
        await onSubmit(values);
        if (clearOnSuccess) setValues((v) => ({ ...v, start: '', end: '' }));
      },
      e,
    );

  return (
    <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <FormField name="date" label={t('entries.day')} type="date" value={values.date} error={errors.date} onChange={change('date')} />
        </div>
        <div className="min-w-32 flex-1">
          <FormField name="start" label={t('entries.start')} type="time" value={values.start} error={errors.start} onChange={change('start')} />
        </div>
        <div className="min-w-32 flex-1">
          <FormField name="end" label={t('entries.end')} type="time" value={values.end} error={errors.end} onChange={change('end')} />
        </div>
      </div>
      {formError && (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </form>
  );
}
