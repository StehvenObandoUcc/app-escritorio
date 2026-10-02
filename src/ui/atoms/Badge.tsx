import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'neutral' | 'accent' | 'danger';

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-fg-muted',
  accent: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}
