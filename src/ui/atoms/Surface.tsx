import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface SurfaceProps extends HTMLAttributes<HTMLElement> {
  as?: 'div' | 'section' | 'article' | 'aside';
  /** "flush" = sin relleno (para listas y tablas que llegan al borde) */
  padding?: 'md' | 'flush';
  children: ReactNode;
}

/** Contenedor base: fondo de superficie + borde. Sin sombra: la jerarquía la da el borde. */
export function Surface({ as: Tag = 'div', padding = 'md', className, children, ...rest }: SurfaceProps) {
  return (
    <Tag
      className={cx(
        'rounded-lg border border-line bg-surface',
        padding === 'md' && 'p-4 md:p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
