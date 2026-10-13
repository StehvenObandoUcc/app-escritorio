import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';

type Tone = 'neutral' | 'accent' | 'danger' | 'success';

const TONE: Record<Tone, string> = {
  neutral: 'bg-sunken text-fg-muted',
  accent: 'bg-accent-soft text-accent-text',
  danger: 'bg-danger-soft text-danger',
  /** «Bien / en marcha»: usa el color de la categoría productiva, que ya tiene versión clara y oscura. */
  success: 'bg-sunken text-cat-productive',
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
