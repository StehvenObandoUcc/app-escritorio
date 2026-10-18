import type { TextareaHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  /** Letra monoespaciada y pequeña (p. ej. para pegar JSON). */
  mono?: boolean;
}

/** Área de texto con los mismos estados que `Input`. El error se asocia desde fuera con `aria-describedby`. */
export function Textarea({ invalid = false, mono = false, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cx(
        'w-full rounded-md border bg-surface px-3 py-2 text-fg placeholder:text-fg-muted',
        'disabled:cursor-not-allowed disabled:opacity-50',
        mono ? 'font-mono text-sm' : 'text-base',
        invalid ? 'border-danger' : 'border-line-strong',
        className,
      )}
      {...rest}
    />
  );
}
