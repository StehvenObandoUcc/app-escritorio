import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Level = 1 | 2 | 3;

const STYLE: Record<Level, string> = {
  1: 'font-display text-2xl font-semibold tracking-tight',
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
