import { t } from '@/i18n';
import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { Input, type InputProps } from '@/ui/atoms';

export interface PasswordFieldProps extends Omit<InputProps, 'id' | 'type'> {
  label: string;
  hint?: string;
  error?: string;
}

/** Campo de contraseña con botón para mostrarla u ocultarla (evita errores al escribirla). */
export function PasswordField({ label, hint, error, ...input }: PasswordFieldProps) {
  const id = useId();
  const helpId = `${id}-help`;
  const [visible, setVisible] = useState(false);
  const help = error ?? hint;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-fg">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          invalid={Boolean(error)}
          aria-describedby={help ? helpId : undefined}
          className="pr-10"
          {...input}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-fg-muted hover:text-fg"
        >
          {visible ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
        </button>
      </div>
      {help && (
        <p id={helpId} className={error ? 'text-sm text-danger' : 'text-sm text-fg-muted'}>
          {help}
        </p>
      )}
    </div>
  );
}
