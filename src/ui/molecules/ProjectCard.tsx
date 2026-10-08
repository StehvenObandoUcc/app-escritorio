import { NAV_ITEM } from '@/lib/keyboard';
import type { Project } from '@/cloud/contract';
import { t } from '@/i18n';
import { doneRatio, PROJECT_ROLE_LABEL } from '@/lib/tasks';
import { Badge, ProgressBar } from '@/ui/atoms';

/** Tarjeta de un proyecto en *Proyectos*: avance, revisiones pendientes y vencidas. Es un enlace al proyecto. */
export function ProjectCard({ project, overdue, href }: { project: Project; overdue: number; href: string }) {
  const done = t('projects.progress.done', { done: project.tasksDone, n: project.tasksTotal });
  return (
    <a href={href} {...{ [NAV_ITEM]: '' }} className="flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface p-4 transition-colors hover:border-line-strong">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate font-display text-lg font-semibold text-fg">{project.name}</p>
        <Badge>{PROJECT_ROLE_LABEL[project.myRole]}</Badge>
      </div>
      <ProgressBar value={doneRatio(project)} label={done} />
      <div className="flex flex-wrap gap-2 text-sm text-fg-muted">
        <span>{done}</span>
        {project.pendingReviews > 0 && <Badge tone="accent">{t('projects.pendingReviews', { n: project.pendingReviews })}</Badge>}
        {overdue > 0 && <Badge tone="danger">{t('projects.overdue', { n: overdue })}</Badge>}
        {project.archivedAt && <Badge tone="danger">{t('projects.archived')}</Badge>}
      </div>
    </a>
  );
}
