import { useState, type FormEvent } from 'react';
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

/** Registro manual de tiempo: día, inicio y fin. */
export function TimeEntryForm({ initial, submitLabel, onSubmit, onCancel, clearOnSuccess }: TimeEntryFormProps) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const change = (field: keyof TimeEntryValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [field]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.date || !values.start || !values.end) {
      setError('Completa el día, el inicio y el fin.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(values);
      if (clearOnSuccess) setValues((v) => ({ ...v, start: '', end: '' }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-40 flex-1">
          <FormField label="Día" type="date" value={values.date} onChange={change('date')} />
        </div>
        <div className="min-w-32 flex-1">
          <FormField label="Inicio" type="time" value={values.start} onChange={change('start')} />
        </div>
        <div className="min-w-32 flex-1">
          <FormField label="Fin" type="time" value={values.end} onChange={change('end')} />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </Button>
        )}
      </div>
    </form>
  );
}
