import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Play, Plus, Square } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/app/session';
import type { Member, Project, ProjectRole, Task, TaskInput, TaskStatus } from '@/cloud/contract';
import { localDate } from '@/lib/time';
import {
  allLabels,
  canChangeStatus,
  canCreateProject,
  canManageProject,
  filterTasks,
  formatMinutes,
  NO_FILTER,
  PROJECT_ROLE_LABEL,
  STATUS_LABEL,
  timeRatio,
  type TaskFilter,
} from '@/lib/tasks';
import { Badge, Button, Heading, ProgressBar, Select, Surface } from '@/ui/atoms';
import { EmptyState, FormField, ProjectProgress, SegmentedControl, TaskFilters, TaskForm } from '@/ui/molecules';
import { ProjectMemberList, TaskBoard, TaskList } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { useTasks } from './useTasks';

type View = 'list' | 'board' | 'members';
const VIEWS: { value: View; label: string }[] = [
  { value: 'list', label: 'Lista' },
  { value: 'board', label: 'Tablero' },
  { value: 'members', label: 'Miembros' },
];
const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const DAYS_30 = 30 * 24 * 3600 * 1000;

/** Tareas (F3): proyectos, lista con filtros, tablero, detalle con temporizador y avance. */
export function TareasPage() {
  const session = useSession();
  const { cloud, bridge, user, activeTeam } = session;
  const data = useTasks(cloud, bridge, activeTeam?.id ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user) return null;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">Datos de ejemplo</Badge>;

  if (!activeTeam) {
    return (
      <PageLayout title="Tareas" actions={sampleTag}>
        <EmptyState title="Aún no tienes equipo" description="Crea un equipo o acepta una invitación en Equipo para organizar proyectos y tareas." />
      </PageLayout>
    );
  }
  if (activeTeam.role === 'viewer') {
    return (
      <PageLayout title="Tareas" subtitle={activeTeam.name} actions={sampleTag}>
        <EmptyState
          title="Los observadores no participan en proyectos"
          description="Con el rol de observador ves los resúmenes del equipo, pero no sus proyectos ni sus tareas."
        />
      </PageLayout>
    );
  }

  const snapshot = data.data?.snapshot;
  const offline = data.data?.offline ?? false;
  const projects = snapshot?.projects ?? [];
  const project = projects.find((p) => p.id === selected) ?? projects.find((p) => !p.archivedAt) ?? projects[0] ?? null;

  const act = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
      await data.refresh();
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    }
  };

  return (
    <PageLayout
      title="Tareas"
      subtitle={activeTeam.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sampleTag}
          {projects.length > 0 && (
            <Select
              aria-label="Proyecto"
              value={project?.id ?? ''}
              onChange={(e) => setSelected(e.target.value)}
              options={projects.map((p) => ({ value: p.id, label: p.archivedAt ? `${p.name} (archivado)` : p.name }))}
            />
          )}
          {canCreateProject(activeTeam.role) && !offline && (
            <Button icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreatingProject(true)}>
              Nuevo proyecto
            </Button>
          )}
        </div>
      }
    >
      {offline && (
        <p role="status" className="rounded-md bg-sunken p-3 text-sm text-fg">
          Sin conexión: solo lectura. Estas son las tareas guardadas en este equipo el{' '}
          {new Date(snapshot?.savedAt ?? '').toLocaleString('es-CO', { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })}.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {creatingProject && (
        <NewProject
          onCancel={() => setCreatingProject(false)}
          onCreate={async (name) => {
            const id = await cloud.createProject(activeTeam.id, name);
            setCreatingProject(false);
            setSelected(id);
            await data.refresh();
          }}
        />
      )}
      {data.isPending ? (
        <p role="status" className="text-fg-muted">
          Cargando proyectos…
        </p>
      ) : data.isError ? (
        <EmptyState
          title="No se pudieron cargar las tareas"
          description={`${describe(data.error)} Cuando vuelva la conexión, se mostrarán solas.`}
        />
      ) : !project ? (
        <EmptyState
          title="Todavía no hay proyectos"
          description={
            canCreateProject(activeTeam.role)
              ? 'Crea el primer proyecto con «Nuevo proyecto» y añade a tu equipo.'
              : 'Cuando alguien te añada a un proyecto, aparecerá aquí con sus tareas.'
          }
        />
      ) : (
        <ProjectView
          key={project.id}
          project={project}
          tasks={snapshot?.tasks[project.id] ?? []}
          members={snapshot?.members[project.id] ?? []}
          offline={offline}
          act={act}
        />
      )}
    </PageLayout>
  );
}

function NewProject({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError('El nombre debe tener al menos 2 caracteres.');
    try {
      await onCreate(name.trim());
    } catch (cause) {
      setError(describe(cause));
    }
  };
  return (
    <Surface as="section" aria-label="Nuevo proyecto">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-48 flex-1">
          <FormField label="Nombre del proyecto" value={name} maxLength={80} error={error ?? undefined} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="primary">
          Crear proyecto
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </form>
    </Surface>
  );
}

function ProjectView({
  project,
  tasks,
  members,
  offline,
  act,
}: {
  project: Project;
  tasks: Task[];
  members: { userId: string; role: ProjectRole; displayName: string | null }[];
  offline: boolean;
  act: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { cloud, bridge, user, activeTeam, syncNow } = useSession();
  const me = user?.id ?? '';
  const [view, setView] = useState<View>('list');
  const [filter, setFilter] = useState<TaskFilter>(NO_FILTER);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const writable = !offline && !project.archivedAt;
  const manage = canManageProject(project) && writable;
  const today = localDate(new Date());

  const names = new Map(members.map((m) => [m.userId, m.displayName ?? 'Persona sin nombre']));
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'Exmiembro') : null);
  const people = members.map((m) => ({ value: m.userId, label: names.get(m.userId) ?? '' }));
  // Un colaborador solo crea tareas para sí (D-2).
  const assignable = canManageProject(project) ? people : people.filter((p) => p.value === me);
  const visible = filterTasks(tasks, filter, me);
  const open = tasks.find((t) => t.id === openId) ?? null;

  const viewProps = {
    tasks: visible,
    nameOf,
    today,
    canChangeStatus: (t: Task) => writable && canChangeStatus(project, t, me),
    onStatusChange: (t: Task, s: TaskStatus) => void act(() => cloud.setTaskStatus(t.id, s)),
    onOpen: (t: Task) => setOpenId(t.id),
  };

  return (
    <>
      <Surface as="section" aria-label="Avance del proyecto" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Heading level={2}>{project.name}</Heading>
            <Badge>{PROJECT_ROLE_LABEL[project.myRole]}</Badge>
            {project.archivedAt && <Badge tone="danger">Archivado</Badge>}
          </div>
          {project.myRole === 'manager' && !offline && (
            <Button
              size="sm"
              variant="ghost"
              icon={project.archivedAt ? <ArchiveRestore size={16} aria-hidden="true" /> : <Archive size={16} aria-hidden="true" />}
              onClick={() => void act(() => cloud.setProjectArchived(project.id, !project.archivedAt))}
            >
              {project.archivedAt ? 'Desarchivar proyecto' : 'Archivar proyecto'}
            </Button>
          )}
        </div>
        <ProjectProgress
          tasksDone={project.tasksDone}
          tasksTotal={project.tasksTotal}
          loggedSeconds={project.loggedSeconds}
          estimateMinutes={project.estimateMinutes}
        />
      </Surface>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="Vista" options={VIEWS} value={view} onChange={setView} />
        {writable && view !== 'members' && (
          <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
            Nueva tarea
          </Button>
        )}
      </div>

      {creating && (
        <Surface as="section" aria-label="Nueva tarea">
          <TaskForm
            people={assignable}
            submitLabel="Crear tarea"
            onCancel={() => setCreating(false)}
            onSubmit={async (input) => {
              await cloud.createTask(project.id, input);
              setCreating(false);
              await act(async () => {});
            }}
          />
        </Surface>
      )}

      {open && (
        <TaskDetail
          key={open.id}
          task={open}
          project={project}
          assignable={assignable}
          assigneeName={nameOf(open.assigneeId)}
          editable={manage}
          onClose={() => setOpenId(null)}
          onSave={async (input) => {
            await cloud.updateTask(open.id, input);
            await act(async () => {});
          }}
          bridge={bridge}
          syncNow={syncNow}
        />
      )}

      {view === 'members' ? (
        <Surface as="section" aria-label="Miembros del proyecto">
          <MembersTab project={project} members={members} me={me} teamMembersOf={activeTeam?.id ?? ''} manage={manage} act={act} />
        </Surface>
      ) : (
        <Surface as="section" aria-label={view === 'list' ? 'Lista de tareas' : 'Tablero'} className="flex flex-col gap-3">
          <TaskFilters filter={filter} onChange={setFilter} people={people} labels={allLabels(tasks)} count={visible.length} />
          {tasks.length === 0 ? (
            <p className="text-fg-muted">Este proyecto aún no tiene tareas.</p>
          ) : view === 'list' ? (
            <TaskList {...viewProps} />
          ) : (
            <TaskBoard {...viewProps} />
          )}
        </Surface>
      )}
    </>
  );
}

function TaskDetail({
  task,
  project,
  assignable,
  assigneeName,
  editable,
  onClose,
  onSave,
  bridge,
  syncNow,
}: {
  task: Task;
  project: Project;
  assignable: { value: string; label: string }[];
  assigneeName: string | null;
  editable: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  bridge: ReturnType<typeof useSession>['bridge'];
  syncNow: () => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [timerError, setTimerError] = useState<string | null>(null);
  const status = useQuery({ queryKey: ['sensor-status'], queryFn: () => bridge.sensorStatus() });
  const timer = status.data?.timer;
  const onThis = timer?.running && timer.taskId === task.id;
  const ratio = timeRatio(task.loggedSeconds, task.estimateMinutes);

  // TA-05: el temporizador acepta una tarea. Si corre en otra, se detiene y empieza en esta.
  const toggleTimer = async () => {
    setTimerError(null);
    try {
      if (timer?.running) await bridge.timerStop();
      if (!onThis) await bridge.timerStart(task.id);
      else syncNow();
      await queryClient.invalidateQueries({ queryKey: ['sensor-status'] });
    } catch (cause) {
      setTimerError(describe(cause));
    }
  };

  return (
    <Surface as="section" aria-label={`Tarea: ${task.title}`} className="flex flex-col gap-4">
      {editing ? (
        <TaskForm
          initial={task}
          people={assignable}
          submitLabel="Guardar cambios"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            await onSave(input);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <Heading level={2}>{task.title}</Heading>
              <p className="text-sm text-fg-muted">
                {STATUS_LABEL[task.status]} · {assigneeName ?? 'Sin responsable'}
                {task.dueDate && ` · vence el ${new Date(`${task.dueDate}T12:00:00`).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {editable && (
                <Button size="sm" onClick={() => setEditing(true)}>
                  Editar tarea
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
          {task.description && <p className="whitespace-pre-line text-fg">{task.description}</p>}
          {task.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.labels.map((l) => (
                <Badge key={l}>{l}</Badge>
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-sm text-fg">
              <span className="font-display text-xl font-semibold tabular-nums">{formatMinutes(task.loggedSeconds / 60)}</span>{' '}
              {task.estimateMinutes ? `de ${formatMinutes(task.estimateMinutes)} estimadas` : 'registradas'}
            </p>
            {ratio !== null && (
              <ProgressBar
                value={ratio}
                label={`Tiempo de la tarea frente a lo estimado`}
                fill={ratio > 1 ? 'bg-cat-distraction' : 'bg-accent'}
              />
            )}
          </div>
          {!project.archivedAt && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant={onThis ? 'primary' : 'secondary'}
                icon={onThis ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
                onClick={() => void toggleTimer()}
              >
                {onThis ? 'Detener temporizador' : timer?.running ? 'Pasar el temporizador a esta tarea' : 'Iniciar temporizador en esta tarea'}
              </Button>
              <p className="text-sm text-fg-muted">El tiempo se suma a la tarea al subirse (en menos de un minuto).</p>
            </div>
          )}
          {timerError && (
            <p role="alert" className="text-sm text-danger">
              {timerError}
            </p>
          )}
        </>
      )}
    </Surface>
  );
}

function MembersTab({
  project,
  members,
  me,
  teamMembersOf,
  manage,
  act,
}: {
  project: Project;
  members: { userId: string; role: ProjectRole; displayName: string | null }[];
  me: string;
  teamMembersOf: string;
  manage: boolean;
  act: (action: () => Promise<unknown>) => Promise<boolean>;
}) {
  const { cloud } = useSession();
  const team = useQuery({
    queryKey: ['members', teamMembersOf],
    enabled: manage,
    queryFn: () => cloud.members(teamMembersOf),
  });
  // Fila 13 «P»: tiempo por persona en los últimos 30 días, solo para quien gestiona.
  const time = useQuery({
    queryKey: ['project-time', project.id],
    enabled: canManageProject(project),
    queryFn: () => {
      const to = new Date();
      return cloud.projectTimeSummary(project.id, new Date(to.getTime() - DAYS_30).toISOString(), to.toISOString());
    },
  });
  const inProject = new Set(members.map((m) => m.userId));
  const candidates = (team.data ?? [])
    .filter((m: Member) => m.role !== 'viewer' && !inProject.has(m.userId))
    .map((m) => ({ value: m.userId, label: m.displayName ?? 'Persona sin nombre' }));
  return (
    <div className="flex flex-col gap-3">
      {time.data && <p className="text-sm text-fg-muted">Tiempo registrado en el proyecto en los últimos 30 días, por persona.</p>}
      <ProjectMemberList
        members={members}
        myUserId={me}
        canManage={manage}
        candidates={candidates}
        seconds={time.data ? new Map(time.data.map((r) => [r.userId, r.seconds])) : undefined}
        onSetRole={(userId, role) => void act(() => cloud.setProjectMember(project.id, userId, role))}
        onRemove={(userId) => void act(() => cloud.removeProjectMember(project.id, userId))}
      />
    </div>
  );
}
