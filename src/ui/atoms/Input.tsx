import type { InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid = false, className, ...rest }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cx(
        'h-control w-full rounded-md border bg-surface px-3 text-base text-fg placeholder:text-fg-muted',
        'disabled:cursor-not-allowed disabled:opacity-50',
        invalid ? 'border-danger' : 'border-line-strong',
        className,
      )}
      {...rest}
    />
  );
}
