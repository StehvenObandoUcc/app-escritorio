import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Play } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { SessionProvider } from '@/app/session';
import { createMockCloud, type MockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { SyncEngine } from '@/sync/engine';
import { CATEGORIES, type TimeEntry } from '@/bridge/contract';
import { createMockBridge, sampleDay } from '@/bridge/mock';
import { CATEGORY_STYLE } from '@/lib/categories';
import { Avatar, Badge, Button, CategoryMark, Heading, Input, ProgressBar, Select, Surface } from '@/ui/atoms';
import {
  CategoryBreakdown,
  EmptyState,
  FormField,
  EstimateInput,
  HorizontalBarList,
  PasswordField,
  ProjectCard,
  ProjectProgress,
  SegmentedControl,
  StackedBarChart,
  SyncStatus,
  TaskFilters,
  TaskForm,
  TimeEntryForm,
  TimerControl,
} from '@/ui/molecules';
import type { Presence, Project, ReportRun, Task, TeamDashboard } from '@/cloud/contract';
import { NO_FILTER, taskTree } from '@/lib/tasks';
import { appTotals, buildTimeline } from '@/lib/activity';
import {
  ActivityList,
  ActivityTimeline,
  AlertBanner,
  AppSummary,
  ConsentPanel,
  HiddenAppsPicker,
  MemberList,
  ProjectMemberList,
  PulseStrip,
  ReportHistory,
  ReportView,
  ReviewForm,
  ReviewTemplateEditor,
  TaskBoard,
  TaskList,
  TaskDetails,
  TaskReview,
  TaskSidebar,
  TaskWorkflow,
  TimeEntryList,
} from '@/ui/organisms';
import { AuthLayout, PageLayout } from '@/ui/templates';
import { MyRangeView } from '@/pages/mi-dia/MyRangeView';
import { DashboardBody, TableroPage } from '@/pages/tablero/TableroPage';
import { PresenceSection } from '@/pages/tablero/sections';
import { formatDuration } from '@/lib/time';
import { errorMessage, t } from '@/i18n';
import { MiPrivacidadSection } from '@/pages/ajustes/MiPrivacidadSection';
import { TeamSettingsSection } from '@/pages/equipo/AjustesEquipo';
import { AuditoriaTab } from '@/pages/equipo/AuditoriaTab';
import { ReglasPorApp } from '@/pages/equipo/ReglasPorApp';
import { useSession } from '@/app/session';

const SWATCHES = [
  ['canvas', 'bg-canvas'],
  ['surface', 'bg-surface'],
  ['sunken', 'bg-sunken'],
  ['line-strong', 'bg-line-strong'],
  ['fg-muted', 'bg-fg-muted'],
  ['fg', 'bg-fg'],
  ['accent', 'bg-accent'],
  ['accent-soft', 'bg-accent-soft'],
  ['danger', 'bg-danger'],
] as const;

const noop = () => {};

const SAMPLE_ENTRIES: TimeEntry[] = [
  { id: '00000000-0000-4000-8000-0000000000a1', startedAt: '2026-10-01T09:00:00-05:00', endedAt: '2026-10-01T10:30:00-05:00', taskId: null, source: 'manual' },
  { id: '00000000-0000-4000-8000-0000000000a2', startedAt: '2026-10-01T11:00:00-05:00', endedAt: '2026-10-01T11:45:00-05:00', taskId: null, source: 'timer' },
  { id: '00000000-0000-4000-8000-0000000000a3', startedAt: '2026-10-01T14:00:00-05:00', endedAt: null, taskId: null, source: 'timer' },
];

/**
 * Galería de componentes (solo desarrollo): #/dev/galeria
 * Regla: todo átomo, molécula y organismo nuevo se agrega aquí con sus variantes.
 */
export function GaleriaPage() {
  const day = sampleDay('2026-10-01');
  return (
    <PageLayout
      title="Galería"
      subtitle="Todos los componentes de Pulso en un solo lugar. Cambia el ancho de la ventana y el tema para revisarlos."
    >
      <Section title="Tokens de color">
        <div className="flex flex-wrap gap-3">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1 text-xs text-fg-muted">
              <span className={`size-12 rounded-md border border-line ${cls}`} />
              {name}
            </div>
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <CategoryMark category={c} />
              {CATEGORY_STYLE[c].label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía">
        <p className="font-display text-display font-semibold tracking-tight tabular-nums">01:24:08</p>
        <Heading level={1}>Título de página</Heading>
        <Heading level={2}>Título de sección</Heading>
        <Heading level={3}>Título de grupo</Heading>
        <p>Texto base de 15 px para la lectura cómoda en una app de escritorio.</p>
        <p className="text-sm text-fg-muted">Texto de apoyo de 13 px.</p>
      </Section>

      <Section title="Átomos">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Play size={16} aria-hidden="true" />}>
            Iniciar temporizador
          </Button>
          <Button>Guardar cambios</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger">Eliminar tarea</Button>
          <Button size="sm">Pequeño</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Pendiente</Badge>
          <Badge tone="accent">ChatGPT</Badge>
          <Badge tone="danger">Vencida</Badge>
          <Avatar name="Stehven Obando" />
          <Avatar name="Laura" />
        </div>
        <div className="max-w-80">
          <Input placeholder="Buscar tareas" aria-label="Buscar tareas" />
        </div>
        <div className="max-w-80">
          <ProgressBar value={0.62} label="Avance del proyecto" />
        </div>
      </Section>

      <Section title="Moléculas">
        <div className="max-w-80">
          <FormField label="Correo" type="email" placeholder="tu@correo.com" hint="Lo usarás para iniciar sesión." />
        </div>
        <div className="max-w-80">
          <FormField
            label="Contraseña"
            type="password"
            defaultValue="123"
            error="Usa al menos 8 caracteres."
          />
        </div>
        <TimerControl
          running
          elapsedSeconds={5048}
          state="tracking"
          onStart={noop}
          onStop={noop}
          onBreakToggle={noop}
          onPauseToggle={noop}
        />
        <TimerControl
          running={false}
          elapsedSeconds={0}
          state="tracking"
          onStart={noop}
          onStop={noop}
          onBreakToggle={noop}
          onPauseToggle={noop}
          pauseMinutes={10}
        />
        <TimerControl
          running={false}
          elapsedSeconds={0}
          state="tracking"
          onStart={noop}
          onStop={noop}
          onBreakToggle={noop}
          onPauseToggle={noop}
          pauseMinutes={0}
          pauseDisabledReason={t('pause.capReached', { min: 30 })}
        />
        <div className="max-w-96">
          <CategoryBreakdown
            totals={day.totals}
            categories={['productive', 'ai', 'neutral', 'distraction', 'break']}
          />
        </div>
        <div className="max-w-xl">
          <TimeEntryForm
            initial={{ date: '2026-10-01', start: '', end: '' }}
            submitLabel="Guardar entrada"
            onSubmit={() => Promise.reject(new Error('El fin debe ser posterior al inicio.'))}
          />
        </div>
        <SegmentedControl label="Vista de ejemplo" options={VIEW_OPTIONS} value="resumen" onChange={() => {}} />
        <PasswordField label="Contraseña de ejemplo" hint="Al menos 8 caracteres." defaultValue="secreto-123" />
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label="Rol de ejemplo" options={ROLE_OPTIONS} defaultValue="member" />
          <Select aria-label="Rol de ejemplo pequeño" size="sm" options={ROLE_OPTIONS} defaultValue="viewer" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <SyncStatus phase="synced" lastSyncedAt={new Date().toISOString()} />
          <SyncStatus phase="pending" message="Sin conexión. Se subirá al volver la red." />
          <SyncStatus phase="syncing" />
          <SyncStatus phase="error" message="El servidor no aceptó tus datos. Revisa en Equipo que sigas en el equipo." />
          <SyncStatus phase="off" />
        </div>
        <EmptyState
          title="No tienes tareas asignadas"
          description="Cuando alguien te asigne una tarea, aparecerá aquí."
          action={<Button variant="primary">Crear tarea</Button>}
        />
      </Section>

      <Section title="Organismos">
        <PulseStrip blocks={day.blocks} summary="Franja de pulso de ejemplo" />
        <Surface padding="flush">
          <AppSummary totals={appTotals(day.blocks)} />
        </Surface>
        <Surface padding="flush">
          <ActivityTimeline rows={buildTimeline(day.blocks)} />
        </Surface>
        <Surface padding="flush">
          <ActivityList blocks={day.blocks.slice(0, 4)} />
        </Surface>
        <Surface padding="flush">
          <TimeEntryList entries={SAMPLE_ENTRIES} onUpdate={() => Promise.resolve()} onDelete={() => Promise.resolve()} />
        </Surface>
        <Surface>
          <HiddenAppsPicker
            candidates={[
              { process: 'brave', label: 'Brave', group: 'recent' },
              { process: 'whatsapp.root', label: 'WhatsApp', group: 'open' },
              { process: 'windowsterminal', label: 'Terminal', group: 'installed' },
            ]}
            selected={['windowsterminal']}
            onChange={() => {}}
          />
        </Surface>
        <Surface>
          <MemberList members={SAMPLE_MEMBERS} myUserId={SAMPLE_MEMBERS[0]!.userId} myRole="owner" onChangeRole={() => {}} onRemove={() => {}} />
        </Surface>
        <div className="overflow-hidden rounded-lg border border-line">
          <AuthLayout title="Hola de nuevo" subtitle="Plantilla de la pantalla de acceso.">
            <Button variant="primary" className="w-full">
              Iniciar sesión
            </Button>
          </AuthLayout>
        </div>
        <div className="relative min-h-32">
          <AlertBanner alerts={[{ domain: 'youtube.com', at: new Date().toISOString() }]} onDismiss={() => {}} />
        </div>
        <ConsentPanel teamName="Equipo de ejemplo" acceptLabel="Aceptar y unirme" onAccept={() => {}} secondary={<Button>Rechazar invitación</Button>} />
      </Section>

      <Section title="Proyectos y tareas (F3)">
        <ProjectProgress tasksDone={3} tasksTotal={5} loggedSeconds={4 * 3600} estimateMinutes={300} />
        <ProjectProgress tasksDone={1} tasksTotal={2} loggedSeconds={3 * 3600} estimateMinutes={120} />
        <div className="grid gap-3 md:grid-cols-2">
          <ProjectCard project={SAMPLE_PROJECT} overdue={1} href="#/dev/galeria" />
          <ProjectCard project={{ ...SAMPLE_PROJECT, name: 'Proyecto archivado', archivedAt: '2026-10-01T00:00:00Z', pendingReviews: 0 }} overdue={0} href="#/dev/galeria" />
        </div>
        <TaskFilters filter={NO_FILTER} onChange={() => {}} people={PEOPLE} labels={['diseño', 'cliente']} count={SAMPLE_TASKS.length} />
        <TaskList {...TASK_VIEW} />
        <TaskBoard {...TASK_VIEW} />
        <TaskForm people={PEOPLE} manage isNew submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={() => {}} />
        <EstimateInput minutes={960} onChange={() => {}} />
        <TaskWorkflow task={SAMPLE_TASKS[1]!} steps={{ primary: 'review', secondary: [] }} waitingFor={null} onStep={() => {}} />
        <TaskWorkflow task={{ status: 'doing' }} steps={{ primary: 'submit', secondary: ['complete'] }} waitingFor="Beto Ruiz" onStep={() => {}} />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <TaskDetails
              task={SAMPLE_TASKS[0]!}
              subtasks={[SAMPLE_TASKS[3]!]}
              isSubtask={false}
              canEditCriteria
              canAddSubtask
              nameOf={TASK_VIEW.nameOf}
              onCriteria={async () => {}}
              onAddSubtask={() => {}}
              onOpenTask={() => {}}
            />
            <TaskReview
              task={SAMPLE_TASKS[1]!}
              project={SAMPLE_PROJECT}
              me={PEOPLE[0]!.value}
              readOnly={false}
              nameOf={TASK_VIEW.nameOf}
              onDecide={async () => {}}
              onOpenLink={() => {}}
              onOpenEvidence={() => {}}
            />
          </div>
          <Surface className="h-fit">
            <TaskSidebar
              task={{ ...SAMPLE_TASKS[0]!, assigneeId: null }}
              project={SAMPLE_PROJECT}
              me={PEOPLE[0]!.value}
              nameOf={TASK_VIEW.nameOf}
              people={PEOPLE}
              readOnly={false}
              timer={{ running: false, onThis: false }}
              onCollaborators={async () => {}}
              onTimer={() => {}}
            />
          </Surface>
        </div>
        <ReviewForm mode="complete" task={SAMPLE_TASKS[0]!} template={SAMPLE_PROJECT.reviewTemplate} reviewers={PEOPLE} onSubmit={async () => {}} onCancel={() => {}} />
        <ReviewTemplateEditor fields={SAMPLE_PROJECT.reviewTemplate} onSave={async () => {}} />
        <ProjectMemberList
          members={[
            { userId: PEOPLE[0]!.value, role: 'lead', displayName: 'Ana Gómez' },
            { userId: PEOPLE[1]!.value, role: 'contributor', displayName: 'Beto Ruiz' },
          ]}
          myUserId={PEOPLE[0]!.value}
          canManage
          candidates={[{ value: '00000000-0000-4000-8000-000000000103', label: 'Caro Díaz' }]}
          seconds={new Map([[PEOPLE[0]!.value, 5400], [PEOPLE[1]!.value, 1800]])}
          onSetRole={() => {}}
          onRemove={() => {}}
        />
      </Section>
      <Section title="Reportes (F4)">
        <ReportView report={SAMPLE_REPORT} title="Mi trabajo" onExport={() => {}} />
        <ReportView report={{ ...SAMPLE_REPORT, validation: 'fallback', validatedBy: 'client', mode: 'own_key' }} title="Plantilla de respaldo" />
        <ReportHistory reports={[SAMPLE_REPORT, { ...SAMPLE_REPORT, id: '00000000-0000-4000-8000-000000000302', mode: 'manual' }]} selectedId={SAMPLE_REPORT.id} titleOf={() => 'Mi trabajo'} onOpen={() => {}} />
      </Section>
      <Section title={t('charts.gallerySection')}>
        <StackedBarChart data={SAMPLE_BARS} unit={t('charts.galleryHours')} label={t('charts.galleryWeek')} formatValue={(h) => formatDuration(h * 3600)} />
        <HorizontalBarList
          label={t('charts.galleryProjects')}
          formatValue={formatDuration}
          items={[
            // Datos de muestra
            { key: 'p1', label: 'Pulso', value: 7200 },
            { key: 'p1/t1', label: 'Gráficas de la semana', value: 5400, depth: 1 },
            { key: 'p1/t2', label: 'Pruebas de interfaz', value: 1800, depth: 1 },
            { key: 'p2', label: 'Taller de serverless', value: 3000 },
            { key: 'none', label: 'Sin tarea', value: 900 },
          ]}
        />
        <HorizontalBarList label={t('charts.galleryEmpty')} formatValue={formatDuration} items={[]} />
        <MyRangeView bridge={GALLERY_BRIDGE} kind="week" range={{ from: '2026-10-05', to: '2026-10-11' }} canGoNext onShift={noop} />
      </Section>
      <Section title={t('teamSettings.galleryTitle')}>
        <GalleryEquipo />
      </Section>
      <Section title={t('myPrivacy.galleryTitle')}>
        <GalleryEquipo privacy />
      </Section>
      <Section title={t('dashboard.galleryTitle')}>
        <Heading level={3}>{t('dashboard.galleryPage')}</Heading>
        <GalleryTablero />
        <Heading level={3}>{t('dashboard.galleryOwner')}</Heading>
        <PresenceSection people={SAMPLE_PRESENCE} />
        <DashboardBody data={SAMPLE_DASHBOARD} periodLabel={t('dashboard.periods.this_week')} />
        <Heading level={3}>{t('dashboard.galleryLead')}</Heading>
        <DashboardBody
          data={{ ...SAMPLE_DASHBOARD, role: 'member', isLead: true, members: [], topApps: [], leadMembers: SAMPLE_DASHBOARD.members.map((m) => ({ userId: m.userId, name: m.name, projectHours: m.hoursActive / 2, aiHoursInProjects: m.aiHours / 2, tasksDoing: m.tasksDoing })) }}
          periodLabel={t('dashboard.periods.this_week')}
        />
        <Heading level={3}>{t('dashboard.galleryViewer')}</Heading>
        <DashboardBody data={{ ...SAMPLE_DASHBOARD, role: 'viewer', members: [], topApps: [] }} periodLabel={t('dashboard.periods.this_week')} />
        <Heading level={3}>{t('dashboard.galleryFew')}</Heading>
        <DashboardBody data={{ ...SAMPLE_DASHBOARD, role: 'viewer', totals: null, perDay: [], members: [], topApps: [] }} periodLabel={t('dashboard.periods.this_week')} />
      </Section>
    </PageLayout>
  );
}

const SAMPLE_CATS = (productive: number, ai: number, neutral: number, distraction: number) => ({ productive, ai, neutral, distraction });
const SAMPLE_TASK = (id: string, title: string, projectName: string) => ({ id, title, projectId: '00000000-0000-4000-8000-0000000004f0', projectName });

const SAMPLE_PRESENCE: Presence[] = [
  { userId: '00000000-0000-4000-8000-000000000401', name: 'Ana Gómez', state: 'active', since: '2026-10-13T08:05:00-05:00' },
  { userId: '00000000-0000-4000-8000-000000000402', name: 'Beto Ruiz', state: 'break', since: '2026-10-13T09:40:00-05:00' },
  { userId: '00000000-0000-4000-8000-000000000403', name: null, state: 'offline', since: null },
];

/** Datos de muestra: tablero tal como lo entrega `team_dashboard` a owner y admin. */
const SAMPLE_DASHBOARD: TeamDashboard = {
  role: 'owner',
  isLead: false,
  totals: {
    members: 3,
    hoursActive: 52.5,
    hoursProductive: 31,
    hoursCategory: SAMPLE_CATS(31, 9.5, 8, 4),
    aiHours: 9.5,
    aiSessions: 14,
    aiTool: { claude: 5.5, chatgpt: 3, other: 1 },
    aiUsage: { code: 5, writing: 2, analysis: 1.5, other: 0.5, untagged: 0.5 },
    tasksDoing: 4,
    tasksDone: 11,
  },
  perDay: [
    ['2026-10-12', 11, 3, 2, 1],
    ['2026-10-13', 10, 3.5, 3, 2],
    ['2026-10-14', 10, 3, 3, 1],
  ].map(([day, p, a, n, d]) => ({ day: String(day), hoursCategory: SAMPLE_CATS(Number(p), Number(a), Number(n), Number(d)) })),
  members: [
    {
      userId: '00000000-0000-4000-8000-000000000401',
      name: 'Ana Gómez',
      shareAppNames: true,
      hoursActive: 22,
      hoursProductive: 14,
      hoursCategory: SAMPLE_CATS(14, 4, 3, 1),
      aiHours: 4,
      aiSessions: 6,
      capacityHours: 30,
      capacityShare: 73,
      tasksDoing: [SAMPLE_TASK('00000000-0000-4000-8000-0000000004a1', 'Tablero del equipo', 'Pulso')],
    },
    {
      userId: '00000000-0000-4000-8000-000000000402',
      name: 'Beto Ruiz',
      shareAppNames: false,
      hoursActive: 18.5,
      hoursProductive: 10,
      hoursCategory: SAMPLE_CATS(10, 3.5, 3, 2),
      aiHours: 3.5,
      aiSessions: 5,
      capacityHours: 30,
      capacityShare: 62,
      tasksDoing: [],
    },
    {
      userId: '00000000-0000-4000-8000-000000000403',
      name: null,
      shareAppNames: true,
      hoursActive: 12,
      hoursProductive: 7,
      hoursCategory: SAMPLE_CATS(7, 2, 2, 1),
      aiHours: 2,
      aiSessions: 3,
      capacityHours: 0,
      capacityShare: null,
      tasksDoing: [SAMPLE_TASK('00000000-0000-4000-8000-0000000004a2', 'Taller de serverless', 'Universidad'), SAMPLE_TASK('00000000-0000-4000-8000-0000000004a3', 'Pruebas de interfaz', 'Pulso')],
    },
  ],
  leadMembers: [],
  topApps: [
    { appName: 'Visual Studio Code', hours: 20.5 },
    { appName: 'Google Chrome', hours: 14 },
    { appName: 'Claude', hours: 5.5 },
  ],
};

const GALLERY_BRIDGE = createMockBridge();

/**
 * La página completa con la nube simulada (sin red): una cuenta propietaria en un equipo de ejemplo, con
 * `teamDashboard` y `teamPresence` devolviendo datos de muestra. Tiene su propia sesión, aparte de la de la app.
 */
function GalleryTablero() {
  const [demo, setDemo] = useState<{ cloud: MockCloud; engine: SyncEngine } | null>(null);
  useEffect(() => {
    let alive = true;
    const cloud = createMockCloud();
    const owner = cloud.debug.addAccount('galeria@pulso.test', 'secreto-123', 'Ana Gómez');
    const team = cloud.debug.addTeam('Equipo de muestra', owner);
    cloud.teamDashboard = async () => SAMPLE_DASHBOARD;
    cloud.teamPresence = async () => SAMPLE_PRESENCE;
    void cloud
      .signIn('galeria@pulso.test', 'secreto-123')
      .then(() => cloud.giveConsent(team, CONSENT_VERSION))
      .then(() => alive && setDemo({ cloud, engine: new SyncEngine({ bridge: GALLERY_BRIDGE, cloud, setTimer: () => () => {} }) }));
    return () => {
      alive = false;
    };
  }, []);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  if (!demo) return <p role="status">{t('common.loading')}</p>;
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider cloud={demo.cloud} bridge={GALLERY_BRIDGE} engine={demo.engine}>
        <div className="rounded-lg border border-line">
          <TableroPage />
        </div>
      </SessionProvider>
    </QueryClientProvider>
  );
}

const GALLERY_AUDIT_ACTIONS = ['team_created', 'invitation_sent', 'invitation_accepted', 'role_changed', 'settings_changed', 'member_removed'] as const;

/**
 * Equipo (F5) con la nube simulada: ajustes del equipo con valores de ejemplo, auditoría con filas de ejemplo
 * (incluye a un exmiembro y una acción del sistema) y reglas por app. Tiene su propia sesión.
 */
function GalleryEquipo({ privacy = false }: { privacy?: boolean }) {
  const [demo, setDemo] = useState<{ cloud: MockCloud; engine: SyncEngine } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const cloud = createMockCloud();
    const owner = cloud.debug.addAccount('equipo-galeria@pulso.test', 'secreto-123', 'Ana Gómez');
    const team = cloud.debug.addTeam('Equipo de muestra', owner);
    const luis = cloud.debug.addAccount('luis-galeria@pulso.test', 'secreto-123', 'Luis Pardo');
    cloud.debug.addMember(team, luis, 'member', true);
    GALLERY_AUDIT_ACTIONS.forEach((action, i) =>
      cloud.debug.audit.push({
        teamId: team,
        id: i + 1,
        action,
        actorId: i === 0 ? null : i === 5 ? crypto.randomUUID() : owner,
        targetUserId: action === 'role_changed' || action === 'invitation_accepted' ? luis : null,
        details: {},
        createdAt: `2026-10-0${i + 1}T14:${10 + i}:00Z`,
      }),
    );
    void cloud
      .signIn('equipo-galeria@pulso.test', 'secreto-123')
      .then(() => cloud.giveConsent(team, CONSENT_VERSION))
      .then(() =>
        cloud.setTeamSettings(team, {
          idleMinutes: 7,
          workday: { days: [1, 2, 3, 4, 5], start: '08:30', end: '17:30' },
          aiCountsAsProductive: true,
          presenceVisibleToMembers: false,
          pauseCapMinutes: 60,
        }),
      )
      .then(() => cloud.addProcessRule(team, 'Code.exe', 'productive'))
      .then(() => cloud.addProcessRule(team, 'Spotify.exe', 'distraction'))
      .then(() => alive && setDemo({ cloud, engine: new SyncEngine({ bridge: GALLERY_BRIDGE, cloud, setTimer: () => () => {} }) }))
      .catch((cause) => alive && setFailure(errorMessage(cause)));
    return () => {
      alive = false;
    };
  }, []);
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  if (failure) return <p role="alert" className="text-sm text-danger">{t('teamSettings.galleryError', { error: failure })}</p>;
  if (!demo) return <p role="status">{t('common.loading')}</p>;
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider cloud={demo.cloud} bridge={GALLERY_BRIDGE} engine={demo.engine}>
        <GalleryEquipoPieces privacy={privacy} />
      </SessionProvider>
    </QueryClientProvider>
  );
}

function GalleryEquipoPieces({ privacy }: { privacy: boolean }) {
  const { activeTeam } = useSession();
  if (!activeTeam) return <p role="status">{t('common.loading')}</p>;
  if (privacy) return <MiPrivacidadSection bridge={GALLERY_BRIDGE} />;
  return (
    <div className="flex flex-col gap-4">
      <TeamSettingsSection team={activeTeam} />
      <AuditoriaTab team={activeTeam} />
      <ReglasPorApp team={activeTeam} />
    </div>
  );
}

/** Datos de muestra: una semana de ejemplo, en horas. */
const SAMPLE_BARS = [
  ['lun 5', 3.5, 1, 0.5, 0.2],
  ['mar 6', 4, 1.5, 0.8, 0.3],
  ['mié 7', 2.5, 2, 1, 0],
  ['jue 8', 5, 0.5, 0.4, 0.6],
  ['vie 9', 3, 1, 0.3, 0.1],
  ['sáb 10', 0, 0, 0, 0],
  ['dom 11', 0.5, 0, 0.2, 0],
].map(([label, productive, ai, neutral, distraction]) => ({
  label: label as string,
  segments: [
    { key: 'productive' as const, value: productive as number },
    { key: 'ai' as const, value: ai as number },
    { key: 'neutral' as const, value: neutral as number },
    { key: 'distraction' as const, value: distraction as number },
  ],
}));

const PEOPLE = [
  { value: '00000000-0000-4000-8000-000000000101', label: 'Ana Gómez' },
  { value: '00000000-0000-4000-8000-000000000102', label: 'Beto Ruiz' },
];

const SAMPLE_PROJECT: Project = {
  id: '00000000-0000-4000-8000-000000000201',
  name: 'Sitio web',
  archivedAt: null,
  myRole: 'lead',
  reviewTemplate: [
    { key: 'summary', label: 'Qué se hizo', kind: 'text', required: true },
    { key: 'evidence', label: 'Evidencia', kind: 'url', required: false },
    { key: 'tests', label: 'Pruebas pasan', kind: 'checklist', required: true },
    { key: 'report', label: 'Informe', kind: 'file', required: false },
    { key: 'shots', label: 'Capturas', kind: 'image', required: false },
  ],
  tasksTotal: 4,
  tasksDone: 1,
  pendingReviews: 1,
  loggedSeconds: 5 * 3600,
  estimateMinutes: 16 * 60,
};

const sampleTask = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  projectId: SAMPLE_PROJECT.id,
  parentId: null,
  type: 'task',
  title: 'Tarea',
  description: '',
  assigneeId: null,
  assigneeCanManage: false,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
  loggedSeconds: 0,
  startedAt: null,
  completedAt: null,
  createdBy: PEOPLE[0]!.value,
  updatedAt: new Date().toISOString(),
  collaborators: [],
  criteria: [],
  pendingReview: null,
  evidence: [],
  ...over,
});

const PARENT_ID = '00000000-0000-4000-8000-000000000301';
const SAMPLE_TASKS: Task[] = [
  sampleTask({
    title: 'Diseñar la portada',
    assigneeId: PEOPLE[1]!.value,
    collaborators: [PEOPLE[0]!.value],
    labels: ['diseño'],
    estimateMinutes: 960,
    loggedSeconds: 2700,
    dueDate: '2026-10-20',
    criteria: [
      { id: '00000000-0000-4000-8000-000000000401', text: 'Funciona en móvil', met: false },
      { id: '00000000-0000-4000-8000-000000000402', text: 'Aprobada por el cliente', met: false },
    ],
  }),
  sampleTask({
    id: PARENT_ID,
    type: 'bug',
    title: 'Revisar el contrato con el cliente',
    assigneeId: PEOPLE[0]!.value,
    status: 'review',
    labels: ['cliente'],
    dueDate: '2026-10-01',
    pendingReview: {
      id: '00000000-0000-4000-8000-000000000501',
      submittedBy: PEOPLE[1]!.value,
      reviewerId: PEOPLE[0]!.value,
      answers: { summary: 'Revisé las cláusulas 3 a 7 con el abogado.', tests: 'true', report: '00000000-0000-4000-8000-000000000601' },
      links: ['https://docs.ejemplo.com/contrato'],
      createdAt: '2026-10-07T15:00:00Z',
      attachments: [{ id: '00000000-0000-4000-8000-000000000601', path: 'x/y/z/acta.pdf', name: 'acta.pdf', size: 20480, contentType: 'application/pdf' }],
    },
  }),
  sampleTask({ title: 'Publicar la versión 1', type: 'improvement', status: 'done', estimateMinutes: 30, loggedSeconds: 2400 }),
  sampleTask({ title: 'Firmar el anexo', parentId: PARENT_ID, assigneeId: PEOPLE[1]!.value, status: 'doing' }),
];

const TASK_VIEW = {
  tree: taskTree(SAMPLE_TASKS, NO_FILTER, PEOPLE[0]!.value),
  nameOf: (id: string | null) => PEOPLE.find((p) => p.value === id)?.label ?? null,
  today: '2026-10-08',
  primaryStep: (t: Task) => (t.status === 'todo' ? ('start' as const) : t.status === 'review' ? ('review' as const) : null),
  onStep: () => {},
  onOpen: () => {},
};

const VIEW_OPTIONS = [
  { value: 'resumen', label: 'Por app' },
  { value: 'linea', label: 'Línea de tiempo' },
  { value: 'detalle', label: 'Detalle' },
];

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Administrador' },
  { value: 'member', label: 'Miembro' },
  { value: 'viewer', label: 'Observador' },
];

const SAMPLE_MEMBERS = [
  { userId: '00000000-0000-4000-8000-000000000101', role: 'owner' as const, displayName: 'Ana Gómez' },
  { userId: '00000000-0000-4000-8000-000000000102', role: 'admin' as const, displayName: 'Beto Ruiz' },
  { userId: '00000000-0000-4000-8000-000000000103', role: 'member' as const, displayName: 'Caro Díaz' },
  { userId: '00000000-0000-4000-8000-000000000104', role: 'viewer' as const, displayName: null },
];

const SAMPLE_REPORT: ReportRun = {
  id: '00000000-0000-4000-8000-000000000301',
  teamId: '00000000-0000-4000-8000-000000000201',
  scope: 'personal',
  subjectId: '00000000-0000-4000-8000-000000000101',
  period: 'yesterday',
  periodFrom: '2026-10-07',
  periodTo: '2026-10-07',
  facts: [
    { id: 'F1', metric: 'hours_active', dimension: null, value: 6.5, unit: 'h' },
    { id: 'F2', metric: 'share_category', dimension: 'ai', value: 23, unit: '%' },
    { id: 'F3', metric: 'hours_ai_usage', dimension: 'code', value: 1.2, unit: 'h' },
    { id: 'F4', metric: 'tasks_done', dimension: null, value: 3, unit: 'n' },
    { id: 'F5', metric: 'cycle_days_avg', dimension: null, value: 1.5, unit: 'd' },
  ],
  narrative: {
    summary: 'Día con 6,5 h activas y 3 tareas terminadas.',
    insights: [{ text: 'La IA ocupó el 23 % del tiempo activo, sobre todo en código.', fact_ids: ['F2', 'F3'] }],
    recommendations: [{ text: 'Etiqueta tus sesiones de IA para ver mejor en qué ayudan.', fact_ids: ['F3'] }],
    insufficient_data: false,
  },
  mode: 'free',
  validation: 'ok',
  validatedBy: 'server',
  language: 'es',
  dataUntil: '2026-10-07T22:40:00Z',
  createdBy: '00000000-0000-4000-8000-000000000101',
  createdAt: '2026-10-08T13:05:00Z',
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface as="section" className="flex flex-col gap-4">
      <Heading level={2}>{title}</Heading>
      {children}
    </Surface>
  );
}
