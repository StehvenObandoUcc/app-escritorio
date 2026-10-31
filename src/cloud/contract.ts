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
  /** Umbral de inactividad del equipo en minutos (3 a 15); `null` = sin valor de equipo, manda el ajuste personal (F5 D-10). */
  idleMinutes: z.number().int().nullable(),
  /** Si la IA cuenta como tiempo productivo en el tablero y en Mi semana/Mi mes (F5 D-7). Por defecto, no. */
  aiCountsAsProductive: z.boolean(),
  /** Si los members ven quién está activo (F5 D-4). Por defecto, no. */
  presenceVisibleToMembers: z.boolean(),
  /** Tope diario de pausa de privacidad en minutos; 0 = sin tope (F5 D-11). */
  pauseCapMinutes: z.number().int().nonnegative(),
  /** Si la persona comparte los nombres de sus apps con este equipo (F5 D-8, fila propia de `team_members`). Por defecto, sí. */
  shareAppNames: z.boolean(),
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

// ---- Tableros, privacidad y ajustes del equipo (F5, docs/specs/F5-tableros-privacidad.md) ----

/** Categorías activas con horas (1 decimal). */
const HoursByCategorySchema = z.strictObject({
  productive: z.number(),
  neutral: z.number(),
  distraction: z.number(),
  ai: z.number(),
});
export type HoursByCategory = z.infer<typeof HoursByCategorySchema>;

/** Tarea en curso de alguien (`tasks_doing`). */
const DashboardTaskSchema = z.strictObject({
  id: z.uuid(),
  title: z.string(),
  projectId: z.uuid(),
  projectName: z.string(),
});
export type DashboardTask = z.infer<typeof DashboardTaskSchema>;

/** Totales del equipo sin nombres (fila 15). */
export const DashboardTotalsSchema = z.strictObject({
  members: z.number().int(),
  hoursActive: z.number(),
  hoursProductive: z.number(),
  hoursCategory: HoursByCategorySchema,
  aiHours: z.number(),
  aiSessions: z.number().int(),
  /** Horas de IA por herramienta (claves normalizadas por `report_ai_tool`). */
  aiTool: z.record(z.string(), z.number()),
  aiUsage: z.strictObject({ code: z.number(), writing: z.number(), analysis: z.number(), other: z.number(), untagged: z.number() }),
  tasksDoing: z.number().int(),
  tasksDone: z.number().int(),
});
export type DashboardTotals = z.infer<typeof DashboardTotalsSchema>;

/** Un día calendario (zona horaria de quien consulta) con sus horas por categoría. */
export const DashboardDaySchema = z.strictObject({ day: z.iso.date(), hoursCategory: HoursByCategorySchema });
export type DashboardDay = z.infer<typeof DashboardDaySchema>;

/** Una persona del tablero de owner y admin (DR-02, DR-03, DR-07). `name` es null si su perfil no es visible. */
export const DashboardMemberSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().nullable(),
  /** false = «Solo categorías» (PS-05). */
  shareAppNames: z.boolean(),
  hoursActive: z.number(),
  hoursProductive: z.number(),
  hoursCategory: HoursByCategorySchema,
  aiHours: z.number(),
  aiSessions: z.number().int(),
  capacityHours: z.number(),
  /** Porcentaje entero; null si la jornada no tiene horas de capacidad en el periodo. */
  capacityShare: z.number().nullable(),
  tasksDoing: z.array(DashboardTaskSchema),
});
export type DashboardMember = z.infer<typeof DashboardMemberSchema>;

/** Una persona de los proyectos del lead (D-5). */
export const DashboardLeadMemberSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().nullable(),
  projectHours: z.number(),
  aiHoursInProjects: z.number(),
  tasksDoing: z.array(DashboardTaskSchema),
});
export type DashboardLeadMember = z.infer<typeof DashboardLeadMemberSchema>;

/**
 * Tablero según el rol de quien consulta (`team_dashboard`). Member y viewer nunca reciben `userId` ni `name`:
 * `members`, `leadMembers` y `topApps` llegan vacíos. `totals` es null si el equipo tiene menos de 2 miembros (D-3).
 */
export const TeamDashboardSchema = z.strictObject({
  role: TeamRoleSchema,
  isLead: z.boolean(),
  totals: DashboardTotalsSchema.nullable(),
  perDay: z.array(DashboardDaySchema),
  members: z.array(DashboardMemberSchema),
  leadMembers: z.array(DashboardLeadMemberSchema),
  topApps: z.array(z.strictObject({ appName: z.string(), hours: z.number() })),
});
export type TeamDashboard = z.infer<typeof TeamDashboardSchema>;

export const PRESENCE_STATES = ['active', 'idle', 'paused', 'break', 'offline'] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];
/** Quién está activo (D-4). Nunca trae app, dominio ni herramienta de IA. `since` es null si está desconectada. */
export const PresenceSchema = z.strictObject({
  userId: z.uuid(),
  name: z.string().nullable(),
  state: z.enum(PRESENCE_STATES),
  since: z.string().nullable(),
});
export type Presence = z.infer<typeof PresenceSchema>;

/** Valores que acepta el tope de pausa, en minutos (0 = sin tope), igual que `set_team_settings`. */
export const PAUSE_CAP_MINUTES = [0, 15, 30, 60, 120, 240] as const;

/** Ajustes del equipo que escriben owner y admin (EQ-09, D-9). `idleMinutes` null = sin valor de equipo. */
export interface TeamSettingsInput {
  idleMinutes: number | null;
  workday: Workday;
  aiCountsAsProductive: boolean;
  presenceVisibleToMembers: boolean;
  pauseCapMinutes: number;
}

/** Tiempo propio por proyecto y tarea (`my_time_by_task`). Sin tarea, los cuatro campos de proyecto y tarea son null. */
export const TimeByTaskSchema = z.strictObject({
  projectId: z.uuid().nullable(),
  projectName: z.string().nullable(),
  taskId: z.uuid().nullable(),
  taskTitle: z.string().nullable(),
  seconds: z.number(),
});
export type TimeByTask = z.infer<typeof TimeByTaskSchema>;

/** Acciones que admite `audit_log.action` (restricción de 20261013000001). */
export const AUDIT_ACTIONS = [
  'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
  'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined',
  'policy_changed', 'project_deleted', 'task_deleted', 'report_generated',
  'settings_changed', 'share_apps_changed',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];
/** Filas por página de la auditoría (D-12). */
export const AUDIT_PAGE_SIZE = 50;

/** Fila de la auditoría. Sin nombres: la página los resuelve con la lista de miembros. */
export const AuditEntrySchema = z.strictObject({
  id: z.number().int(),
  action: z.string(),
  actorId: z.uuid().nullable(),
  targetUserId: z.uuid().nullable(),
  details: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});
export type AuditEntry = z.infer<typeof AuditEntrySchema>;

export const RULE_CATEGORIES = ['productive', 'neutral', 'distraction', 'ai'] as const;
export type RuleCategory = (typeof RULE_CATEGORIES)[number];

/** Regla del equipo por app (`match_type = 'process'`, TA-11). */
export const ProcessRuleSchema = z.strictObject({
  id: z.uuid(),
  pattern: z.string(),
  category: z.enum(RULE_CATEGORIES),
});
export type ProcessRule = z.infer<typeof ProcessRuleSchema>;

/** Nombre de proceso como lo guarda la regla (D-13): minúsculas, sin espacios al borde y sin `.exe` final. */
export const normalizeProcessPattern = (raw: string): string => raw.trim().toLowerCase().replace(/\.exe$/, '').trim();

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
  createdBy: z.uuid().nullable(),
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
    /** network: reintentar · forbidden: sin permiso · invalid: dato rechazado · auth: sesión o credenciales · changed: los datos cambiaron (PT409) */
    readonly kind: 'network' | 'forbidden' | 'invalid' | 'auth' | 'changed' | 'unknown',
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
  /**
   * CU-08 (spec F7): elimina la cuenta en la nube (Edge Function `delete-account`). No cierra la sesión local:
   * eso lo hace quien llama después de borrar lo local. Falla con `invalid` si es la única propietaria de un
   * equipo con más personas.
   */
  deleteAccount(): Promise<void>;
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
  /** Borra cualquier regla del equipo por id (de sitio o de app): no hace falta otro método para las reglas de app. */
  removeDomainRule(ruleId: string): Promise<void>;
  teamDomainSummary(teamId: string, from: string, to: string): Promise<DomainUsage[]>;

  // ---- Reglas por app (TA-11, D-13; solo owner y admin escriben, aplica a los bloques nuevos) ----
  processRules(teamId: string): Promise<ProcessRule[]>;
  /** Normaliza el patrón con `normalizeProcessPattern` y crea la regla (prioridad 0, sin herramienta de IA). */
  addProcessRule(teamId: string, pattern: string, category: RuleCategory): Promise<void>;

  // ---- Tableros, presencia y ajustes del equipo (F5: filas 15, 24, 38 a 40 de docs/ROLES.md) ----
  /** Tablero según el rol de quien llama; periodo [from, to) en ISO, máximo 92 días (D-2). */
  teamDashboard(teamId: string, from: string, to: string): Promise<TeamDashboard>;
  /** Quién está activo, según el último bloque subido (D-4). Se pide cada 60 s. */
  teamPresence(teamId: string): Promise<Presence[]>;
  /** Solo owner y admin (D-9). Valida jornada, umbral y tope en el servidor. */
  setTeamSettings(teamId: string, settings: TeamSettingsInput): Promise<void>;
  /** Derecho personal (PS-05, D-8): oculta los nombres de mis apps ante el equipo. */
  setShareAppNames(teamId: string, share: boolean): Promise<void>;
  /** Mi tiempo por proyecto y tarea en [from, to) (TA-10, DR-05). */
  myTimeByTask(teamId: string, from: string, to: string): Promise<TimeByTask[]>;
  /** Auditoría (EQ-10, D-12): 50 filas de la más nueva a la más vieja; `beforeId` pide las anteriores a ese id. Solo owner y admin. */
  auditLog(teamId: string, options?: { beforeId?: number; action?: AuditAction }): Promise<AuditEntry[]>;

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
