import { ChevronDown } from 'lucide-react';
import type { SelectHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children' | 'size'> {
  options: SelectOption[];
  size?: 'md' | 'sm';
  invalid?: boolean;
}

/**
 * Lista desplegable. Sigue siendo el `<select>` nativo (flechas, letras para saltar, lector de pantalla sin
 * código extra), con flecha propia, más aire y los mismos estados que un campo de texto.
 */
export function Select({ options, size = 'md', invalid = false, className, ...rest }: SelectProps) {
  return (
    <span className={cx('relative inline-flex min-w-0', className)}>
      <select
        aria-invalid={invalid || undefined}
        className={cx(
          'w-full min-w-0 cursor-pointer appearance-none rounded-md border bg-surface pr-9 pl-3 text-fg transition-colors',
          'hover:border-fg-muted disabled:cursor-not-allowed disabled:opacity-50',
          invalid ? 'border-danger' : 'border-line-strong',
          size === 'md' ? 'h-control text-base' : 'h-control-sm text-sm',
        )}
        {...rest}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={size === 'md' ? 18 : 16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-fg-muted"
      />
    </span>
  );
}
