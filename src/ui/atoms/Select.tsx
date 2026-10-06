import type { SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  options: SelectOption[];
  size?: 'md' | 'sm';
}

/** Lista desplegable nativa: accesible con teclado y lector de pantalla sin código extra. */
export function Select({ options, size = 'md', className, ...rest }: SelectProps) {
  return (
    <select
      className={cx(
        'rounded-md border border-line-strong bg-surface px-2 text-fg',
        'disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' ? 'h-control text-base' : 'h-control-sm text-sm',
        className,
      )}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
