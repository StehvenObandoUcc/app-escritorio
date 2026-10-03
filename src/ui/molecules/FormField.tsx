import { useId } from 'react';
import { Input, type InputProps } from '@/ui/atoms';

export interface FormFieldProps extends Omit<InputProps, 'id'> {
  label: string;
  hint?: string;
  /** Mensaje de error: qué pasó y cómo arreglarlo */
  error?: string;
}

export function FormField({ label, hint, error, ...input }: FormFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const help = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <Input id={id} invalid={Boolean(error)} aria-describedby={help ? helpId : undefined} {...input} />
      {help && (
        <p id={helpId} className={error ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>
          {help}
        </p>
      )}
    </div>
  );
}
