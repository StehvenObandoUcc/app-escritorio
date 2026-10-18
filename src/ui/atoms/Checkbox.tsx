import type { InputHTMLAttributes } from 'react';
import { cx } from '@/lib/cx';

/** Casilla: el mismo tamaño y el color de acento en toda la app (A-09). */
export function Checkbox({ className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input type="checkbox" className={cx('size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed', className)} {...rest} />;
}
