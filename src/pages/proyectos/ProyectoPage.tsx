import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useSession } from '@/app/session';
import type { Member, ManualStatus, Project, ProjectMember, Task } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { allLabels, canChangeStatus, canManageProject, canReview, NO_FILTER, PROJECT_ROLE_LABEL, taskTree, type TaskFilter } from '@/lib/tasks';
import { localDate } from '@/lib/time';
import { Badge, Button, Heading, Surface } from '@/ui/atoms';
import { ConfirmDialog, EmptyState, ProjectProgress, SegmentedControl, TaskFilters, TaskForm, Toast } from '@/ui/molecules';
import { ProjectMemberList, ReviewTemplateEditor, TaskBoard, TaskList, TaskPanel } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { noTeamState, OfflineNote } from './ProyectosPage';
import { useWork } from './useWork';

type Tab = 'board' | 'list' | 'reviews' | 'members' | 'settings';
const DAYS_30 = 30 * 24 * 3600 * 1000;

/** Un proyecto (D-14): la selección vive en la URL (`/proyectos/:id?tarea=…`), así volver a él lo muestra a él (B1). */
export function ProyectoPage() {
  const { id = '' } = useParams();
  const session = useSession();
  const { cloud, bridge, user, activeTeam, sync } = session;
  const data = useWork(cloud, bridge, activeTeam?.id ?? null, sync.lastSyncedAt);
  if (!user) return null;
  const back = (
    <a href="#/proyectos" className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
      <ArrowLeft size={16} aria-hidden="true" />
      {t('projects.back')}
    </a>
  );
  const blocked = noTeamState(activeTeam?.role ?? null);
  const project = data.data?.work.projects.find((p) => p.id === id);
  if (blocked || data.isError || (!data.isPending && !project)) {
    return (
      <PageLayout title={t('projects.title')} actions={back}>
        <EmptyState
          title={blocked?.title ?? (data.isError ? t('projects.loadError') : t('projects.notFound'))}
          description={blocked?.description ?? (data.isError ? t('projects.loadErrorHint', { error: errorMessage(data.error) }) : t('projects.notFoundHint'))}
        />
      </PageLayout>
    );
  }
  if (!project || !data.data) {
    return (
      <PageLayout title={t('projects.title')} actions={back}>
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      </PageLayout>
    );
  }
  const { work, offline } = data.data;
  return (
    <ProjectView
      key={project.id}
      project={project}
      tasks={work.tasks.filter((x) => x.projectId === project.id)}
      members={work.members[project.id] ?? []}
      offline={offline}
      savedAt={work.savedAt}
      back={back}
      refresh={data.refresh}
    />
  );
}

function ProjectView({
  project,
  tasks,
  members,
  offline,
  savedAt,
  back,
  refresh,
}: {
  project: Project;
  tasks: Task[];
  members: ProjectMember[];
  offline: boolean;
  savedAt: string;
  back: React.ReactNode;
  refresh: () => Promise<void>;
}) {
  const { cloud, bridge, user, activeTeam, syncNow } = useSession();
  const queryClient = useQueryClient();
  const me = user?.id ?? '';
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('board');
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);
  const [creating, setCreating] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(null);
  const writable = !offline && !project.archivedAt;
  const manager = canManageProject(project);
  const today = localDate();

  // Personas: quien gestiona asigna a cualquiera del equipo que no sea observador (se añade al proyecto solo, AC-21).
  const team = useQuery({ queryKey: ['members', activeTeam?.id], enabled: manager && !offline, queryFn: () => cloud.members(activeTeam!.id) });
  const memberName = new Map(members.map((m) => [m.userId, m.displayName ?? t('common.noName')]));
  for (const m of team.data ?? []) if (!memberName.has(m.userId)) memberName.set(m.userId, m.displayName ?? t('common.noName'));
  const nameOf = (uid: string | null) => (uid ? (memberName.get(uid) ?? t('common.exMember')) : null);
  const projectPeople = members.map((m) => ({ value: m.userId, label: memberName.get(m.userId) ?? '' }));
  const teamPeople = (team.data ?? []).filter((m: Member) => m.role !== 'viewer').map((m) => ({ value: m.userId, label: m.displayName ?? t('common.noName') }));
  const people = manager ? (teamPeople.length ? teamPeople : projectPeople) : projectPeople.filter((o) => o.value === me);

  // B6: el estado del temporizador se vuelve a pedir al enfocar la ventana y cada 15 s.
  const status = useQuery({ queryKey: ['sensor-status'], queryFn: () => bridge.sensorStatus(), refetchInterval: 15_000, refetchOnWindowFocus: true });
  const history = useQuery({ queryKey: ['history', historyFor], enabled: historyFor !== null, queryFn: () => cloud.taskHistory(historyFor!) });

  const openId = params.get('tarea');
  const open = tasks.find((x) => x.id === openId) ?? null;
  const openTask = (taskId: string | null) => setParams(taskId ? { tarea: taskId } : {}, { replace: true });

  const act = async (action: () => Promise<unknown>, done?: string) => {
    setError(null);
    try {
      await action();
      await refresh();
      if (historyFor) await queryClient.invalidateQueries({ queryKey: ['history', historyFor] });
      if (done) setToast(done);
    } catch (cause) {
      setError(errorMessage(cause));
      throw cause;
    }
  };
  const quiet = (action: () => Promise<unknown>) => void act(action).catch(() => {});

  const tree = taskTree(tasks, filter, me);
  const viewProps = {
    tree,
    nameOf,
    today,
    canChangeStatus: (x: Task) => writable && canChangeStatus(project, x, me),
    onStatusChange: (x: Task, s: ManualStatus) => quiet(() => cloud.setTaskStatus(x.id, s)),
    onOpen: (x: Task) => openTask(x.id),
  };
  const reviews = tasks.filter((x) => x.pendingReview);

  // TA-05 y B13: el temporizador va sobre la tarea; si corre en otra, se detiene y empieza en esta.
  const toggleTimer = async (task: Task) => {
    const timer = status.data?.timer;
    const onThis = timer?.running && timer.taskId === task.id;
    try {
      if (timer?.running) await bridge.timerStop();
      if (!onThis) await bridge.timerStart(task.id);
      else syncNow();
      await queryClient.invalidateQueries({ queryKey: ['sensor-status'] });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  const tabs: { value: Tab; label: string }[] = [
    { value: 'board', label: t('projects.tabs.board') },
    { value: 'list', label: t('projects.tabs.list') },
    { value: 'reviews', label: reviews.length ? t('projects.tabs.reviewsCount', { n: reviews.length }) : t('projects.tabs.reviews') },
    { value: 'members', label: t('projects.tabs.members') },
    ...(manager && !offline ? [{ value: 'settings' as Tab, label: t('projects.tabs.settings') }] : []),
  ];

  return (
    <PageLayout title={project.name} subtitle={activeTeam?.name} actions={back}>
      {offline && <OfflineNote savedAt={savedAt} />}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
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

      {open && (
        <TaskPanel
          key={open.id}
          task={open}
          project={project}
          subtasks={tasks.filter((x) => x.parentId === open.id)}
          parentTitle={open.parentId ? (tasks.find((x) => x.id === open.parentId)?.title ?? null) : null}
          me={me}
          nameOf={nameOf}
          people={manager ? people : projectPeople}
          projectPeople={projectPeople}
          readOnly={offline}
          timer={{ running: Boolean(status.data?.timer.running), onThis: status.data?.timer.taskId === open.id && Boolean(status.data?.timer.running) }}
          history={historyFor === open.id ? (history.data ?? null) : null}
          today={today}
          onLoadHistory={() => setHistoryFor(open.id)}
          onEdit={(input) => act(() => cloud.updateTask(open.id, input), t('common.saved'))}
          onStatus={(s) => quiet(() => cloud.setTaskStatus(open.id, s))}
          onCollaborators={(ids) => act(() => cloud.setTaskCollaborators(open.id, ids), t('common.saved'))}
          onCriteria={(texts) => act(() => cloud.setTaskCriteria(open.id, texts), t('common.saved'))}
          onAddSubtask={(input, extras) => act(() => cloud.createTask(project.id, input, extras), t('tasks.created'))}
          onSubmitReview={(sub) => act(() => cloud.submitForReview(open, activeTeam!.id, sub), t('review.sent'))}
          onDecide={(approve, comment) => act(() => cloud.reviewTask(open.pendingReview!.id, approve, comment), approve ? t('review.approved') : t('review.changesRequested'))}
          onTimer={() => void toggleTimer(open)}
          onOpenEvidence={(path) => void cloud.evidenceUrl(path).then((url) => window.open(url, '_blank', 'noopener'), (cause: unknown) => setError(errorMessage(cause)))}
          onOpenTask={openTask}
          onClose={() => openTask(null)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label={t('projects.tabs.label')} options={tabs} value={tab} onChange={setTab} />
        {writable && (tab === 'board' || tab === 'list') && (
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            {t('tasks.new')}
          </Button>
        )}
      </div>

      {creating && (
        <Surface as="section" aria-label={t('tasks.new')}>
          <TaskForm
            people={people}
            manage={manager}
            isNew
            submitLabel={t('tasks.create')}
            onCancel={() => setCreating(false)}
            onSubmit={async (input, extras) => {
              await act(() => cloud.createTask(project.id, input, extras), t('tasks.created'));
              setCreating(false);
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
                  <button type="button" onClick={() => openTask(x.id)} className="min-w-0 flex-1 truncate text-left font-medium text-fg hover:underline">
                    {x.title}
                  </button>
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
          <MembersTab project={project} members={members} me={me} manage={manager && writable} candidates={teamPeople.filter((o) => !members.some((m) => m.userId === o.value))} act={act} />
        </Surface>
      )}

      {tab === 'settings' && manager && (
        <Surface as="section" aria-label={t('projects.tabs.settings')} className="flex flex-col gap-4">
          <Heading level={2}>{t('projects.template.title')}</Heading>
          <p className="text-sm text-fg-muted">{t('projects.template.hint')}</p>
          <ReviewTemplateEditor fields={project.reviewTemplate} onSave={(fields) => act(() => cloud.setReviewTemplate(project.id, fields), t('common.saved'))} />
          {project.myRole === 'manager' && (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <Heading level={2}>{project.archivedAt ? t('projects.unarchive') : t('projects.archive')}</Heading>
              <p className="text-sm text-fg-muted">{project.archivedAt ? t('projects.unarchiveHint') : t('projects.archiveHint')}</p>
              <div>
                <Button
                  variant={project.archivedAt ? 'secondary' : 'danger'}
                  icon={project.archivedAt ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
                  onClick={() => (project.archivedAt ? quiet(() => cloud.setProjectArchived(project.id, false)) : setConfirmArchive(true))}
                >
                  {project.archivedAt ? t('projects.unarchive') : t('projects.archive')}
                </Button>
              </div>
            </div>
          )}
        </Surface>
      )}

      <ConfirmDialog
        open={confirmArchive}
        title={t('projects.archiveConfirmTitle', { name: project.name })}
        message={t('projects.archiveHint')}
        confirmLabel={t('projects.archive')}
        danger
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => {
          setConfirmArchive(false);
          quiet(() => cloud.setProjectArchived(project.id, true));
        }}
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </PageLayout>
  );
}

function MembersTab({
  project,
  members,
  me,
  manage,
  candidates,
  act,
}: {
  project: Project;
  members: ProjectMember[];
  me: string;
  manage: boolean;
  candidates: { value: string; label: string }[];
  act: (action: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const { cloud } = useSession();
  // Fila 13 «P»: tiempo por persona en los últimos 30 días, solo para quien gestiona.
  const time = useQuery({
    queryKey: ['project-time', project.id],
    enabled: canManageProject(project),
    queryFn: () => {
      const to = new Date();
      return cloud.projectTimeSummary(project.id, new Date(to.getTime() - DAYS_30).toISOString(), to.toISOString());
    },
  });
  return (
    <div className="flex flex-col gap-3">
      {time.data && <p className="text-sm text-fg-muted">{t('projects.members.timeHint')}</p>}
      <ProjectMemberList
        members={members}
        myUserId={me}
        canManage={manage}
        candidates={candidates}
        seconds={time.data ? new Map(time.data.map((r) => [r.userId, r.seconds])) : undefined}
        onSetRole={(userId, role) => void act(() => cloud.setProjectMember(project.id, userId, role), t('common.saved')).catch(() => {})}
        onRemove={(userId) => void act(() => cloud.removeProjectMember(project.id, userId), t('common.saved')).catch(() => {})}
      />
    </div>
  );
}
