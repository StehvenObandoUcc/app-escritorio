import { arrowNav, NAV_ITEM } from '@/lib/keyboard';
import { useSession } from '@/app/session';
import type { Task } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { myWork } from '@/lib/tasks';
import { localDate } from '@/lib/time';
import { Badge, Heading, Surface } from '@/ui/atoms';
import { EmptyState, TaskMeta } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';
import { noTeamState, OfflineNote } from '../proyectos/ProyectosPage';
import { useWork } from '../proyectos/useWork';

/** *Mis tareas* (ADR-0014): donde soy responsable o apoyo, en todos los proyectos, y lo que me toca revisar. */
export function MisTareasPage() {
  const { cloud, bridge, user, activeTeam, sync } = useSession();
  const data = useWork(cloud, bridge, activeTeam?.id ?? null, sync.lastSyncedAt);
  if (!user) return null;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;
  const blocked = noTeamState(activeTeam?.role ?? null);
  if (blocked || data.isError) {
    return (
      <PageLayout title={t('myTasks.title')} actions={sampleTag}>
        <EmptyState
          title={blocked?.title ?? t('projects.loadError')}
          description={blocked?.description ?? t('projects.loadErrorHint', { error: errorMessage(data.error) })}
        />
      </PageLayout>
    );
  }
  if (!data.data) {
    return (
      <PageLayout title={t('myTasks.title')} actions={sampleTag}>
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      </PageLayout>
    );
  }
  const { work, offline } = data.data;
  const { mine, toReview } = myWork(work, user.id);
  const projectName = new Map(work.projects.map((p) => [p.id, p.name]));
  const names = new Map(Object.values(work.members).flat().map((m) => [m.userId, m.displayName ?? t('common.noName')]));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? t('common.exMember')) : null);
  const today = localDate();

  const list = (tasks: Task[], label: string) => (
    <ul aria-label={label} onKeyDown={arrowNav} className="flex flex-col divide-y divide-line">
      {tasks.map((x) => (
        <li key={x.id} className="flex flex-col gap-1 py-3">
          <a href={`#/proyectos/${x.projectId}/tareas/${x.id}`} {...{ [NAV_ITEM]: '' }} className="truncate rounded-xs font-medium text-fg hover:underline">
            {x.title}
          </a>
          <p className="text-sm text-fg-muted">{projectName.get(x.projectId)}</p>
          <TaskMeta task={x} assigneeName={nameOf(x.assigneeId)} today={today} />
        </li>
      ))}
    </ul>
  );

  return (
    <PageLayout title={t('myTasks.title')} subtitle={activeTeam!.name} actions={sampleTag}>
      {offline && <OfflineNote savedAt={work.savedAt} />}
      {toReview.length > 0 && (
        <Surface as="section" aria-label={t('myTasks.toReview')} className="flex flex-col gap-2">
          <Heading level={2}>{t('myTasks.toReviewCount', { n: toReview.length })}</Heading>
          {list(toReview, t('myTasks.toReview'))}
        </Surface>
      )}
      <Surface as="section" aria-label={t('myTasks.mine')} className="flex flex-col gap-2">
        <Heading level={2}>{t('myTasks.mineCount', { n: mine.length })}</Heading>
        {mine.length === 0 ? <p className="text-fg-muted">{t('myTasks.empty')}</p> : list(mine, t('myTasks.mine'))}
      </Surface>
    </PageLayout>
  );
}
