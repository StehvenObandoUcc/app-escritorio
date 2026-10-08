import { t } from '@/i18n';
import { EmptyState } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';

/** Página aún no construida. Dice en qué fase llega (docs/PLAN.md). */
export function PendingPage({ title, phase, what }: { title: string; phase: string; what: string }) {
  return (
    <PageLayout title={title}>
      <EmptyState title={t('app.comesIn', { phase })} description={what} />
    </PageLayout>
  );
}
