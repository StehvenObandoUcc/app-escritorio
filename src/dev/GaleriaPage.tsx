import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { CATEGORIES, type TimeEntry } from '@/bridge/contract';
import { sampleDay } from '@/bridge/mock';
import { CATEGORY_STYLE } from '@/lib/categories';
import { Avatar, Badge, Button, CategoryMark, Heading, Input, ProgressBar, Select, Surface } from '@/ui/atoms';
import {
  CategoryBreakdown,
  EmptyState,
  FormField,
  PasswordField,
  ProjectProgress,
  SegmentedControl,
  SyncStatus,
  TaskFilters,
  TaskForm,
  TimeEntryForm,
  TimerControl,
} from '@/ui/molecules';
import type { Task } from '@/cloud/contract';
import { NO_FILTER } from '@/lib/tasks';
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
  TaskBoard,
  TaskList,
  TimeEntryList,
} from '@/ui/organisms';
import { AuthLayout, PageLayout } from '@/ui/templates';

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
        <TaskFilters filter={NO_FILTER} onChange={() => {}} people={PEOPLE} labels={['diseño', 'cliente']} count={SAMPLE_TASKS.length} />
        <TaskList {...TASK_VIEW} />
        <TaskBoard {...TASK_VIEW} />
        <TaskForm people={PEOPLE} submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={() => {}} />
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
    </PageLayout>
  );
}

const PEOPLE = [
  { value: '00000000-0000-4000-8000-000000000101', label: 'Ana Gómez' },
  { value: '00000000-0000-4000-8000-000000000102', label: 'Beto Ruiz' },
];

const sampleTask = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  title: 'Tarea',
  description: '',
  assigneeId: null,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
  loggedSeconds: 0,
  createdBy: PEOPLE[0]!.value,
  updatedAt: new Date().toISOString(),
  ...over,
});

const SAMPLE_TASKS: Task[] = [
  sampleTask({ title: 'Diseñar la portada', assigneeId: PEOPLE[1]!.value, labels: ['diseño'], estimateMinutes: 120, loggedSeconds: 2700, dueDate: '2026-10-20' }),
  sampleTask({ title: 'Revisar el contrato con el cliente', assigneeId: PEOPLE[0]!.value, status: 'doing', labels: ['cliente'], dueDate: '2026-10-01' }),
  sampleTask({ title: 'Publicar la versión 1', status: 'done', estimateMinutes: 30, loggedSeconds: 2400 }),
];

const TASK_VIEW = {
  tasks: SAMPLE_TASKS,
  nameOf: (id: string | null) => PEOPLE.find((p) => p.value === id)?.label ?? null,
  today: '2026-10-08',
  canChangeStatus: (t: Task) => t.assigneeId === PEOPLE[0]!.value,
  onStatusChange: () => {},
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface as="section" className="flex flex-col gap-4">
      <Heading level={2}>{title}</Heading>
      {children}
    </Surface>
  );
}
