import type { ReactNode } from 'react';
import { Heading } from '@/ui/atoms';

/** Pantalla o sección vacía: dice qué falta y qué hacer, sin adornos. */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong p-6">
      <Heading level={2}>{title}</Heading>
      <p className="max-w-prose text-fg-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
