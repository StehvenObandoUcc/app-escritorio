import { useQuery } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useAction } from '@/app/useAction';
import type { Project, ProjectMember, Task, TaskStatus } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { fieldErrors, forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { allLabels, canChangeStatus, canManageProject, canReview, NO_FILTER, PROJECT_ROLE_LABEL, statusAction, taskTree, type TaskFilter } from '@/lib/tasks';
import { localDate } from '@/lib/time';
import { Badge, Button, Heading, Input, Surface } from '@/ui/atoms';
import { ConfirmDialog, EmptyState, ProjectProgress, SegmentedControl, TaskFilters, TaskForm, Toast } from '@/ui/molecules';
import { ProjectMemberList, ReviewTemplateEditor, TaskBoard, TaskList } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { noTeamState, OfflineNote } from './ProyectosPage';
import { useProject } from './useProject';

type Tab = 'board' | 'list' | 'reviews' | 'members' | 'settings';
const DAYS_30 = 30 * 24 * 3600 * 1000;

export const taskPath = (projectId: string, taskId: string, action?: 'enviar' | 'completar') =>
  `/proyectos/${projectId}/tareas/${taskId}${action ? `?accion=${action}` : ''}`;

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} className="inline-flex items-center gap-1 rounded-xs text-sm text-fg-muted hover:text-fg">
      <ArrowLeft size={16} aria-hidden="true" />
      {label}
    </a>
  );
}

/** Un proyecto (D-14): la selección vive en la URL, así volver a él lo muestra a él (B1). */
export function ProyectoPage() {
  const { id = '' } = useParams();
  const ctx = useProject(id);
  if (!ctx.user) return null;
  const back = <BackLink href="#/proyectos" label={t('projects.back')} />;
  const blocked = noTeamState(ctx.activeTeam?.role ?? null);
  if (blocked || ctx.loadError || (!ctx.data.isPending && !ctx.project)) {
    return (
      <PageLayout title={t('projects.title')} actions={back}>
        <EmptyState
          title={blocked?.title ?? (ctx.loadError ? t('projects.loadError') : t('projects.notFound'))}
          description={blocked?.description ?? (ctx.loadError ? t('projects.loadErrorHint', { error: ctx.loadError }) : t('projects.notFoundHint'))}
        />
      </PageLayout>
    );
  }
  if (!ctx.project) {
    return (
      <PageLayout title={t('projects.title')} actions={back}>
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      </PageLayout>
    );
  }
  return <ProjectView key={ctx.project.id} ctx={ctx} project={ctx.project} back={back} />;
}

type Ctx = ReturnType<typeof useProject>;

function ProjectView({ ctx, project, back }: { ctx: Ctx; project: Project; back: React.ReactNode }) {
  const { cloud, me, tasks, members, offline, nameOf, projectPeople, teamPeople, assignable, activeTeam } = ctx;
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('board');
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);
  const [creating, setCreating] = useState(false);
  const [dialog, setDialog] = useState<'archive' | 'delete' | null>(null);
  const [confirmName, setConfirmName] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const action = useAction();
  const writable = !offline && !project.archivedAt;
  const manager = canManageProject(project);
  const teamManager = project.myRole === 'manager';
  const today = localDate();

  const act = async (run: () => Promise<unknown>, done?: string) => {
    const ok = await action.run(async () => {
      await run();
      await ctx.refresh();
    });
    if (ok && done) setToast(done);
    return ok;
  };

  // AC-45: el selector ofrece los 4 estados; En revisión y Hecha llevan al formulario de entrega.
  const changeStatus = (task: Task, status: TaskStatus) => {
    const next = statusAction(project, task, me, status);
    if (next === 'set') void act(() => cloud.setTaskStatus(task.id, status as 'todo' | 'doing'));
    else if (next === 'forbidden') action.setError(t('tasks.statusForbidden'));
    else navigate(taskPath(project.id, task.id, next === 'submit' ? 'enviar' : 'completar'));
  };

  const tree = taskTree(tasks, filter, me);
  const viewProps = {
    tree,
    nameOf,
    today,
    canChangeStatus: (x: Task) => writable && canChangeStatus(project, x, me),
    onStatusChange: changeStatus,
    onOpen: (x: Task) => navigate(taskPath(project.id, x.id)),
  };
  const reviews = tasks.filter((x) => x.pendingReview);
  const tabs: { value: Tab; label: string }[] = [
    { value: 'board', label: t('projects.tabs.board') },
    { value: 'list', label: t('projects.tabs.list') },
    { value: 'reviews', label: reviews.length ? t('projects.tabs.reviewsCount', { n: reviews.length }) : t('projects.tabs.reviews') },
    { value: 'members', label: t('projects.tabs.members') },
    ...(manager && !offline ? [{ value: 'settings' as Tab, label: t('projects.tabs.settings') }] : []),
  ];
  const deleteCheck = fieldErrors(forms.deleteProject(project.name), { confirm: confirmName });

  return (
    <PageLayout
      title={project.name}
      subtitle={activeTeam?.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {back}
          {teamManager && !offline && (
            <>
              <Button
                size="sm"
                icon={project.archivedAt ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                onClick={() => (project.archivedAt ? void act(() => cloud.setProjectArchived(project.id, false), t('projects.unarchived')) : setDialog('archive'))}
              >
                {project.archivedAt ? t('projects.unarchive') : t('projects.archive')}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setDialog('delete')}>
                {t('projects.delete')}
              </Button>
            </>
          )}
        </div>
      }
    >
      {offline && <OfflineNote savedAt={ctx.work?.savedAt ?? ''} />}
      {action.error && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {action.error}
        </p>
      )}
      <Surface as="section" aria-label={t('projects.progressLabel')} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{PROJECT_ROLE_LABEL[project.myRole]}</Badge>
          {project.archivedAt && <Badge tone="danger">{t('projects.archived')}</Badge>}
          {project.pendingReviews > 0 && <Badge tone="accent">{t('projects.pendingReviews', { n: project.pendingReviews })}</Badge>}
        </div>
        <ProjectProgress tasksDone={project.tasksDone} tasksTotal={project.tasksTotal} loggedSeconds={project.loggedSeconds} estimateMinutes={project.estimateMinutes} />
      </Surface>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label={t('projects.tabs.label')} options={tabs} value={tab} onChange={setTab} />
        {writable && (tab === 'board' || tab === 'list') && !creating && (
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t('tasks.new')}
          </Button>
        )}
      </div>

      {creating && (
        <Surface as="section" aria-label={t('tasks.new')}>
          <TaskForm
            people={assignable}
            manage={manager}
            isNew
            submitLabel={t('tasks.create')}
            onCancel={() => setCreating(false)}
            onSubmit={async (input, extras) => {
              await cloud.createTask(project.id, input, extras);
              await ctx.refresh();
              setCreating(false);
              setToast(t('tasks.created'));
            }}
          />
        </Surface>
      )}

      {(tab === 'board' || tab === 'list') && (
        <Surface as="section" aria-label={tab === 'board' ? t('projects.tabs.board') : t('projects.tabs.list')} className="flex flex-col gap-3">
          <TaskFilters filter={filter} onChange={setFilter} people={projectPeople} labels={allLabels(tasks)} count={tree.reduce((n, x) => n + 1 + x.children.length, 0)} />
          {tasks.length === 0 ? <p className="text-fg-muted">{t('tasks.emptyProject')}</p> : tab === 'list' ? <TaskList {...viewProps} /> : <TaskBoard {...viewProps} />}
        </Surface>
      )}

      {tab === 'reviews' && (
        <Surface as="section" aria-label={t('projects.tabs.reviews')} className="flex flex-col gap-2">
          {reviews.length === 0 ? (
            <p className="text-fg-muted">{t('review.none')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {reviews.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 py-3">
                  <a href={`#${taskPath(project.id, x.id)}`} className="min-w-0 flex-1 truncate rounded-xs font-medium text-fg hover:underline">
                    {x.title}
                  </a>
                  <span className="text-sm text-fg-muted">{t('review.submittedByShort', { name: nameOf(x.pendingReview?.submittedBy ?? null) ?? t('common.exMember') })}</span>
                  {canReview(project, x, me) && x.pendingReview?.submittedBy !== me && <Badge tone="accent">{t('review.yourTurn')}</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Surface>
      )}

      {tab === 'members' && (
        <Surface as="section" aria-label={t('projects.tabs.members')}>
          <MembersTab ctx={ctx} project={project} members={members} manage={manager && writable} candidates={teamPeople.filter((o) => !members.some((m) => m.userId === o.value))} act={act} />
        </Surface>
      )}

      {tab === 'settings' && manager && (
        <Surface as="section" aria-label={t('projects.tabs.settings')} className="flex flex-col gap-4">
          <Heading level={2}>{t('projects.template.title')}</Heading>
          <p className="text-sm text-fg-muted">{t('projects.template.hint')}</p>
          <ReviewTemplateEditor fields={project.reviewTemplate} onSave={(fields) => act(() => cloud.setReviewTemplate(project.id, fields), t('common.saved')).then(() => {})} />
        </Surface>
      )}

      <ConfirmDialog
        open={dialog === 'archive'}
        title={t('projects.archiveConfirmTitle', { name: project.name })}
        message={t('projects.archiveHint')}
        confirmLabel={t('projects.archive')}
        busy={action.busy}
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null);
          void act(() => cloud.setProjectArchived(project.id, true), t('projects.archivedToast'));
        }}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        title={t('projects.deleteConfirmTitle', { name: project.name })}
        message={t('projects.deleteHint')}
        confirmLabel={t('projects.delete')}
        danger
        busy={action.busy}
        error={action.error}
        confirmDisabled={Boolean(deleteCheck.errors)}
        onCancel={() => {
          setDialog(null);
          setConfirmName('');
        }}
        onConfirm={() =>
          void action
            .run(async () => {
              await cloud.deleteProject(project.id, confirmName.trim());
              await ctx.refresh();
            })
            .then((ok) => ok && navigate('/proyectos'))
        }
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('projects.deleteType', { name: project.name })}
          <Input name="confirm" autoFocus maxLength={LIMITS.projectName.max} value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
        </label>
      </ConfirmDialog>
      <Toast message={toast} onDone={() => setToast(null)} />
    </PageLayout>
  );
}

function MembersTab({
  ctx,
  project,
  members,
  manage,
  candidates,
  act,
}: {
  ctx: Ctx;
  project: Project;
  members: ProjectMember[];
  manage: boolean;
  candidates: { value: string; label: string }[];
  act: (run: () => Promise<unknown>, done?: string) => Promise<boolean>;
}) {
  const { cloud, me } = ctx;
  // Fila 13 «P»: tiempo por persona en los últimos 30 días, solo para quien gestiona.
  const time = useQuery({
    queryKey: ['project-time', project.id],
    enabled: canManageProject(project),
    queryFn: () => {
      const to = new Date();
      return cloud.projectTimeSummary(project.id, new Date(to.getTime() - DAYS_30).toISOString(), to.toISOString());
    },
  });
  if (time.error) return <p role="alert" className="text-sm text-danger">{errorMessage(time.error)}</p>;
  return (
    <div className="flex flex-col gap-3">
      {time.data && <p className="text-sm text-fg-muted">{t('projects.members.timeHint')}</p>}
      <ProjectMemberList
        members={members}
        myUserId={me}
        canManage={manage}
        candidates={candidates}
        seconds={time.data ? new Map(time.data.map((r) => [r.userId, r.seconds])) : undefined}
        onSetRole={(userId, role) => void act(() => cloud.setProjectMember(project.id, userId, role), t('common.saved'))}
        onRemove={(userId) => void act(() => cloud.removeProjectMember(project.id, userId), t('common.saved'))}
      />
    </div>
  );
}
