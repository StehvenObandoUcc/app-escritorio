/**
 * CONTRATO DE LA NUBE (interfaz ⇄ Supabase)
 *
 * Igual que el puente: las páginas solo hablan con Supabase a través de `Cloud`.
 * - `supabase.ts` usa Supabase real (Auth, tablas con RLS y funciones SQL de las migraciones).
 * - `mock.ts` guarda todo en memoria: sirve para `npm run dev` y para las pruebas.
 * Todo lo que llega de Supabase se valida con zod antes de usarse (ARQUITECTURA §5).
 * Los nombres de tablas y funciones son los de `supabase/migrations`; no se inventan aquí.
 */
import { z } from 'zod';
import { t, translateServerMessage } from '@/i18n';
import type { AiUsage, SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';

export const TEAM_ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
export const TeamRoleSchema = z.enum(TEAM_ROLES);
export type TeamRole = z.infer<typeof TeamRoleSchema>;

export interface CloudUser {
  id: string;
  email: string;
  emailVerified: boolean;
}

export const ProfileSchema = z.object({
  id: z.uuid(),
  displayName: z.string(),
  timezone: z.string(),
});
export type Profile = z.infer<typeof ProfileSchema>;

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
/** Jornada del equipo (A-1): días ISO (1 = lunes … 7 = domingo) y horas locales de cada persona. */
export const WorkdaySchema = z.object({
  days: z.array(z.number().int().min(1).max(7)),
  start: HHMM,
  end: HHMM,
});
export type Workday = z.infer<typeof WorkdaySchema>;
export const DEFAULT_WORKDAY: Workday = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };

export const MyTeamSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  role: TeamRoleSchema,
  consentAt: z.string().nullable(),
  consentVersion: z.string().nullable(),
  workday: WorkdaySchema,
  /** Política del equipo (ADR-0009): si cada persona puede ocultar apps. Por defecto, sí. */
  allowHiddenApps: z.boolean(),
  /** Aviso con sonido al entrar a un sitio no permitido (ADR-0010). Por defecto, sí, cada 10 min. */
  alertNotAllowed: z.boolean(),
  alertRepeatMinutes: z.number().int(),
});
export type MyTeam = z.infer<typeof MyTeamSchema>;

export const MemberSchema = z.object({
  userId: z.uuid(),
  role: TeamRoleSchema,
  /** null si su perfil aún no existe o no es visible */
  displayName: z.string().nullable(),
  joinedAt: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

export const TeamInvitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: TeamRoleSchema,
  expiresAt: z.string(),
  /** Código que quien invita comparte con la persona (ADR-0008). */
  code: z.string().nullable(),
});
export type TeamInvitation = z.infer<typeof TeamInvitationSchema>;

export const MyInvitationSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  teamName: z.string(),
  role: TeamRoleSchema,
  invitedByName: z.string().nullable(),
  expiresAt: z.string(),
});
export type MyInvitation = z.infer<typeof MyInvitationSchema>;

/** Regla del equipo por dominio (ADR-0009). `notAllowed`: sitio marcado como no permitido. */
export const DomainRuleSchema = z.object({
  id: z.uuid(),
  domain: z.string(),
  notAllowed: z.boolean(),
});
export type DomainRule = z.infer<typeof DomainRuleSchema>;

/** Tiempo por sitio y persona (`team_domain_summary`, solo owner y admin). */
export const DomainUsageSchema = z.object({
  userId: z.uuid(),
  domain: z.string(),
  category: z.string(),
  seconds: z.number(),
});
export type DomainUsage = z.infer<typeof DomainUsageSchema>;

// ---- Proyectos y tareas (F3 v2, ADR-0014, docs/specs/F3-proyectos-y-tareas.md) ----

export const PROJECT_ROLES = ['lead', 'contributor'] as const;
export const ProjectRoleSchema = z.enum(PROJECT_ROLES);
export type ProjectRole = z.infer<typeof ProjectRoleSchema>;

export const TASK_STATUSES = ['todo', 'doing', 'review', 'done'] as const;
export const TaskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
/** Estados que se ponen a mano; a «review» se llega enviando y a «done» aprobando. */
export type ManualStatus = 'todo' | 'doing';

export const TASK_TYPES = ['task', 'bug', 'improvement', 'research', 'meeting'] as const;
export const TaskTypeSchema = z.enum(TASK_TYPES);
export type TaskType = z.infer<typeof TaskTypeSchema>;

/** Campo del formulario de entrega del proyecto (fila 30). */
export const ReviewFieldSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,30}$/),
  label: z.string().min(1).max(80),
  /** text · url (enlace http/https) · checklist · image (imágenes subidas) · file (archivos subidos), ADR-0018 */
  kind: z.enum(['text', 'url', 'checklist', 'image', 'file']),
  required: z.boolean(),
});
export type ReviewField = z.infer<typeof ReviewFieldSchema>;

/** Proyecto visible con mi rol y su avance. `manager` = owner o admin del equipo. */
export const ProjectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  archivedAt: z.string().nullable(),
  myRole: z.enum(['manager', 'lead', 'contributor']),
  reviewTemplate: z.array(ReviewFieldSchema),
  tasksTotal: z.number().int().nonnegative(),
  tasksDone: z.number().int().nonnegative(),
  pendingReviews: z.number().int().nonnegative(),
  loggedSeconds: z.number().nonnegative(),
  estimateMinutes: z.number().nonnegative(),
});
export type Project = z.infer<typeof ProjectSchema>;

export const ProjectMemberSchema = z.object({
  userId: z.uuid(),
  role: ProjectRoleSchema,
  displayName: z.string().nullable(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

export const AttachmentSchema = z.object({
  id: z.uuid(),
  path: z.string(),
  name: z.string(),
  size: z.number(),
  contentType: z.string().default('application/octet-stream'),
});
export type Attachment = z.infer<typeof AttachmentSchema>;

export const PendingReviewSchema = z.object({
  id: z.uuid(),
  submittedBy: z.uuid().nullable(),
  reviewerId: z.uuid().nullable(),
  answers: z.record(z.string(), z.string()),
  links: z.array(z.string()),
  createdAt: z.string(),
  attachments: z.array(AttachmentSchema),
});
export type PendingReview = z.infer<typeof PendingReviewSchema>;

/** Tarea con su tiempo (el de una madre incluye el de sus subtareas), apoyos, criterios y revisión pendiente. */
export const TaskSchema = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  parentId: z.uuid().nullable(),
  type: TaskTypeSchema,
  title: z.string(),
  description: z.string(),
  assigneeId: z.uuid().nullable(),
  assigneeCanManage: z.boolean(),
  status: TaskStatusSchema,
  /** Evidencia que exige la tarea (claves del catálogo de src/lib/evidence.ts, ADR-0020). */
  evidence: z.array(z.string()).default([]),
  /** AAAA-MM-DD */
  dueDate: z.iso.date().nullable(),
  labels: z.array(z.string()),
  estimateMinutes: z.number().int().positive().nullable(),
  loggedSeconds: z.number().nonnegative(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdBy: z.uuid(),
  updatedAt: z.string(),
  collaborators: z.array(z.uuid()),
  criteria: z.array(z.object({ id: z.uuid(), text: z.string(), met: z.boolean() })),
  pendingReview: PendingReviewSchema.nullable(),
});
export type Task = z.infer<typeof TaskSchema>;

/** Todo el trabajo visible del equipo (`team_work`). También es la copia sin conexión. */
export const TeamWorkSchema = z.object({
  projects: z.array(ProjectSchema),
  tasks: z.array(TaskSchema),
  members: z.record(z.string(), z.array(ProjectMemberSchema)),
});
export type TeamWork = z.infer<typeof TeamWorkSchema>;

/** Campos que se escriben al crear o editar una tarea. */
export type TaskInput = Pick<
  Task,
  'title' | 'description' | 'type' | 'assigneeId' | 'assigneeCanManage' | 'dueDate' | 'labels' | 'estimateMinutes' | 'evidence'
> & { status: ManualStatus | TaskStatus };

/** Lo que solo se indica al crear: tarea madre, criterios y apoyos. */
export interface NewTaskExtras {
  parentId?: string | null;
  criteria?: string[];
  collaborators?: string[];
}

/**
 * Entrega de una tarea (ADR-0018). `answers`: respuesta de cada campo de texto, enlace o casilla.
 * `files`: archivos de cada campo de imagen o archivo; la nube los sube y responde ese campo con sus ids.
 */
export interface ReviewSubmission {
  answers: Record<string, string>;
  files: Record<string, File[]>;
  reviewerId: string | null;
  criteriaMet: string[];
}

export const HistorySchema = z.object({
  events: z.array(
    z.object({ kind: z.string(), actor: z.uuid().nullable(), actorName: z.string().nullable(), details: z.record(z.string(), z.unknown()), createdAt: z.string() }),
  ),
  reviews: z.array(
    PendingReviewSchema.extend({
      status: z.enum(['pending', 'approved', 'changes_requested']),
      decidedBy: z.uuid().nullable(),
      comment: z.string().nullable(),
      decidedAt: z.string().nullable(),
    }),
  ),
});
export type TaskHistory = z.infer<typeof HistorySchema>;

/** Tiempo por persona en un proyecto (fila 13 «P»). `userId` null = exmiembro. */
export const ProjectTimeSchema = z.object({ userId: z.uuid().nullable(), seconds: z.number() });
export type ProjectTime = z.infer<typeof ProjectTimeSchema>;

// ---- Reportes (F4, docs/specs/F4-ia-y-reportes.md) ----

export const REPORT_SCOPES = ['personal', 'project', 'team'] as const;
export type ReportScope = (typeof REPORT_SCOPES)[number];
export const REPORT_PERIODS = ['today', 'yesterday', 'this_week', 'last_week'] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];
export const REPORT_MODES = ['free', 'own_key', 'manual'] as const;
export type ReportMode = (typeof REPORT_MODES)[number];
export type ReportLanguage = 'es' | 'en';

/** Un hecho calculado por SQL (D-3). Las cifras de la pantalla salen de aquí, nunca del texto de la IA. */
export const FactSchema = z.object({
  id: z.string().regex(/^F\d+$/),
  metric: z.string(),
  dimension: z.string().nullable(),
  value: z.number(),
  unit: z.enum(['h', '%', 'n', 'd']),
});
export type Fact = z.infer<typeof FactSchema>;

export const ReportFactsSchema = z.object({
  facts: z.array(FactSchema),
  factsHash: z.string(),
  periodFrom: z.iso.date(),
  periodTo: z.iso.date(),
});
export type ReportFacts = z.infer<typeof ReportFactsSchema>;

const ReportItemSchema = z.object({ text: z.string(), fact_ids: z.array(z.string()) });
export const NarrativeSchema = z.object({
  summary: z.string(),
  insights: z.array(ReportItemSchema),
  recommendations: z.array(ReportItemSchema),
  insufficient_data: z.boolean(),
});
export type Narrative = z.infer<typeof NarrativeSchema>;

export const ReportRunSchema = z.object({
  id: z.uuid(),
  teamId: z.uuid(),
  scope: z.enum(REPORT_SCOPES),
  subjectId: z.uuid(),
  period: z.enum(REPORT_PERIODS),
  periodFrom: z.iso.date(),
  periodTo: z.iso.date(),
  facts: z.array(FactSchema),
  narrative: NarrativeSchema,
  mode: z.enum(REPORT_MODES),
  validation: z.enum(['ok', 'retried', 'fallback']),
  validatedBy: z.enum(['server', 'client']),
  language: z.enum(['es', 'en']),
  /** Hasta dónde llegan los datos (D-18): lo calcula el servidor. */
  dataUntil: z.string().nullable(),
  createdBy: z.uuid().nullable(),
  createdAt: z.string(),
});
export type ReportRun = z.infer<typeof ReportRunSchema>;

/** Qué reporte: alcance, sujeto (persona, proyecto o equipo) y periodo. */
export interface ReportRequest {
  teamId: string;
  scope: ReportScope;
  subjectId: string;
  period: ReportPeriod;
}

/** Motivo por el que el modo Gratis no generó el reporte (docs/IA.md §4). */
export const TRIAL_REASONS = ['disabled', 'cooldown', 'user_limit', 'team_limit', 'global_limit', 'provider', 'changed', 'facts', 'quota', 'save', 'bad_request', 'unauthorized'] as const;
export type TrialReason = (typeof TRIAL_REASONS)[number];

/** Error con un mensaje para la persona (qué pasó y qué hacer) y una clase para decidir qué hacer. */
export class CloudError extends Error {
  constructor(
    message: string,
    /** network: reintentar · forbidden: sin permiso · invalid: dato rechazado · auth: sesión o credenciales */
    readonly kind: 'network' | 'forbidden' | 'invalid' | 'auth' | 'unknown',
  ) {
    super(translateServerMessage(message));
    this.name = 'CloudError';
  }
}

/** Mensaje cuando el código de invitación no coincide (accept_invitation devuelve null). */
export const wrongInvitationCode = () => t('cloud.wrongCode');

export interface Cloud {
  /** "mock" = datos de ejemplo en memoria; "supabase" = proyecto real. */
  readonly source: 'mock' | 'supabase';

  // ---- Cuenta (CU-01 a CU-03) ----
  currentUser(): Promise<CloudUser | null>;
  /** Avisa cuando se inicia o se cierra la sesión. Devuelve la función para dejar de escuchar. */
  onUserChange(listener: (user: CloudUser | null) => void): () => void;
  /**
   * Crea la cuenta. Sin verificación de correo (ADR-0008) la sesión empieza al instante; si el
   * proyecto de Supabase aún exige confirmar el correo, envía el código y no hay sesión hasta verificarlo.
   */
  signUp(email: string, password: string, displayName: string): Promise<void>;
  verifySignUp(email: string, code: string): Promise<void>;
  resendSignUpCode(email: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(email: string, code: string, newPassword: string): Promise<void>;

  // ---- Perfil (CU-04) ----
  /** Lee el perfil y lo crea la primera vez (con el nombre del registro y la zona horaria del sistema). */
  ensureProfile(fallbackTimezone: string): Promise<Profile>;
  saveProfile(displayName: string, timezone: string): Promise<Profile>;

  // ---- Equipos (EQ-01 a EQ-08) ----
  myTeams(): Promise<MyTeam[]>;
  createTeam(name: string): Promise<string>;
  giveConsent(teamId: string, version: string): Promise<void>;
  members(teamId: string): Promise<Member[]>;
  setMemberRole(teamId: string, userId: string, role: TeamRole): Promise<void>;
  removeMember(teamId: string, userId: string): Promise<void>;
  leaveTeam(teamId: string): Promise<void>;

  // ---- Invitaciones (EQ-02, EQ-03) ----
  teamInvitations(teamId: string): Promise<TeamInvitation[]>;
  /** Devuelve el código que hay que compartir con la persona invitada. */
  invite(teamId: string, email: string, role: TeamRole): Promise<{ code: string }>;
  revokeInvitation(id: string): Promise<void>;
  myInvitations(): Promise<MyInvitation[]>;
  /** Exige el código de la invitación (ADR-0008). Devuelve el id del equipo. */
  acceptInvitation(id: string, code: string, consentVersion: string): Promise<string>;
  declineInvitation(id: string): Promise<void>;

  // ---- Sitios y políticas (ADR-0009, solo owner y admin escriben) ----
  setTeamPolicy(teamId: string, allowHiddenApps: boolean): Promise<void>;
  /** Avisos de sitio no permitido (ADR-0010): activados y cada cuántos minutos se repiten (0 = solo al entrar). */
  setAlertPolicy(teamId: string, enabled: boolean, repeatMinutes: number): Promise<void>;
  domainRules(teamId: string): Promise<DomainRule[]>;
  /** Marca un dominio como no permitido (cuenta como distracción). */
  addNotAllowedDomain(teamId: string, domain: string): Promise<void>;
  removeDomainRule(ruleId: string): Promise<void>;
  teamDomainSummary(teamId: string, from: string, to: string): Promise<DomainUsage[]>;

  // ---- Proyectos y tareas (F3 v2: filas 13 «P», 16 a 19 y 27 a 30 de docs/ROLES.md) ----
  /** Todo el trabajo visible del equipo en una sola lectura. */
  teamWork(teamId: string): Promise<TeamWork>;
  createProject(teamId: string, name: string): Promise<string>;
  setProjectArchived(projectId: string, archived: boolean): Promise<void>;
  /** Añade a alguien del equipo (no viewer) o le cambia el rol. */
  setProjectMember(projectId: string, userId: string, role: ProjectRole): Promise<void>;
  removeProjectMember(projectId: string, userId: string): Promise<void>;
  setReviewTemplate(projectId: string, fields: ReviewField[]): Promise<void>;
  createTask(projectId: string, input: TaskInput, extras?: NewTaskExtras): Promise<string>;
  updateTask(taskId: string, input: TaskInput): Promise<void>;
  setTaskStatus(taskId: string, status: ManualStatus): Promise<void>;
  setTaskCollaborators(taskId: string, userIds: string[]): Promise<void>;
  setTaskCriteria(taskId: string, texts: string[]): Promise<void>;
  /** Fila 31: asignarse una tarea sin responsable. */
  takeTask(taskId: string): Promise<void>;
  /** Fila 32: quien gestiona completa directamente con el formulario de entrega y la evidencia. */
  completeTask(task: Pick<Task, 'id' | 'projectId'>, teamId: string, submission: Omit<ReviewSubmission, 'reviewerId'>): Promise<string>;
  /** Fila 34: borra la tarea y sus subtareas; el tiempo se conserva sin tarea. */
  deleteTask(taskId: string): Promise<void>;
  /** Fila 33: owner y admin, escribiendo el nombre exacto. */
  deleteProject(projectId: string, confirmName: string): Promise<void>;
  /** Envía a revisión y sube los archivos de evidencia. Devuelve el id de la revisión. */
  submitForReview(task: Pick<Task, 'id' | 'projectId'>, teamId: string, submission: ReviewSubmission): Promise<string>;
  reviewTask(reviewId: string, approve: boolean, comment: string | null): Promise<void>;
  taskHistory(taskId: string): Promise<TaskHistory>;
  /** Enlace temporal para abrir un archivo de evidencia. */
  evidenceUrl(path: string): Promise<string>;
  projectTimeSummary(projectId: string, from: string, to: string): Promise<ProjectTime[]>;

  // ---- Reglas y sincronización (SY-02, SY-03) ----
  teamRules(teamId: string): Promise<TeamRule[]>;
  /** Suben con upsert por `id`: repetir una subida no duplica nada. */
  upsertBlocks(userId: string, rows: SyncBlock[]): Promise<void>;
  upsertEntries(userId: string, rows: SyncEntry[]): Promise<void>;
  upsertClosures(userId: string, rows: SyncClosure[]): Promise<void>;
  /** Etiqueta de IA de un bloque ya subido (F4 D-13); `null` la quita. */
  setBlockAiUsage(blockId: string, usage: AiUsage | null): Promise<void>;

  // ---- Reportes (F4, filas 20 a 22 y 35 a 37 de docs/ROLES.md) ----
  reportFacts(req: ReportRequest): Promise<ReportFacts>;
  /** Guarda con la forma comprobada en el servidor (D-6). Devuelve el id (el existente si ya había uno igual). */
  saveReport(req: ReportRequest, factsHash: string, narrative: Narrative, mode: ReportMode, validation: 'ok' | 'retried' | 'fallback', language: ReportLanguage): Promise<string>;
  /** Reporte guardado con la misma clave de caché (D-9). */
  findReport(req: ReportRequest, facts: ReportFacts, language: ReportLanguage): Promise<ReportRun | null>;
  report(id: string): Promise<ReportRun | null>;
  /** Historial que la persona puede ver (RLS), del más nuevo al más viejo. */
  reports(teamId: string): Promise<ReportRun[]>;
  /** Modo Gratis por la Edge Function `ai-trial`. Si no se pudo, lanza `TrialError` con el motivo. */
  generateFreeReport(req: ReportRequest, language: ReportLanguage): Promise<{ report: ReportRun; cached: boolean }>;
  /** Nombres visibles de las personas que comparten equipo: el validador los busca en el texto de la IA. */
  memberNames(): Promise<string[]>;
}

/** El modo Gratis no generó el reporte: `reason` dice por qué (cupo, interruptor, proveedor…). */
export class TrialError extends Error {
  constructor(readonly reason: TrialReason, message: string = reason) {
    super(translateServerMessage(message));
    this.name = 'TrialError';
  }
}
