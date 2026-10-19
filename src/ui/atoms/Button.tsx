import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Icono a la izquierda del texto */
  icon?: ReactNode;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-on-accent hover:bg-accent-hover',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-sunken',
  ghost: 'text-fg hover:bg-sunken',
  danger: 'bg-danger-soft text-danger hover:bg-sunken',
};

// Alto mínimo (no fijo): un texto largo en un espacio estrecho pasa a dos líneas en vez de salirse del botón.
const SIZE: Record<Size, string> = {
  md: 'min-h-control py-1.5 px-4 text-base',
  sm: 'min-h-control-sm py-1 px-3 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-full text-center leading-tight font-medium transition active:scale-98 disabled:active:scale-100 [&>svg]:shrink-0',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
