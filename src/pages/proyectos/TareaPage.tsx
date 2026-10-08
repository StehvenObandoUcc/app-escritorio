import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useAction } from '@/app/useAction';
import type { Project, Task } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { canManageProject, nextSteps, type Step } from '@/lib/tasks';
import { Button, Heading, Surface } from '@/ui/atoms';
import { ConfirmDialog, EmptyState, TaskForm, Toast } from '@/ui/molecules';
import { ReviewForm, TaskDetails, TaskHistoryList, TaskReview, TaskSidebar, TaskWorkflow } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { BackLink, taskPath } from './ProyectoPage';
import { noTeamState, OfflineNote } from './ProyectosPage';
import { useProject } from './useProject';

type Mode = 'view' | 'edit' | 'subtask' | 'submit' | 'complete';

/**
 * Pantalla de una tarea (D-16): `/proyectos/:id/tareas/:tarea`.
 * - Arriba, el flujo (Por hacer → En curso → En revisión → Hecha) con el siguiente paso de quien mira.
 * - Debajo, el detalle a la izquierda y la información a la derecha.
 * - Editar, crear una subtarea, enviar o completar ocupan la pantalla entera con un solo formulario: no hay
 *   otros botones alrededor que confundan. Esc cancela el formulario o vuelve al proyecto.
 * `?accion=enviar|completar` abre directamente el formulario de entrega.
 */
export function TareaPage() {
  const { id = '', tarea = '' } = useParams();
  const ctx = useProject(id);
  if (!ctx.user) return null;
  const back = <BackLink href={`#/proyectos/${id}`} label={ctx.project?.name ?? t('projects.back')} />;
  const task = ctx.tasks.find((x) => x.id === tarea) ?? null;
  const blocked = noTeamState(ctx.activeTeam?.role ?? null);
  if (blocked || ctx.loadError || (!ctx.data.isPending && (!ctx.project || !task))) {
    return (
      <PageLayout title={t('tasks.page.title')} actions={back}>
        <EmptyState
          title={blocked?.title ?? (ctx.loadError ? t('projects.loadError') : t('tasks.page.notFound'))}
          description={blocked?.description ?? (ctx.loadError ? t('projects.loadErrorHint', { error: ctx.loadError }) : t('tasks.page.notFoundHint'))}
        />
      </PageLayout>
    );
  }
  if (!ctx.project || !task) {
    return (
      <PageLayout title={t('tasks.page.title')} actions={back}>
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      </PageLayout>
    );
  }
  return <TaskView key={task.id} ctx={ctx} project={ctx.project} task={task} back={back} />;
}

type Ctx = ReturnType<typeof useProject>;

function TaskView({ ctx, project, task, back }: { ctx: Ctx; project: Project; task: Task; back: React.ReactNode }) {
  const { cloud, bridge, me, tasks, offline, nameOf, projectPeople, assignable, activeTeam } = ctx;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reviewRef = useRef<HTMLDivElement>(null);
  const [params, setParams] = useSearchParams();
  const requested = params.get('accion');
  const [mode, setMode] = useState<Mode>(requested === 'enviar' ? 'submit' : requested === 'completar' ? 'complete' : 'view');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const action = useAction();
  const manager = canManageProject(project);
  const writable = !offline && !project.archivedAt;
  const parent = task.parentId ? (tasks.find((x) => x.id === task.parentId) ?? null) : null;
  const subtasks = tasks.filter((x) => x.parentId === task.id);
  const history = useQuery({ queryKey: ['history', task.id], enabled: historyOpen, queryFn: () => cloud.taskHistory(task.id) });
  const backTo = `/proyectos/${project.id}`;
  const steps = offline ? { primary: null, secondary: [] } : nextSteps(project, task, me, ctx.isProjectMember);
  const waitingFor =
    task.status === 'review'
      ? (nameOf(task.pendingReview?.reviewerId ?? null) ?? t('review.anyReviewer'))
      : task.status !== 'done'
        ? nameOf(task.assigneeId)
        : null;

  // La acción pedida en la URL se consume una vez para que volver atrás no reabra el formulario.
  useEffect(() => {
    if (requested) setParams({}, { replace: true });
  }, [requested, setParams]);

  // Esc vuelve al proyecto cuando no hay un formulario abierto (los formularios cancelan con su propio Esc).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mode === 'view' && !confirmDelete && !e.defaultPrevented) navigate(backTo);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, confirmDelete, navigate, backTo]);

  const after = async () => {
    await ctx.refresh();
    if (historyOpen) await queryClient.invalidateQueries({ queryKey: ['history', task.id] });
  };
  const act = async (run: () => Promise<unknown>, done?: string) => {
    const ok = await action.run(async () => {
      await run();
      await after();
    });
    if (ok && done) setToast(done);
    return ok;
  };
  /** Para formularios: el error se muestra dentro del formulario, por eso aquí se relanza. */
  const persist = async (run: () => Promise<unknown>, done: string) => {
    await run();
    await after();
    setMode('view');
    setToast(done);
  };

  const onStep = (step: Step) => {
    if (step === 'take') void act(() => cloud.takeTask(task.id), t('tasks.sidebar.taken'));
    else if (step === 'start') void act(() => cloud.setTaskStatus(task.id, 'doing'), t('tasks.flow.started'));
    else if (step === 'reopen') void act(() => cloud.setTaskStatus(task.id, 'doing'), t('tasks.flow.reopened'));
    else if (step === 'review') reviewRef.current?.querySelector<HTMLElement>('textarea, button')?.focus();
    else setMode(step);
  };

  const openLink = (url: string) => void bridge.openExternal(url).catch((cause: unknown) => action.setError(errorMessage(cause)));
  const openEvidence = (path: string) =>
    void cloud
      .evidenceUrl(path)
      .then((url) => bridge.openExternal(url))
      .catch((cause: unknown) => action.setError(errorMessage(cause)));

  // Formularios a pantalla completa: un solo propósito, sin la barra lateral ni el flujo alrededor.
  if (mode !== 'view') {
    const titles: Record<Exclude<Mode, 'view'>, string> = {
      edit: t('tasks.page.editing', { title: task.title }),
      subtask: t('tasks.page.newSubtaskOf', { title: task.title }),
      submit: t('review.title'),
      complete: t('review.completeLabel'),
    };
    return (
      <PageLayout title={titles[mode]} subtitle={project.name} actions={back}>
        <Surface as="section" aria-label={titles[mode]} className="mx-auto w-full max-w-prose">
          {mode === 'edit' && (
            <TaskForm
              initial={task}
              people={manager ? assignable : projectPeople}
              manage={manager}
              isNew={false}
              parentTitle={parent?.title}
              submitLabel={t('common.save')}
              onCancel={() => setMode('view')}
              onSubmit={(input) => persist(() => cloud.updateTask(task.id, input), t('common.saved'))}
            />
          )}
          {mode === 'subtask' && (
            <TaskForm
              initial={{ ...task, title: '', description: '', labels: [], estimateMinutes: null, assigneeId: null, assigneeCanManage: false, status: 'todo' }}
              people={assignable}
              manage={manager}
              isNew
              parentTitle={task.title}
              submitLabel={t('tasks.create')}
              onCancel={() => setMode('view')}
              onSubmit={(input, extras) => persist(() => cloud.createTask(project.id, input, { ...extras, parentId: task.id }), t('tasks.created'))}
            />
          )}
          {(mode === 'submit' || mode === 'complete') && (
            <div className="flex flex-col gap-3">
              <Heading level={2}>{task.title}</Heading>
              <ReviewForm
                mode={mode}
                task={task}
                template={project.reviewTemplate}
                reviewers={projectPeople.filter((o) => o.value !== me)}
                onCancel={() => setMode('view')}
                onSubmit={(sub) =>
                  persist(
                    () => (mode === 'submit' ? cloud.submitForReview(task, activeTeam!.id, sub) : cloud.completeTask(task, activeTeam!.id, sub)),
                    mode === 'submit' ? t('review.sent') : t('review.completed'),
                  )
                }
              />
            </div>
          )}
        </Surface>
        <Toast message={toast} onDone={() => setToast(null)} />
      </PageLayout>
    );
  }

  return (
    <PageLayout
      title={task.title}
      subtitle={parent ? t('tasks.subtaskOf', { title: parent.title }) : project.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {back}
          {writable && manager && (
            <>
              <Button size="sm" icon={<Pencil size={16} aria-hidden="true" />} onClick={() => setMode('edit')}>
                {t('tasks.panel.edit')}
              </Button>
              <Button size="sm" variant="danger" icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setConfirmDelete(true)}>
                {t('tasks.sidebar.delete')}
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
      {!writable && !offline && <p className="rounded-md bg-sunken p-3 text-sm text-fg">{t('tasks.page.archived')}</p>}
      <TaskWorkflow task={task} steps={steps} waitingFor={waitingFor} onStep={onStep} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <div ref={reviewRef}>
            <TaskReview
              task={task}
              project={project}
              me={me}
              readOnly={!writable}
              nameOf={nameOf}
              onDecide={(approve, comment) => persist(() => cloud.reviewTask(task.pendingReview!.id, approve, comment), approve ? t('review.approved') : t('review.changesRequested'))}
              onOpenLink={openLink}
              onOpenEvidence={openEvidence}
            />
          </div>
          <TaskDetails
            task={task}
            subtasks={subtasks}
            isSubtask={Boolean(parent)}
            canEditCriteria={writable && manager}
            canAddSubtask={writable && !parent && (manager || ctx.isProjectMember)}
            nameOf={nameOf}
            onCriteria={(texts) => persist(() => cloud.setTaskCriteria(task.id, texts), t('common.saved'))}
            onAddSubtask={() => setMode('subtask')}
            onOpenTask={(sub) => navigate(taskPath(project.id, sub))}
          />
          <TaskHistoryList history={history.data ?? null} onLoad={() => setHistoryOpen(true)} />
        </div>
        <Surface className="h-fit">
          <TaskSidebar
            task={task}
            project={project}
            me={me}
            nameOf={nameOf}
            people={manager ? assignable : projectPeople}
            readOnly={offline}
            timer={ctx.timerFor(task)}
            onCollaborators={(ids) => persist(() => cloud.setTaskCollaborators(task.id, ids), t('common.saved'))}
            onTimer={() => void ctx.toggleTimer(task).catch((cause: unknown) => action.setError(errorMessage(cause)))}
          />
        </Surface>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        title={t('tasks.page.deleteTitle', { title: task.title })}
        message={subtasks.length ? t('tasks.page.deleteWithSubtasks', { n: subtasks.length }) : t('tasks.page.deleteHint')}
        confirmLabel={t('tasks.sidebar.delete')}
        danger
        busy={action.busy}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() =>
          void action
            .run(async () => {
              await cloud.deleteTask(task.id);
              await ctx.refresh();
            })
            .then((ok) => {
              setConfirmDelete(false);
              if (ok) navigate(parent ? taskPath(project.id, parent.id) : backTo);
            })
        }
      />
      <Toast message={toast} onDone={() => setToast(null)} />
    </PageLayout>
  );
}
