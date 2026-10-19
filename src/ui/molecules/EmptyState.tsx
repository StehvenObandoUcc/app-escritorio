import type { ReactNode } from 'react';
import { t } from '@/i18n';
import { Button, Heading } from '@/ui/atoms';

/** Pantalla o sección vacía: dice qué falta y qué hacer, sin adornos. */
export function EmptyState({
  title,
  description,
  action,
  onRetry,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  /** Variante de error: muestra «Reintentar», que vuelve a pedir los datos (H9). */
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-lg border border-dashed border-line-strong p-6">
      <Heading level={2}>{title}</Heading>
      <p className="max-w-prose text-fg-muted">{description}</p>
      {(action || onRetry) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {onRetry && <Button onClick={onRetry}>{t('common.retry')}</Button>}
          {action}
        </div>
      )}
    </div>
  );
}
