import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Level = 1 | 2 | 3;

const STYLE: Record<Level, string> = {
  // En compacto un paso menos: un título de tarea largo ocupaba cuatro líneas de 28 px. Balance reparte las líneas.
  1: 'font-display text-xl font-semibold tracking-tight text-balance break-words md:text-2xl',
  2: 'text-lg font-semibold',
  3: 'text-base font-semibold',
};

export function Heading({
  level,
  children,
  className,
}: {
  level: Level;
  children: ReactNode;
  className?: string;
}) {
  const Tag = `h${level}` as const;
  return <Tag className={cx('text-fg', STYLE[level], className)}>{children}</Tag>;
}
