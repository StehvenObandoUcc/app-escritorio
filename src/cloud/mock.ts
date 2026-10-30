/**
 * Nube simulada en memoria: permite usar cuentas y equipos en `npm run dev` y en las pruebas,
 * sin red. Imita las reglas de las funciones SQL (docs/ROLES.md); la fuente de verdad sigue siendo
 * la base de datos, probada en supabase/tests.
 * El código de verificación y de recuperación siempre es MOCK_CODE.
 */
import type { AiUsage, SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';
import { localDate } from '@/lib/time';
import { fallbackNarrative } from '../../supabase/functions/_shared/report-validator.ts';
import { CONSENT_VERSION } from '@/lib/consent';
import { deliveryFields } from '@/lib/evidence';
import {
  AUDIT_PAGE_SIZE,
  CloudError,
  DEFAULT_WORKDAY,
  PAUSE_CAP_MINUTES,
  TeamDashboardSchema,
  TrialError,
  normalizeProcessPattern,
  wrongInvitationCode,
  type AuditEntry,
  type Cloud,
  type HoursByCategory,
  type Presence,
  type PresenceState,
  type TeamSettingsInput,
  type TimeByTask,
  type Fact,
  type ReportFacts,
  type ReportRequest,
  type ReportRun,
  type CloudUser,
  type Member,
  type MyTeam,
  type Profile,
  type PendingReview,
  type Project,
  type ProjectRole,
  type ReviewField,
  type Task,
  type TaskInput,
  type TaskHistory,
  type TeamRole,
} from './contract';

export const MOCK_CODE = '123456';

interface MockAccount {
  id: string;
  email: string;
  password: string;
  verified: boolean;
  displayName: string;
}

interface MockMember {
  teamId: string;
  userId: string;
  role: TeamRole;
  consentAt: string | null;
  consentVersion: string | null;
  joinedAt: string;
}

interface MockInvitation {
  id: string;
  teamId: string;
  email: string;
  role: TeamRole;
  invitedBy: string;
  status: 'pending' | 'accepted' | 'declined' | 'revoked';
  expiresAt: string;
  code: string;
  failedAttempts: number;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
/** Mismo formato que new_invitation_code() en la base (ADR-0008). */
export function mockInvitationCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => CODE_ALPHABET[b % 32]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export interface MockCloud extends Cloud {
  /** Solo para pruebas y datos de ejemplo. */
  readonly debug: {
    addAccount(email: string, password: string, displayName: string): string;
    addTeam(name: string, ownerId: string): string;
    addMember(teamId: string, userId: string, role: TeamRole, consent?: boolean): void;
    /** Devuelve el id; el código se lee con `codeOf`. */
    invite(teamId: string, email: string, role: TeamRole, invitedBy: string): string;
    codeOf(invitationId: string): string;
    uploaded: { blocks: SyncBlock[]; entries: SyncEntry[]; closures: SyncClosure[] };
    /** Hace fallar las siguientes subidas como si no hubiera red. */
    setOffline(offline: boolean): void;
    rules: Map<string, TeamRule[]>;
    /** Etiquetas de IA subidas aparte (F4 D-13), por id de bloque. */
    aiUsages: Map<string, AiUsage | null>;
    reports: ReportRun[];
    /** Auditoría simulada (F5 D-12): las pruebas pueden añadir filas con su `id`; `setTeamSettings` y `setShareAppNames` también escriben. */
    audit: (AuditEntry & { teamId: string })[];
  };
}

const fail = (message: string, kind: CloudError['kind'] = 'forbidden') => {
  throw new CloudError(message, kind);
};

const assertPeriod = (fromMs: number, toMs: number) => {
  if (!(toMs > fromMs) || toMs - fromMs > 92 * 86_400_000) {
    fail('Rango inválido: el fin debe ser posterior al inicio y no superar 92 días', 'invalid');
  }
};
/** Segundos que el intervalo [aStart, aEnd) tiene dentro de [from, to). */
const overlapSec = (aStart: number, aEnd: number, from: number, to: number) => Math.max(0, Math.min(aEnd, to) - Math.max(aStart, from)) / 1000;
/** Segundos a horas con 1 decimal. */
const hrs = (seconds: number) => Math.round(seconds / 360) / 10;
/** Días calendario (hora local) que toca [from, to), con su inicio, fin y día ISO (1 = lunes). */
const localDays = (fromMs: number, toMs: number) => {
  const out: { date: string; s: number; e: number; iso: number }[] = [];
  let d = new Date(new Date(fromMs).getFullYear(), new Date(fromMs).getMonth(), new Date(fromMs).getDate());
  while (d.getTime() < toMs) {
    const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    out.push({ date: localDate(d), s: d.getTime(), e: next.getTime(), iso: d.getDay() || 7 });
    d = next;
  }
  return out;
};
interface DashBlock {
  user: string;
  category: keyof HoursByCategory;
  appName: string;
  aiTool: string | null;
  usage: AiUsage | null;
  start: number;
  end: number;
  /** Segundos dentro del periodo. */
  sec: number;
}

/**
 * `confirmEmail`: imita un proyecto que aún exige confirmar el correo al registrarse (antes de ADR-0008).
 * Por defecto no: registrarse inicia la sesión al instante.
 */
export function createMockCloud(now: () => Date = () => new Date(), { confirmEmail = false } = {}): MockCloud {
  const accounts = new Map<string, MockAccount>();
  const profiles = new Map<string, Profile>();
  const teams = new Map<string, { id: string; name: string }>();
  let members: MockMember[] = [];
  const invitations: MockInvitation[] = [];
  const uploaded = { blocks: [] as SyncBlock[], entries: [] as SyncEntry[], closures: [] as SyncClosure[] };
  const rules = new Map<string, TeamRule[]>();
  const policies = new Map<string, boolean>();
  const alerts = new Map<string, { enabled: boolean; repeat: number }>();
  const domainRules: { id: string; teamId: string; domain: string; notAllowed: boolean }[] = [];
  // ---- F5: ajustes del equipo, privacidad, reglas por app y auditoría ----
  const teamSettings = new Map<string, TeamSettingsInput>();
  const settingsOf = (teamId: string): TeamSettingsInput =>
    teamSettings.get(teamId) ?? { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive: false, presenceVisibleToMembers: false, pauseCapMinutes: 0 };
  const shareNames = new Map<string, boolean>();
  const sharesNames = (teamId: string, userId: string) => shareNames.get(`${teamId}|${userId}`) ?? true;
  const processList: { id: string; teamId: string; pattern: string; category: 'productive' | 'neutral' | 'distraction' | 'ai' }[] = [];
  const audit: (AuditEntry & { teamId: string })[] = [];
  const canManage = (teamId: string, userId: string) => ['owner', 'admin'].includes(roleIn(teamId, userId) ?? '');
  let offline = false;
  const blockOwner = new Map<string, string>();
  const membersOf = (teamId: string) => members.filter((m) => m.teamId === teamId).map((m) => m.userId);
  let current: string | null = null;
  const listeners = new Set<(u: CloudUser | null) => void>();

  const byId = (id: string) => [...accounts.values()].find((a) => a.id === id);
  const userOf = (a: MockAccount | undefined): CloudUser | null =>
    a ? { id: a.id, email: a.email, emailVerified: a.verified } : null;
  const emit = () => listeners.forEach((l) => l(userOf(current ? byId(current) : undefined)));
  const me = () => {
    const a = current ? byId(current) : undefined;
    if (!a) return fail('Tu sesión terminó. Vuelve a iniciar sesión.', 'auth');
    return a;
  };
  const roleIn = (teamId: string, userId: string) => members.find((m) => m.teamId === teamId && m.userId === userId)?.role;
  const nameOf = (id: string) => profiles.get(id)?.displayName ?? byId(id)?.displayName ?? null;
  const writeAudit = (teamId: string, action: string, targetUserId: string | null, details: Record<string, unknown>) => {
    audit.push({
      teamId,
      id: audit.reduce((max, a) => Math.max(max, a.id), 0) + 1,
      action,
      actorId: current,
      targetUserId,
      details,
      createdAt: now().toISOString(),
    });
  };
  /** Bloques activos de miembros (sin viewer) que tocan el periodo, con los segundos recortados a él (como `b` en team_dashboard). */
  const dashboardBlocks = (teamId: string, people: Set<string>, fromMs: number, toMs: number): DashBlock[] =>
    uploaded.blocks.flatMap((b): DashBlock[] => {
      const user = blockOwner.get(b.id);
      const start = Date.parse(b.startedAt);
      const end = Date.parse(b.endedAt);
      const sec = overlapSec(start, end, fromMs, toMs);
      if (b.teamId !== teamId || !user || !people.has(user) || sec <= 0) return [];
      if (b.category !== 'productive' && b.category !== 'neutral' && b.category !== 'distraction' && b.category !== 'ai') return [];
      return [{ user, category: b.category, appName: b.appName, aiTool: b.aiTool, usage: b.aiUsageType, start, end, sec }];
    });
  const owners = (teamId: string) => members.filter((m) => m.teamId === teamId && m.role === 'owner').length;
  const addAccount = (email: string, password: string, displayName: string, verified = true) => {
    const id = crypto.randomUUID();
    accounts.set(email.toLowerCase(), { id, email: email.toLowerCase(), password, verified, displayName });
    return id;
  };
  const addTeam = (name: string, ownerId: string) => {
    const id = crypto.randomUUID();
    teams.set(id, { id, name });
    members.push({ teamId: id, userId: ownerId, role: 'owner', consentAt: null, consentVersion: null, joinedAt: now().toISOString() });
    return id;
  };
  const addInvitation = (teamId: string, email: string, role: TeamRole, invitedBy: string) => {
    const id = crypto.randomUUID();
    invitations.push({
      id,
      teamId,
      email: email.trim().toLowerCase(),
      role,
      invitedBy,
      status: 'pending',
      expiresAt: new Date(now().getTime() + 7 * 86_400_000).toISOString(),
      code: mockInvitationCode(),
      failedAttempts: 0,
    });
    return id;
  };
  const upload = <T>(list: T[], rows: T[], key: (r: T) => string) => {
    for (const row of rows) {
      const i = list.findIndex((r) => key(r) === key(row));
      if (i >= 0) list[i] = row;
      else list.push(row);
    }
  };
  const checkConsent = (userId: string, teamIds: string[]) => {
    if (offline) fail('Sin conexión con el servidor. Tus datos siguen guardados en este equipo.', 'network');
    for (const teamId of new Set(teamIds)) {
      const m = members.find((x) => x.teamId === teamId && x.userId === userId);
      if (!m || m.role === 'viewer' || !m.consentAt) fail('No tienes permiso para esta acción.');
    }
  };
  // ---- Proyectos y tareas (ADR-0014): imita las funciones de 20261008000001 y 20261008000002 ----
  type MockTask = Omit<Task, 'loggedSeconds' | 'pendingReview'>;
  type MockReview = PendingReview & {
    taskId: string;
    status: 'pending' | 'approved' | 'changes_requested';
    decidedBy: string | null;
    comment: string | null;
    decidedAt: string | null;
  };
  const DEFAULT_TEMPLATE: ReviewField[] = [
    { key: 'summary', label: 'Qué se hizo', kind: 'text', required: true },
    { key: 'evidence', label: 'Enlace de evidencia', kind: 'url', required: false },
    { key: 'screenshots', label: 'Capturas', kind: 'image', required: false },
  ];
  const URL_RE = /^https?:\/\/\S+$/;
  const projects: { id: string; teamId: string; name: string; archivedAt: string | null; template: ReviewField[] | null }[] = [];
  const projectMembers: { projectId: string; userId: string; role: ProjectRole }[] = [];
  const tasks: MockTask[] = [];
  const reviews: MockReview[] = [];
  const events: (TaskHistory['events'][number] & { taskId: string })[] = [];
  const entryOwner = new Map<string, string>();
  const projectRole = (projectId: string, userId: string): Project['myRole'] | null => {
    const p = projects.find((x) => x.id === projectId);
    if (!p) return null;
    const team = roleIn(p.teamId, userId);
    if (team === 'owner' || team === 'admin') return 'manager';
    if (team !== 'member') return null;
    return projectMembers.find((m) => m.projectId === projectId && m.userId === userId)?.role ?? null;
  };
  const canManageProject = (projectId: string, userId: string) => ['manager', 'lead'].includes(projectRole(projectId, userId) ?? '');
  const isWorker = (t: MockTask, userId: string) => t.assigneeId === userId || t.collaborators.includes(userId);
  const templateOf = (projectId: string) => projects.find((p) => p.id === projectId)?.template ?? DEFAULT_TEMPLATE;
  const assertOpen = (projectId: string) => {
    if (projects.find((p) => p.id === projectId)?.archivedAt) fail('El proyecto está archivado: desarchívalo para hacer cambios', 'invalid');
  };
  const ensureMember = (projectId: string, userId: string | null, caller: string) => {
    if (!userId || projectMembers.some((m) => m.projectId === projectId && m.userId === userId)) return;
    if (!canManageProject(projectId, caller)) fail('Esa persona no está en el proyecto: pide a quien lo gestiona que la añada', 'invalid');
    const team = projects.find((p) => p.id === projectId)?.teamId ?? '';
    if (!['owner', 'admin', 'member'].includes(roleIn(team, userId) ?? '')) {
      fail('Solo se añaden propietarios, administradores o miembros del equipo; un observador no pertenece a proyectos', 'invalid');
    }
    projectMembers.push({ projectId, userId, role: 'contributor' });
  };
  const log = (taskId: string, kind: string, details: Record<string, unknown> = {}) => {
    const actor = current;
    events.push({ taskId, kind, actor, actorName: actor ? (profiles.get(actor)?.displayName ?? byId(actor)?.displayName ?? null) : null, details, createdAt: now().toISOString() });
  };
  const cleanTask = (t: TaskInput) => {
    if (t.title.trim().length < 1 || t.title.trim().length > 200) fail('El título debe tener entre 1 y 200 caracteres', 'invalid');
    return { ...t, title: t.title.trim(), labels: [...new Set(t.labels.map((l) => l.trim()).filter(Boolean))].sort() };
  };
  const ownSeconds = (taskId: string) =>
    uploaded.entries
      .filter((e) => e.taskId === taskId && !e.deletedAt)
      .reduce((sum, e) => sum + Math.round(((e.endedAt ? Date.parse(e.endedAt) : now().getTime()) - Date.parse(e.startedAt)) / 1000), 0);
  const findTask = (taskId: string) => tasks.find((x) => x.id === taskId) ?? fail('No permitido');
  /** Igual que assert_delivery (ADR-0018): obligatorios, enlaces, criterios y tipo de los archivos de cada campo. */
  const assertDelivery = (t: MockTask, answers: Record<string, string>, files: Record<string, File[]>, criteriaMet: string[]) => {
    for (const f of deliveryFields(templateOf(t.projectId), t.evidence)) {
      const v = (answers[f.key] ?? '').trim();
      const fieldFiles = files[f.key] ?? [];
      const empty = f.kind === 'image' || f.kind === 'file' ? fieldFiles.length === 0 : v === '' || (f.kind === 'checklist' && v !== 'true');
      if (f.required && empty) fail(`Falta completar «${f.label}» en el formulario de entrega`, 'invalid');
      if (f.kind === 'url' && v !== '' && !URL_RE.test(v)) fail(`«${f.label}» debe ser un enlace que empiece por http:// o https://`, 'invalid');
      if (f.kind === 'image' && fieldFiles.some((x) => !x.type.startsWith('image/'))) fail(`«${f.label}» solo admite imágenes`, 'invalid');
      if (f.accept && fieldFiles.some((x) => !f.accept!.includes(x.type))) fail(`«${f.label}» no admite ese tipo de archivo`, 'invalid');
    }
    if (t.criteria.some((c) => !criteriaMet.includes(c.id))) fail('Marca todos los criterios de aceptación antes de enviar a revisión', 'invalid');
  };
  const mockAttachments = (t: MockTask, files: Record<string, File[]>, answers: Record<string, string>) => {
    const out: PendingReview['attachments'] = [];
    const filled = { ...answers };
    for (const [key, list] of Object.entries(files)) {
      const ids = list.map((f) => {
        const id = crypto.randomUUID();
        out.push({ id, path: `mock/${t.id}/${f.name}`, name: f.name, size: f.size, contentType: f.type || 'application/octet-stream' });
        return id;
      });
      if (ids.length) filled[key] = ids.join(',');
    }
    return { attachments: out, answers: filled };
  };
  /** D-8 v2: al salir del equipo o pasar a viewer, deja proyectos, tareas, apoyos y revisiones pedidas. */
  const leaveWork = (teamId: string, userId: string) => {
    const ids = new Set(projects.filter((p) => p.teamId === teamId).map((p) => p.id));
    for (let i = projectMembers.length - 1; i >= 0; i--) {
      if (ids.has(projectMembers[i]!.projectId) && projectMembers[i]!.userId === userId) projectMembers.splice(i, 1);
    }
    for (const t of tasks) {
      if (!ids.has(t.projectId)) continue;
      if (t.assigneeId === userId) t.assigneeId = null;
      t.collaborators = t.collaborators.filter((c) => c !== userId);
    }
    for (const r of reviews) if (r.status === 'pending' && r.reviewerId === userId) r.reviewerId = null;
  };

  // ---- Reportes (F4): mismas reglas que get_report_facts y save_report, con hechos de tareas simulados ----
  const reports: ReportRun[] = [];
  const aiUsages = new Map<string, AiUsage | null>();
  const trialUse = new Map<string, number>();
  const TRIAL_PER_USER = 5;
  const dropPersonalReports = (teamId: string, userId: string) => {
    for (let i = reports.length - 1; i >= 0; i--) {
      if (reports[i]!.teamId === teamId && reports[i]!.scope === 'personal' && reports[i]!.subjectId === userId) reports.splice(i, 1);
    }
  };
  const groupMembers = (req: ReportRequest) =>
    req.scope === 'team'
      ? members.filter((m) => m.teamId === req.teamId && m.role !== 'viewer').length
      : projectMembers.filter((pm) => pm.projectId === req.subjectId && ['owner', 'admin', 'member'].includes(roleIn(req.teamId, pm.userId) ?? '')).length;
  const assertCanGenerate = (req: ReportRequest, userId: string) => {
    const role = roleIn(req.teamId, userId);
    if (!role || role === 'viewer') fail('No permitido');
    if (req.scope === 'personal' && req.subjectId !== userId) fail('No permitido: el reporte personal es solo sobre ti');
    if (req.scope === 'project' && !canManageProject(req.subjectId, userId)) fail('No permitido: el reporte de proyecto lo generan propietarios, administradores o el líder del proyecto');
    if (req.scope === 'team' && (req.subjectId !== req.teamId || !['owner', 'admin'].includes(role!))) fail('No permitido: el reporte de equipo lo generan propietarios o administradores');
    if (req.scope !== 'personal' && groupMembers(req) < 2) fail('Hacen falta al menos 2 miembros para un reporte de grupo', 'invalid');
  };
  const periodOf = (period: ReportRequest['period']) => {
    const today = new Date(`${localDate(now())}T12:00:00`);
    const shift = (d: Date, days: number) => localDate(new Date(d.getTime() + days * 86_400_000));
    const monday = -((today.getDay() + 6) % 7);
    if (period === 'today') return { from: localDate(today), to: localDate(today) };
    if (period === 'yesterday') return { from: shift(today, -1), to: shift(today, -1) };
    if (period === 'this_week') return { from: shift(today, monday), to: shift(today, monday + 6) };
    return { from: shift(today, monday - 7), to: shift(today, monday - 1) };
  };
  const factsOf = (req: ReportRequest): ReportFacts => {
    const { from, to } = periodOf(req.period);
    const ids = new Set(projects.filter((p) => p.teamId === req.teamId && (req.scope !== 'project' || p.id === req.subjectId)).map((p) => p.id));
    const scoped = tasks.filter((t) => ids.has(t.projectId) && (req.scope !== 'personal' || t.assigneeId === req.subjectId));
    const day = (iso: string | null) => (iso ? localDate(new Date(iso)) : null);
    const rows: Omit<Fact, 'id'>[] = [
      { metric: 'tasks_done', dimension: null, value: scoped.filter((t) => t.status === 'done' && (day(t.completedAt) ?? '') >= from && (day(t.completedAt) ?? '') <= to).length, unit: 'n' },
      { metric: 'tasks_in_review', dimension: null, value: scoped.filter((t) => t.status === 'review').length, unit: 'n' },
      { metric: 'tasks_overdue', dimension: null, value: scoped.filter((t) => t.status !== 'done' && t.dueDate !== null && t.dueDate < localDate(now()) && t.dueDate <= to).length, unit: 'n' },
      ...(req.scope === 'personal' ? [] : [{ metric: 'members', dimension: null, value: groupMembers(req), unit: 'n' as const }]),
    ];
    const facts = rows.map((r, i) => ({ ...r, id: `F${i + 1}` }));
    return { facts, factsHash: JSON.stringify(facts), periodFrom: from, periodTo: to };
  };
  const findCached = (req: ReportRequest, f: ReportFacts, language: string) =>
    reports.find(
      (r) => r.teamId === req.teamId && r.scope === req.scope && r.subjectId === req.subjectId && r.periodFrom === f.periodFrom && r.periodTo === f.periodTo
        && JSON.stringify(r.facts) === f.factsHash && r.language === language,
    ) ?? null;
  const canSee = (r: ReportRun, userId: string) =>
    r.scope === 'team' ? Boolean(roleIn(r.teamId, userId)) : r.scope === 'project' ? projectRole(r.subjectId, userId) !== null : r.createdBy === userId;
  const store = (req: ReportRequest, f: ReportFacts, narrative: ReportRun['narrative'], mode: ReportRun['mode'], validation: ReportRun['validation'], language: ReportRun['language'], userId: string) => {
    const cached = findCached(req, f, language);
    if (cached) return cached;
    const report: ReportRun = {
      id: crypto.randomUUID(), teamId: req.teamId, scope: req.scope, subjectId: req.subjectId, period: req.period,
      periodFrom: f.periodFrom, periodTo: f.periodTo, facts: f.facts, narrative, mode, validation,
      validatedBy: mode === 'free' ? 'server' : 'client', language, dataUntil: now().toISOString(), createdBy: userId, createdAt: now().toISOString(),
    };
    reports.unshift(report);
    return report;
  };

  const pendingFor = (email: string) =>
    invitations.filter((i) => i.email === email && i.status === 'pending' && Date.parse(i.expiresAt) > now().getTime());

  return {
    source: 'mock',
    debug: {
      addAccount: (email, password, displayName) => addAccount(email, password, displayName),
      addTeam,
      addMember: (teamId, userId, role, consent = true) => {
        const at = consent ? now().toISOString() : null;
        members.push({ teamId, userId, role, consentAt: at, consentVersion: consent ? CONSENT_VERSION : null, joinedAt: now().toISOString() });
      },
      invite: addInvitation,
      codeOf: (id) => invitations.find((i) => i.id === id)?.code ?? '',
      uploaded,
      setOffline: (value) => {
        offline = value;
      },
      rules,
      aiUsages,
      reports,
      audit,
    },

    currentUser: async () => userOf(current ? byId(current) : undefined),
    onUserChange: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    signUp: async (email, password, displayName) => {
      if (password.length < 8) fail('La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números.', 'auth');
      if (accounts.has(email.toLowerCase())) {
        fail('Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.', 'auth');
      }
      const id = addAccount(email, password, displayName, !confirmEmail);
      if (!confirmEmail) {
        current = id;
        emit();
      }
    },
    verifySignUp: async (email, code) => {
      const a = accounts.get(email.toLowerCase());
      if (!a || code !== MOCK_CODE) fail('El código no es válido o ya venció. Pide uno nuevo.', 'auth');
      a!.verified = true;
      current = a!.id;
      emit();
    },
    resendSignUpCode: async () => {},
    signIn: async (email, password) => {
      const a = accounts.get(email.toLowerCase());
      if (!a || a.password !== password) fail('El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.', 'auth');
      if (!a!.verified) fail('Tu correo aún no está verificado. Escribe el código que te enviamos.', 'auth');
      current = a!.id;
      emit();
    },
    signOut: async () => {
      current = null;
      emit();
    },
    requestPasswordReset: async () => {},
    resetPassword: async (email, code, newPassword) => {
      const a = accounts.get(email.toLowerCase());
      if (!a || code !== MOCK_CODE) fail('El código no es válido o ya venció. Pide uno nuevo.', 'auth');
      a!.password = newPassword;
      current = a!.id;
      emit();
    },

    ensureProfile: async (fallbackTimezone) => {
      const a = me();
      const existing = profiles.get(a.id);
      if (existing) return existing;
      const p = { id: a.id, displayName: a.displayName, timezone: fallbackTimezone };
      profiles.set(a.id, p);
      return p;
    },
    saveProfile: async (displayName, timezone) => {
      const a = me();
      if (displayName.trim().length < 1 || displayName.length > 80) fail('El nombre debe tener entre 1 y 80 caracteres.', 'invalid');
      const p = { id: a.id, displayName: displayName.trim(), timezone };
      profiles.set(a.id, p);
      return p;
    },

    myTeams: async () => {
      const a = me();
      return members
        .filter((m) => m.userId === a.id)
        .map(
          (m): MyTeam => ({
            id: m.teamId,
            name: teams.get(m.teamId)?.name ?? '',
            role: m.role,
            consentAt: m.consentAt,
            consentVersion: m.consentVersion,
            workday: settingsOf(m.teamId).workday,
            allowHiddenApps: policies.get(m.teamId) ?? true,
            alertNotAllowed: alerts.get(m.teamId)?.enabled ?? true,
            alertRepeatMinutes: alerts.get(m.teamId)?.repeat ?? 10,
            idleMinutes: settingsOf(m.teamId).idleMinutes,
            aiCountsAsProductive: settingsOf(m.teamId).aiCountsAsProductive,
            presenceVisibleToMembers: settingsOf(m.teamId).presenceVisibleToMembers,
            pauseCapMinutes: settingsOf(m.teamId).pauseCapMinutes,
            shareAppNames: sharesNames(m.teamId, m.userId),
          }),
        )
        .sort((x, y) => x.name.localeCompare(y.name, 'es'));
    },
    createTeam: async (name) => {
      const a = me();
      const clean = name.trim();
      if (clean.length < 2 || clean.length > 60) fail('El nombre del equipo debe tener entre 2 y 60 caracteres.', 'invalid');
      return addTeam(clean, a.id);
    },
    giveConsent: async (teamId, version) => {
      const a = me();
      const m = members.find((x) => x.teamId === teamId && x.userId === a.id);
      if (!m) fail('No perteneces a este equipo');
      m!.consentAt = now().toISOString();
      m!.consentVersion = version;
    },
    members: async (teamId) => {
      const a = me();
      const mine = roleIn(teamId, a.id);
      if (!mine) return [];
      const visible = mine === 'viewer' ? members.filter((m) => m.teamId === teamId && m.userId === a.id) : members.filter((m) => m.teamId === teamId);
      return visible.map(
        (m): Member => ({
          userId: m.userId,
          role: m.role,
          displayName: profiles.get(m.userId)?.displayName ?? byId(m.userId)?.displayName ?? null,
          joinedAt: m.joinedAt,
        }),
      );
    },
    setMemberRole: async (teamId, userId, role) => {
      const a = me();
      const caller = roleIn(teamId, a.id);
      const target = roleIn(teamId, userId);
      const allowed =
        caller === 'owner' || (caller === 'admin' && (target === 'member' || target === 'viewer') && (role === 'member' || role === 'viewer'));
      if (!target || !allowed) fail('No permitido');
      if (target === 'owner' && role !== 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un propietario', 'invalid');
      members = members.map((m) => (m.teamId === teamId && m.userId === userId ? { ...m, role } : m));
      if (role === 'viewer') leaveWork(teamId, userId);
    },
    removeMember: async (teamId, userId) => {
      const a = me();
      const caller = roleIn(teamId, a.id);
      const target = roleIn(teamId, userId);
      if (!target || userId === a.id || !(caller === 'owner' || (caller === 'admin' && (target === 'member' || target === 'viewer')))) {
        fail('No permitido');
      }
      if (target === 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un propietario', 'invalid');
      members = members.filter((m) => !(m.teamId === teamId && m.userId === userId));
      leaveWork(teamId, userId);
      dropPersonalReports(teamId, userId);
    },
    leaveTeam: async (teamId) => {
      const a = me();
      const mine = roleIn(teamId, a.id);
      if (!mine) fail('No perteneces a este equipo');
      if (mine === 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un propietario', 'invalid');
      members = members.filter((m) => !(m.teamId === teamId && m.userId === a.id));
      leaveWork(teamId, a.id);
      dropPersonalReports(teamId, a.id);
    },

    teamInvitations: async (teamId) => {
      const a = me();
      const mine = roleIn(teamId, a.id);
      if (mine !== 'owner' && mine !== 'admin') return [];
      return invitations
        .filter((i) => i.teamId === teamId && i.status === 'pending')
        .map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt, code: i.code }));
    },
    invite: async (teamId, email, role) => {
      const a = me();
      const caller = roleIn(teamId, a.id);
      if (!(caller === 'owner' || (caller === 'admin' && (role === 'member' || role === 'viewer')))) fail('No permitido');
      const clean = email.trim().toLowerCase();
      const already = accounts.get(clean);
      if (already && roleIn(teamId, already.id)) fail('Esa persona ya pertenece al equipo', 'invalid');
      if (invitations.some((i) => i.teamId === teamId && i.email === clean && i.status === 'pending')) {
        fail('Ya hay una invitación pendiente para ese correo', 'invalid');
      }
      const id = addInvitation(teamId, clean, role, a.id);
      return { code: invitations.find((i) => i.id === id)!.code };
    },
    revokeInvitation: async (id) => {
      const a = me();
      const inv = invitations.find((i) => i.id === id);
      const caller = inv ? roleIn(inv.teamId, a.id) : undefined;
      if (!inv || !(caller === 'owner' || (caller === 'admin' && (inv.role === 'member' || inv.role === 'viewer')))) fail('No permitido');
      if (inv!.status !== 'pending') fail('La invitación ya no está pendiente', 'invalid');
      inv!.status = 'revoked';
    },
    myInvitations: async () => {
      const a = me();
      return pendingFor(a.email).map((i) => ({
        id: i.id,
        teamId: i.teamId,
        teamName: teams.get(i.teamId)?.name ?? '',
        role: i.role,
        invitedByName: profiles.get(i.invitedBy)?.displayName ?? byId(i.invitedBy)?.displayName ?? null,
        expiresAt: i.expiresAt,
      }));
    },
    acceptInvitation: async (id, code, consentVersion) => {
      const a = me();
      if (!consentVersion.trim()) fail('Debes aceptar el consentimiento', 'invalid');
      const inv = pendingFor(a.email).find((i) => i.id === id);
      if (!inv) fail('No permitido');
      if (inv!.code !== code.trim().toUpperCase()) {
        inv!.failedAttempts += 1;
        if (inv!.failedAttempts >= 5) inv!.status = 'revoked';
        fail(wrongInvitationCode(), 'invalid');
      }
      if (roleIn(inv!.teamId, a.id)) fail('Ya perteneces a este equipo', 'invalid');
      inv!.status = 'accepted';
      members.push({
        teamId: inv!.teamId,
        userId: a.id,
        role: inv!.role,
        consentAt: now().toISOString(),
        consentVersion,
        joinedAt: now().toISOString(),
      });
      return inv!.teamId;
    },
    declineInvitation: async (id) => {
      const a = me();
      const inv = pendingFor(a.email).find((i) => i.id === id);
      if (!inv) fail('No permitido');
      inv!.status = 'declined';
    },

    teamRules: async (teamId) => [
      ...domainRules
        .filter((r) => r.teamId === teamId)
        .map((r): TeamRule => ({ match: 'domain', pattern: r.domain, category: 'distraction', ai_tool: null, not_allowed: r.notAllowed })),
      ...processList
        .filter((r) => r.teamId === teamId)
        .map((r): TeamRule => ({ match: 'process', pattern: r.pattern, category: r.category, ai_tool: null, not_allowed: false })),
      ...(rules.get(teamId) ?? []),
    ],
    setTeamPolicy: async (teamId, allowHiddenApps) => {
      if (!canManage(teamId, me().id)) fail('No permitido');
      policies.set(teamId, allowHiddenApps);
    },
    setAlertPolicy: async (teamId, enabled, repeatMinutes) => {
      if (!canManage(teamId, me().id)) fail('No permitido');
      if (![0, 2, 5, 10, 15, 30].includes(repeatMinutes)) fail('La repetición debe ser 0 (solo al entrar), 2, 5, 10, 15 o 30 minutos', 'invalid');
      alerts.set(teamId, { enabled, repeat: repeatMinutes });
    },
    domainRules: async (teamId) =>
      roleIn(teamId, me().id)
        ? domainRules.filter((r) => r.teamId === teamId).map(({ id, domain, notAllowed }) => ({ id, domain, notAllowed }))
        : [],
    addNotAllowedDomain: async (teamId, domain) => {
      if (!canManage(teamId, me().id)) fail('No tienes permiso para esta acción.');
      if (!/^[a-z0-9.-]{1,253}$/.test(domain)) fail('Escribe solo el dominio, por ejemplo youtube.com.', 'invalid');
      domainRules.push({ id: crypto.randomUUID(), teamId, domain, notAllowed: true });
    },
    // Como en la nube real, borra cualquier regla por id (de sitio o de app).
    removeDomainRule: async (ruleId) => {
      const i = domainRules.findIndex((r) => r.id === ruleId);
      if (i >= 0) {
        if (!canManage(domainRules[i]!.teamId, me().id)) fail('No tienes permiso para esta acción.');
        domainRules.splice(i, 1);
        return;
      }
      const j = processList.findIndex((r) => r.id === ruleId);
      if (j < 0 || !canManage(processList[j]!.teamId, me().id)) fail('No tienes permiso para esta acción.');
      processList.splice(j, 1);
    },
    processRules: async (teamId) =>
      roleIn(teamId, me().id)
        ? processList.filter((r) => r.teamId === teamId).map(({ id, pattern, category }) => ({ id, pattern, category })).sort((a, b) => a.pattern.localeCompare(b.pattern))
        : [],
    addProcessRule: async (teamId, pattern, category) => {
      if (!canManage(teamId, me().id)) fail('No tienes permiso para esta acción.');
      const clean = normalizeProcessPattern(pattern);
      if (clean.length < 1 || clean.length > 120) fail('Cada regla necesita un patrón en minúsculas de 1 a 120 caracteres.', 'invalid');
      processList.push({ id: crypto.randomUUID(), teamId, pattern: clean, category });
    },
    teamDomainSummary: async (teamId, from, to) => {
      if (!canManage(teamId, me().id)) fail('No permitido');
      const totals = new Map<string, { userId: string; domain: string; category: string; seconds: number }>();
      const members = new Set(membersOf(teamId));
      for (const b of uploaded.blocks) {
        if (b.teamId !== teamId || !b.domain || b.endedAt <= from || b.startedAt >= to) continue;
        const owner = blockOwner.get(b.id);
        if (!owner || !members.has(owner)) continue;
        const key = `${owner}|${b.domain}|${b.category}`;
        const t = totals.get(key) ?? { userId: owner, domain: b.domain, category: b.category, seconds: 0 };
        t.seconds += Math.round((Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000);
        totals.set(key, t);
      }
      return [...totals.values()];
    },
    teamWork: async (teamId) => {
      const a = me();
      const visible = projects.filter((p) => p.teamId === teamId && projectRole(p.id, a.id));
      const ids = new Set(visible.map((p) => p.id));
      const own = tasks.filter((t) => ids.has(t.projectId));
      const pendingOf = (taskId: string) => reviews.find((r) => r.taskId === taskId && r.status === 'pending') ?? null;
      const withTime = own.map(
        (t): Task => {
          const pending = pendingOf(t.id);
          return {
            ...t,
            loggedSeconds: ownSeconds(t.id) + own.filter((c) => c.parentId === t.id).reduce((s2, c) => s2 + ownSeconds(c.id), 0),
            pendingReview: pending
              ? { id: pending.id, submittedBy: pending.submittedBy, reviewerId: pending.reviewerId, answers: pending.answers, links: pending.links, createdAt: pending.createdAt, attachments: pending.attachments }
              : null,
          };
        },
      );
      const estimateOf = (t: MockTask) => t.estimateMinutes ?? own.filter((c) => c.parentId === t.id).reduce((s2, c) => s2 + (c.estimateMinutes ?? 0), 0);
      return {
        projects: visible
          .map((p): Project => {
            const pt = own.filter((t) => t.projectId === p.id);
            return {
              id: p.id,
              name: p.name,
              archivedAt: p.archivedAt,
              myRole: projectRole(p.id, a.id) ?? 'contributor',
              reviewTemplate: templateOf(p.id),
              tasksTotal: pt.length,
              tasksDone: pt.filter((t) => t.status === 'done').length,
              pendingReviews: pt.filter((t) => t.status === 'review').length,
              loggedSeconds: pt.reduce((s2, t) => s2 + ownSeconds(t.id), 0),
              estimateMinutes: pt.filter((t) => !t.parentId).reduce((s2, t) => s2 + estimateOf(t), 0),
            };
          })
          .sort((x, y) => Number(!!x.archivedAt) - Number(!!y.archivedAt) || x.name.localeCompare(y.name)),
        tasks: withTime,
        members: Object.fromEntries(
          visible.map((p) => [
            p.id,
            projectMembers
              .filter((m) => m.projectId === p.id)
              .map((m) => ({ userId: m.userId, role: m.role, displayName: profiles.get(m.userId)?.displayName ?? byId(m.userId)?.displayName ?? null })),
          ]),
        ),
      };
    },
    createProject: async (teamId, name) => {
      const a = me();
      if (!canManage(teamId, a.id)) fail('No permitido');
      if (name.trim().length < 2 || name.trim().length > 80) fail('El nombre debe tener entre 2 y 80 caracteres', 'invalid');
      const id = crypto.randomUUID();
      projects.push({ id, teamId, name: name.trim(), archivedAt: null, template: null });
      projectMembers.push({ projectId: id, userId: a.id, role: 'lead' });
      return id;
    },
    setProjectArchived: async (projectId, archived) => {
      if (projectRole(projectId, me().id) !== 'manager') fail('No permitido');
      const p = projects.find((x) => x.id === projectId);
      if (p) p.archivedAt = archived ? (p.archivedAt ?? now().toISOString()) : null;
    },
    setProjectMember: async (projectId, userId, role) => {
      if (!canManageProject(projectId, me().id)) fail('No permitido');
      const team = projects.find((p) => p.id === projectId)?.teamId ?? '';
      if (!['owner', 'admin', 'member'].includes(roleIn(team, userId) ?? '')) {
        fail('Solo se añaden propietarios, administradores o miembros del equipo; un observador no pertenece a proyectos', 'invalid');
      }
      const existing = projectMembers.find((m) => m.projectId === projectId && m.userId === userId);
      if (existing) existing.role = role;
      else projectMembers.push({ projectId, userId, role });
    },
    removeProjectMember: async (projectId, userId) => {
      if (!canManageProject(projectId, me().id)) fail('No permitido');
      const i = projectMembers.findIndex((m) => m.projectId === projectId && m.userId === userId);
      if (i >= 0) projectMembers.splice(i, 1);
      for (const t of tasks) if (t.projectId === projectId && t.assigneeId === userId) t.assigneeId = null;
    },
    setReviewTemplate: async (projectId, fields) => {
      if (!canManageProject(projectId, me().id)) fail('No permitido');
      if (fields.length < 1 || fields.length > 15) fail('El formulario de entrega debe tener entre 1 y 15 campos', 'invalid');
      if (new Set(fields.map((f) => f.key)).size !== fields.length) fail('Dos campos del formulario no pueden tener la misma clave', 'invalid');
      if (!fields.some((f) => f.key === 'summary' && f.kind === 'text' && f.required)) fail('El campo «Qué se hizo» debe existir y ser texto obligatorio', 'invalid');
      const p = projects.find((x) => x.id === projectId);
      if (p) p.template = fields;
    },
    createTask: async (projectId, input, extras = {}) => {
      const a = me();
      const manager = canManageProject(projectId, a.id);
      if (!projectRole(projectId, a.id)) fail('No permitido');
      if (!manager && ((input.assigneeId && input.assigneeId !== a.id) || (extras.collaborators ?? []).length > 0)) {
        fail('No permitido: solo puedes crear tareas para ti');
      }
      if (!['todo', 'doing'].includes(input.status)) fail('Una tarea nueva empieza por hacer o en curso', 'invalid');
      if (extras.parentId) {
        const parent = tasks.find((t) => t.id === extras.parentId);
        if (!parent || parent.projectId !== projectId || parent.parentId) {
          fail('Una subtarea va dentro de una tarea del mismo proyecto, y una subtarea no tiene subtareas', 'invalid');
        }
      }
      assertOpen(projectId);
      ensureMember(projectId, input.assigneeId, a.id);
      for (const c of extras.collaborators ?? []) ensureMember(projectId, c, a.id);
      const id = crypto.randomUUID();
      const at = now().toISOString();
      tasks.push({
        ...cleanTask(input),
        id,
        projectId,
        parentId: extras.parentId ?? null,
        createdBy: a.id,
        updatedAt: at,
        startedAt: input.status === 'doing' ? at : null,
        completedAt: null,
        collaborators: (extras.collaborators ?? []).filter((c) => c !== input.assigneeId),
        criteria: (extras.criteria ?? []).map((text) => text.trim()).filter(Boolean).map((text) => ({ id: crypto.randomUUID(), text, met: false })),
      });
      log(id, 'created', { status: input.status, assignee: input.assigneeId });
      return id;
    },
    updateTask: async (taskId, input) => {
      const a = me();
      const t = findTask(taskId);
      if (!canManageProject(t.projectId, a.id)) fail('No permitido');
      assertOpen(t.projectId);
      if (input.status !== t.status && !['todo', 'doing'].includes(input.status)) {
        fail('A «En revisión» se llega enviando la tarea y a «Hecha» aprobándola', 'invalid');
      }
      ensureMember(t.projectId, input.assigneeId, a.id);
      if (t.status === 'review' && input.status !== 'review') {
        for (const r of reviews) if (r.taskId === taskId && r.status === 'pending') Object.assign(r, { status: 'changes_requested', decidedBy: a.id, decidedAt: now().toISOString(), comment: 'Reabierta por quien gestiona el proyecto' });
      }
      const before = { ...t };
      Object.assign(t, cleanTask(input), {
        updatedAt: now().toISOString(),
        startedAt: input.status === 'doing' ? (t.startedAt ?? now().toISOString()) : t.startedAt,
        completedAt: input.status === 'done' ? t.completedAt : null,
      });
      if (before.status !== t.status) log(taskId, 'status_changed', { from: before.status, to: t.status });
      if (before.assigneeId !== t.assigneeId) log(taskId, 'assignee_changed', { from: before.assigneeId, to: t.assigneeId });
      if (before.estimateMinutes !== t.estimateMinutes) log(taskId, 'estimate_changed', { from: before.estimateMinutes, to: t.estimateMinutes });
    },
    setTaskStatus: async (taskId, status) => {
      const a = me();
      const t = findTask(taskId);
      const manager = canManageProject(t.projectId, a.id);
      if (!(manager || (isWorker(t, a.id) && projectRole(t.projectId, a.id)))) fail('No permitido');
      assertOpen(t.projectId);
      if (t.status === 'review') fail('La tarea está en revisión: espera la decisión', 'invalid');
      if (t.status === 'done' && !manager) fail('Solo quien gestiona el proyecto reabre una tarea hecha');
      if (t.status === status) return;
      log(taskId, 'status_changed', { from: t.status, to: status });
      Object.assign(t, { status, startedAt: status === 'doing' ? (t.startedAt ?? now().toISOString()) : t.startedAt, completedAt: null, updatedAt: now().toISOString() });
    },
    setTaskCollaborators: async (taskId, userIds) => {
      const a = me();
      const t = findTask(taskId);
      if (!(canManageProject(t.projectId, a.id) || (t.assigneeId === a.id && t.assigneeCanManage && projectRole(t.projectId, a.id)))) fail('No permitido');
      assertOpen(t.projectId);
      for (const u of userIds) ensureMember(t.projectId, u, a.id);
      t.collaborators = [...new Set(userIds)].filter((u) => u !== t.assigneeId);
      log(taskId, 'collaborators_changed', { users: userIds });
    },
    setTaskCriteria: async (taskId, texts) => {
      const t = findTask(taskId);
      if (!canManageProject(t.projectId, me().id)) fail('No permitido');
      assertOpen(t.projectId);
      if (texts.length > 20) fail('Una tarea tiene como máximo 20 criterios', 'invalid');
      t.criteria = texts.map((text) => text.trim()).filter(Boolean).map((text) => ({ id: crypto.randomUUID(), text, met: false }));
      log(taskId, 'criteria_changed', { count: texts.length });
    },
    takeTask: async (taskId) => {
      const a = me();
      const t = findTask(taskId);
      if (!projectRole(t.projectId, a.id) || !projectMembers.some((m) => m.projectId === t.projectId && m.userId === a.id)) fail('No permitido');
      assertOpen(t.projectId);
      if (t.assigneeId) fail('La tarea ya tiene responsable', 'invalid');
      if (!['todo', 'doing'].includes(t.status)) fail('La tarea ya está en revisión o hecha', 'invalid');
      t.assigneeId = a.id;
      t.collaborators = t.collaborators.filter((c) => c !== a.id);
      log(taskId, 'assignee_changed', { from: null, to: a.id, taken: true });
    },
    completeTask: async (task, _teamId, sub) => {
      const a = me();
      const t = findTask(task.id);
      if (!canManageProject(t.projectId, a.id)) fail('No permitido');
      assertOpen(t.projectId);
      if (t.status === 'done') fail('La tarea ya está hecha', 'invalid');
      assertDelivery(t, sub.answers, sub.files, sub.criteriaMet);
      const at = now().toISOString();
      const pending = reviews.find((r) => r.taskId === t.id && r.status === 'pending');
      const { attachments, answers } = mockAttachments(t, sub.files, sub.answers);
      let id: string;
      if (pending) {
        Object.assign(pending, { status: 'approved', decidedBy: a.id, decidedAt: at, answers, attachments: [...pending.attachments, ...attachments] });
        id = pending.id;
      } else {
        id = crypto.randomUUID();
        reviews.push({ id, taskId: t.id, submittedBy: a.id, reviewerId: null, answers, links: [], createdAt: at, attachments, status: 'approved', decidedBy: a.id, comment: null, decidedAt: at });
        log(t.id, 'review_submitted', { review: id, direct: true });
      }
      t.criteria = t.criteria.map((c) => ({ ...c, met: true }));
      Object.assign(t, { status: 'done', startedAt: t.startedAt ?? at, completedAt: at, updatedAt: at });
      log(t.id, 'review_approved', { review: id, direct: true });
      return id;
    },
    deleteTask: async (taskId) => {
      const t = findTask(taskId);
      if (!canManageProject(t.projectId, me().id)) fail('No permitido');
      assertOpen(t.projectId);
      const gone = new Set([taskId, ...tasks.filter((x) => x.parentId === taskId).map((x) => x.id)]);
      for (let i = tasks.length - 1; i >= 0; i--) if (gone.has(tasks[i]!.id)) tasks.splice(i, 1);
      for (const e of uploaded.entries) if (e.taskId && gone.has(e.taskId)) e.taskId = null;
    },
    deleteProject: async (projectId, confirmName) => {
      const p = projects.find((x) => x.id === projectId);
      if (!p || !canManage(p.teamId, me().id)) fail('No permitido');
      if (confirmName.trim() !== p!.name) fail('Escribe el nombre exacto del proyecto para borrarlo', 'invalid');
      const gone = new Set(tasks.filter((x) => x.projectId === projectId).map((x) => x.id));
      for (let i = tasks.length - 1; i >= 0; i--) if (gone.has(tasks[i]!.id)) tasks.splice(i, 1);
      for (const e of uploaded.entries) if (e.taskId && gone.has(e.taskId)) e.taskId = null;
      for (let i = projectMembers.length - 1; i >= 0; i--) if (projectMembers[i]!.projectId === projectId) projectMembers.splice(i, 1);
      projects.splice(projects.indexOf(p!), 1);
    },
    submitForReview: async (task, _teamId, sub) => {
      const a = me();
      const t = findTask(task.id);
      if (!isWorker(t, a.id) || !projectRole(t.projectId, a.id)) fail('No permitido: envía a revisión el responsable o un apoyo de la tarea');
      assertOpen(t.projectId);
      if (!['todo', 'doing'].includes(t.status)) fail('La tarea ya está en revisión o hecha', 'invalid');
      assertDelivery(t, sub.answers, sub.files, sub.criteriaMet);
      if (sub.reviewerId && (sub.reviewerId === a.id || !projectMembers.some((m) => m.projectId === t.projectId && m.userId === sub.reviewerId))) {
        fail('El revisor debe ser otra persona del proyecto', 'invalid');
      }
      const id = crypto.randomUUID();
      t.criteria = t.criteria.map((c) => ({ ...c, met: true }));
      const delivered = mockAttachments(t, sub.files, sub.answers);
      reviews.push({
        id,
        taskId: t.id,
        submittedBy: a.id,
        reviewerId: sub.reviewerId,
        answers: delivered.answers,
        links: [],
        createdAt: now().toISOString(),
        attachments: delivered.attachments,
        status: 'pending',
        decidedBy: null,
        comment: null,
        decidedAt: null,
      });
      Object.assign(t, { status: 'review', startedAt: t.startedAt ?? now().toISOString(), updatedAt: now().toISOString() });
      log(t.id, 'review_submitted', { review: id, reviewer: sub.reviewerId });
      return id;
    },
    reviewTask: async (reviewId, approve, comment) => {
      const a = me();
      const r = reviews.find((x) => x.id === reviewId);
      const t = r ? findTask(r.taskId) : null;
      const manager = t ? canManageProject(t.projectId, a.id) : false;
      if (!r || !t || !projectRole(t.projectId, a.id) || !(manager || r.reviewerId === a.id) || (r.submittedBy === a.id && !manager)) {
        fail('No permitido: decide el revisor pedido o quien gestiona el proyecto');
      }
      if (r!.status !== 'pending') fail('Esta revisión ya tiene decisión', 'invalid');
      if (!approve && !(comment ?? '').trim()) fail('Explica qué cambios hacen falta (hasta 2000 caracteres)', 'invalid');
      Object.assign(r!, { status: approve ? 'approved' : 'changes_requested', decidedBy: a.id, decidedAt: now().toISOString(), comment: comment?.trim() || null });
      Object.assign(t!, { status: approve ? 'done' : 'doing', completedAt: approve ? now().toISOString() : null, updatedAt: now().toISOString() });
      log(t!.id, approve ? 'review_approved' : 'changes_requested', { review: reviewId, comment: comment?.trim() || null });
    },
    taskHistory: async (taskId) => {
      const t = findTask(taskId);
      if (!projectRole(t.projectId, me().id)) fail('No permitido');
      return {
        events: events.filter((e) => e.taskId === taskId),
        reviews: reviews.filter((r) => r.taskId === taskId).reverse(),
      };
    },
    evidenceUrl: async (path) => `data:text/plain,${encodeURIComponent(`Archivo de ejemplo: ${path}`)}`,
    projectTimeSummary: async (projectId, from, to) => {
      if (!canManageProject(projectId, me().id)) fail('No permitido');
      const team = projects.find((p) => p.id === projectId)?.teamId ?? '';
      const ids = new Set(tasks.filter((t) => t.projectId === projectId).map((t) => t.id));
      const totals = new Map<string | null, number>();
      for (const e of uploaded.entries) {
        if (!e.taskId || !ids.has(e.taskId) || e.deletedAt) continue;
        const start = Math.max(Date.parse(e.startedAt), Date.parse(from));
        const end = Math.min(e.endedAt ? Date.parse(e.endedAt) : now().getTime(), Date.parse(to));
        if (end <= start) continue;
        const owner = entryOwner.get(e.id) ?? null;
        const key = owner && roleIn(team, owner) ? owner : null;
        totals.set(key, (totals.get(key) ?? 0) + Math.round((end - start) / 1000));
      }
      return [...totals].map(([userId, seconds]) => ({ userId, seconds }));
    },
    upsertBlocks: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      // Respaldo del servidor de PS-05 (D-8): sin compartir nombres, el bloque se guarda sin app ni dominio.
      upload(
        uploaded.blocks,
        rows.map((r) => (sharesNames(r.teamId, userId) ? r : { ...r, appName: 'App oculta', domain: null })),
        (r) => r.id,
      );
      for (const r of rows) blockOwner.set(r.id, userId);
    },
    upsertEntries: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      for (const r of rows) {
        const task = r.taskId ? tasks.find((t) => t.id === r.taskId) : null;
        if (r.taskId && (!task || projects.find((p) => p.id === task.projectId)?.teamId !== r.teamId)) {
          fail('La tarea no es de este equipo', 'invalid');
        }
      }
      upload(uploaded.entries, rows, (r) => r.id);
      for (const r of rows) entryOwner.set(r.id, userId);
    },
    upsertClosures: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      upload(uploaded.closures, rows, (r) => r.id);
    },
    setBlockAiUsage: async (blockId, usage) => {
      if (offline) fail('Sin conexión', 'network');
      // Como set_block_ai_usage: solo bloques ya subidos (en la nube real, además, propios y de IA).
      if (!blockOwner.has(blockId)) fail('No permitido: solo puedes etiquetar tus propios bloques de IA');
      aiUsages.set(blockId, usage);
    },

    // ---- Tableros, presencia y ajustes (F5): imitan las funciones de 20261013000001 ----
    teamDashboard: async (teamId, from, to) => {
      const a = me();
      const role = roleIn(teamId, a.id);
      if (!role) fail('No permitido');
      const fromMs = Date.parse(from);
      const toMs = Date.parse(to);
      assertPeriod(fromMs, toMs);
      const cfg = settingsOf(teamId);
      const people = members.filter((m) => m.teamId === teamId && m.role !== 'viewer').map((m) => m.userId);
      const show = role === 'owner' || role === 'admin' || people.length >= 2;
      const blocks = dashboardBlocks(teamId, new Set(people), fromMs, toMs);
      const sum = (list: DashBlock[]): Record<keyof HoursByCategory, number> => {
        const out = { productive: 0, neutral: 0, distraction: 0, ai: 0 };
        for (const b of list) out[b.category] += b.sec;
        return out;
      };
      const active = (c: Record<keyof HoursByCategory, number>) => c.productive + c.neutral + c.distraction + c.ai;
      const prod = (c: Record<keyof HoursByCategory, number>) => c.productive + (cfg.aiCountsAsProductive ? c.ai : 0);
      const hours = (c: Record<keyof HoursByCategory, number>): HoursByCategory => ({
        productive: hrs(c.productive), neutral: hrs(c.neutral), distraction: hrs(c.distraction), ai: hrs(c.ai),
      });
      const teamProjects = new Set(projects.filter((p) => p.teamId === teamId).map((p) => p.id));
      const teamTasks = tasks.filter((t) => teamProjects.has(t.projectId));
      const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? '';
      const doing = (userId: string, only?: Set<string>) =>
        teamTasks
          .filter((t) => t.assigneeId === userId && t.status === 'doing' && (!only || only.has(t.projectId)))
          .map((t) => ({ id: t.id, title: t.title, projectId: t.projectId, projectName: projectName(t.projectId) }))
          .sort((x, y) => x.projectName.localeCompare(y.projectName) || x.title.localeCompare(y.title));

      const all = sum(blocks);
      const aiBlocks = blocks.filter((b) => b.category === 'ai');
      const aiTool: Record<string, number> = {};
      const aiUsage = { code: 0, writing: 0, analysis: 0, other: 0, untagged: 0 };
      for (const b of aiBlocks) {
        const tool = (b.aiTool ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const key = ['chatgpt', 'claude', 'gemini', 'deepseek', 'copilot', 'ollama', 'lmstudio'].includes(tool) ? tool : 'other';
        aiTool[key] = (aiTool[key] ?? 0) + b.sec;
        aiUsage[b.usage ?? 'untagged'] += b.sec;
      }

      // D-6: capacidad = horas de la jornada × días laborales del periodo hasta hoy incluido.
      const [sh, sm] = cfg.workday.start.split(':').map(Number) as [number, number];
      const [eh, em] = cfg.workday.end.split(':').map(Number) as [number, number];
      const today = localDate(now());
      const days = localDays(fromMs, toMs);
      const capSec = Math.max(0, (eh * 60 + em - (sh * 60 + sm)) * 60) * days.filter((d) => d.date <= today && cfg.workday.days.includes(d.iso)).length;

      const manager = role === 'owner' || role === 'admin';
      const leadProjects = new Set(
        role === 'member' ? projects.filter((p) => p.teamId === teamId && projectMembers.some((m) => m.projectId === p.id && m.userId === a.id && m.role === 'lead')).map((p) => p.id) : [],
      );
      const isLead = leadProjects.size > 0;
      let leadMembers: unknown[] = [];
      if (isLead) {
        const leadPeople = [...new Set(projectMembers.filter((m) => leadProjects.has(m.projectId) && people.includes(m.userId)).map((m) => m.userId))];
        const leadTasks = new Set(tasks.filter((t) => leadProjects.has(t.projectId)).map((t) => t.id));
        leadMembers = leadPeople
          .map((userId) => {
            // Temporizadores propios en tareas de sus proyectos; los que se solapan se unen para no contar la IA dos veces.
            const spans = uploaded.entries
              .filter((e) => e.teamId === teamId && !e.deletedAt && e.taskId && leadTasks.has(e.taskId) && entryOwner.get(e.id) === userId)
              .map((e): [number, number] => [Math.max(Date.parse(e.startedAt), fromMs), Math.min(e.endedAt ? Date.parse(e.endedAt) : now().getTime(), toMs)])
              .filter(([s0, e0]) => e0 > s0)
              .sort((x, y) => x[0] - y[0]);
            const merged: [number, number][] = [];
            for (const [s0, e0] of spans) {
              const last = merged[merged.length - 1];
              if (last && s0 <= last[1]) last[1] = Math.max(last[1], e0);
              else merged.push([s0, e0]);
            }
            const aiSec = aiBlocks.filter((b) => b.user === userId).reduce((t0, b) => t0 + merged.reduce((t1, [s0, e0]) => t1 + overlapSec(b.start, b.end, s0, e0), 0), 0);
            return {
              userId,
              name: nameOf(userId),
              projectHours: hrs(spans.reduce((t0, [s0, e0]) => t0 + (e0 - s0) / 1000, 0)),
              aiHoursInProjects: hrs(aiSec),
              tasksDoing: doing(userId, leadProjects),
            };
          })
          .sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''));
      }

      const apps = new Map<string, number>();
      for (const b of blocks) if (b.appName !== 'App oculta') apps.set(b.appName, (apps.get(b.appName) ?? 0) + b.sec);

      return TeamDashboardSchema.parse({
        role,
        isLead,
        totals: show
          ? {
              members: people.length,
              hoursActive: hrs(active(all)),
              hoursProductive: hrs(prod(all)),
              hoursCategory: hours(all),
              aiHours: hrs(all.ai),
              aiSessions: aiBlocks.filter((b) => b.start >= fromMs).length,
              aiTool: Object.fromEntries(Object.entries(aiTool).map(([k, v]) => [k, hrs(v)])),
              aiUsage: Object.fromEntries(Object.entries(aiUsage).map(([k, v]) => [k, hrs(v)])),
              tasksDoing: teamTasks.filter((t) => t.status === 'doing').length,
              tasksDone: teamTasks.filter((t) => t.status === 'done' && t.completedAt && Date.parse(t.completedAt) >= fromMs && Date.parse(t.completedAt) < toMs).length,
            }
          : null,
        perDay: show
          ? days.map((d) => ({
              day: d.date,
              hoursCategory: hours(sum(blocks.map((b) => ({ ...b, sec: overlapSec(b.start, b.end, Math.max(d.s, fromMs), Math.min(d.e, toMs)) })))),
            }))
          : [],
        members: manager
          ? people
              .map((userId) => {
                const mine = blocks.filter((b) => b.user === userId);
                const c = sum(mine);
                return {
                  userId,
                  name: nameOf(userId),
                  shareAppNames: sharesNames(teamId, userId),
                  hoursActive: hrs(active(c)),
                  hoursProductive: hrs(prod(c)),
                  hoursCategory: hours(c),
                  aiHours: hrs(c.ai),
                  aiSessions: mine.filter((b) => b.category === 'ai' && b.start >= fromMs).length,
                  capacityHours: hrs(capSec),
                  capacityShare: capSec > 0 ? Math.round((100 * active(c)) / capSec) : null,
                  tasksDoing: doing(userId),
                };
              })
              .sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''))
          : [],
        leadMembers,
        topApps: manager
          ? [...apps].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0])).slice(0, 10).map(([appName, sec]) => ({ appName, hours: hrs(sec) }))
          : [],
      });
    },
    teamPresence: async (teamId) => {
      const a = me();
      const role = roleIn(teamId, a.id);
      if (!role || role === 'viewer') fail('No permitido');
      const leadProjects = new Set(
        role === 'member' ? projects.filter((p) => p.teamId === teamId && projectMembers.some((m) => m.projectId === p.id && m.userId === a.id && m.role === 'lead')).map((p) => p.id) : [],
      );
      const seeAll = role === 'owner' || role === 'admin' || (role === 'member' && settingsOf(teamId).presenceVisibleToMembers);
      if (!seeAll && leadProjects.size === 0) fail('No permitido');
      const visible = new Set(projectMembers.filter((m) => leadProjects.has(m.projectId)).map((m) => m.userId));
      const recent = now().getTime() - 3 * 60_000;
      return members
        .filter((m) => m.teamId === teamId && m.role !== 'viewer' && (seeAll || visible.has(m.userId)))
        .map((m): Presence => {
          const last = uploaded.blocks
            .filter((b) => b.teamId === teamId && blockOwner.get(b.id) === m.userId)
            .sort((x, y) => Date.parse(y.endedAt) - Date.parse(x.endedAt))[0];
          if (!last || Date.parse(last.endedAt) < recent) return { userId: m.userId, name: nameOf(m.userId), state: 'offline', since: null };
          const state: PresenceState = last.category === 'idle' ? 'idle' : last.category === 'paused' ? 'paused' : last.category === 'break' ? 'break' : 'active';
          return { userId: m.userId, name: nameOf(m.userId), state, since: last.startedAt };
        })
        .sort((x, y) => (x.name ?? '').localeCompare(y.name ?? ''));
    },
    setTeamSettings: async (teamId, input) => {
      if (!canManage(teamId, me().id)) fail('No permitido');
      if (input.idleMinutes !== null && (input.idleMinutes < 3 || input.idleMinutes > 15)) fail('El umbral de inactividad debe estar entre 3 y 15 minutos', 'invalid');
      if (!(PAUSE_CAP_MINUTES as readonly number[]).includes(input.pauseCapMinutes)) {
        fail('El tope de pausa debe ser 0 (sin tope), 15, 30, 60, 120 o 240 minutos', 'invalid');
      }
      const { days, start, end } = input.workday;
      if (days.length === 0) fail('La jornada necesita al menos un día', 'invalid');
      if (days.some((d) => !Number.isInteger(d) || d < 1 || d > 7)) fail('Los días de la jornada van de 1 (lunes) a 7 (domingo)', 'invalid');
      if (new Set(days).size !== days.length) fail('Los días de la jornada no pueden repetirse', 'invalid');
      const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
      if (!hhmm.test(start) || !hhmm.test(end)) fail('El inicio y el fin de la jornada van en formato HH:MM', 'invalid');
      if (start >= end) fail('El inicio de la jornada debe ser anterior al fin', 'invalid');
      const workday = { days: [...days].sort((x, y) => x - y), start, end };
      teamSettings.set(teamId, { ...input, workday });
      writeAudit(teamId, 'settings_changed', null, {
        idle_minutes: input.idleMinutes,
        workday,
        ai_counts_as_productive: input.aiCountsAsProductive,
        presence_visible_to_members: input.presenceVisibleToMembers,
        pause_cap_minutes: input.pauseCapMinutes,
      });
    },
    setShareAppNames: async (teamId, share) => {
      const a = me();
      const role = roleIn(teamId, a.id);
      if (!role || role === 'viewer') fail('No permitido');
      shareNames.set(`${teamId}|${a.id}`, share);
      if (!share) {
        // Capa 3 de D-8: también se ocultan los bloques ya subidos en este equipo.
        uploaded.blocks.forEach((b, i) => {
          if (b.teamId === teamId && blockOwner.get(b.id) === a.id) uploaded.blocks[i] = { ...b, appName: 'App oculta', domain: null };
        });
      }
      writeAudit(teamId, 'share_apps_changed', a.id, { share });
    },
    myTimeByTask: async (teamId, from, to) => {
      const a = me();
      const role = roleIn(teamId, a.id);
      if (!role || role === 'viewer') fail('No permitido');
      const fromMs = Date.parse(from);
      const toMs = Date.parse(to);
      assertPeriod(fromMs, toMs);
      const totals = new Map<string, TimeByTask>();
      for (const e of uploaded.entries) {
        if (e.teamId !== teamId || e.deletedAt || entryOwner.get(e.id) !== a.id) continue;
        const sec = overlapSec(Date.parse(e.startedAt), e.endedAt ? Date.parse(e.endedAt) : now().getTime(), fromMs, toMs);
        if (sec <= 0) continue;
        const task = e.taskId ? tasks.find((t) => t.id === e.taskId) : undefined;
        const project = task ? projects.find((p) => p.id === task.projectId) : undefined;
        const key = task?.id ?? 'none';
        const row = totals.get(key) ?? { projectId: project?.id ?? null, projectName: project?.name ?? null, taskId: task?.id ?? null, taskTitle: task?.title ?? null, seconds: 0 };
        row.seconds += sec;
        totals.set(key, row);
      }
      return [...totals.values()]
        .map((r) => ({ ...r, seconds: Math.round(r.seconds) }))
        .sort((x, y) => (x.projectName ?? '\uffff').localeCompare(y.projectName ?? '\uffff') || (x.taskTitle ?? '\uffff').localeCompare(y.taskTitle ?? '\uffff'));
    },
    auditLog: async (teamId, options = {}) => {
      if (!canManage(teamId, me().id)) return [];
      return audit
        .filter((r) => r.teamId === teamId && (options.action === undefined || r.action === options.action) && (options.beforeId === undefined || r.id < options.beforeId))
        .sort((x, y) => y.id - x.id)
        .slice(0, AUDIT_PAGE_SIZE)
        .map((r): AuditEntry => ({ id: r.id, action: r.action, actorId: r.actorId, targetUserId: r.targetUserId, details: r.details, createdAt: r.createdAt }));
    },

    reportFacts: async (req) => {
      assertCanGenerate(req, me().id);
      return factsOf(req);
    },
    saveReport: async (req, factsHash, narrative, mode, validation, language) => {
      const a = me();
      assertCanGenerate(req, a.id);
      const f = factsOf(req);
      if (f.factsHash !== factsHash) fail('Los datos cambiaron mientras se generaba el reporte: vuelve a generarlo', 'invalid');
      const ids = new Set(f.facts.map((x) => x.id));
      const items = [...narrative.insights, ...narrative.recommendations];
      if (!narrative.summary || narrative.insights.length > 4 || narrative.recommendations.length > 3 || items.some((i) => !i.fact_ids.length || i.fact_ids.some((id) => !ids.has(id)))) {
        fail('La narrativa no tiene el formato del reporte', 'invalid');
      }
      return store(req, f, narrative, mode, validation, language, a.id).id;
    },
    findReport: async (req, facts, language) => findCached(req, facts, language),
    report: async (id) => reports.find((r) => r.id === id && canSee(r, me().id)) ?? null,
    reports: async (teamId) => reports.filter((r) => r.teamId === teamId && canSee(r, me().id)),
    generateFreeReport: async (req, language) => {
      const a = me();
      assertCanGenerate(req, a.id);
      const f = factsOf(req);
      const cached = findCached(req, f, language);
      if (cached) return { report: cached, cached: true };
      const used = trialUse.get(a.id) ?? 0;
      if (used >= TRIAL_PER_USER) throw new TrialError('user_limit');
      trialUse.set(a.id, used + 1);
      return { report: store(req, f, fallbackNarrative(f.facts, language), 'free', 'ok', language, a.id), cached: false };
    },
    memberNames: async () => {
      const a = me();
      const teamsOfMe = members.filter((m) => m.userId === a.id).map((m) => m.teamId);
      const ids = new Set(members.filter((m) => teamsOfMe.includes(m.teamId)).map((m) => m.userId));
      return [...ids].map((id) => profiles.get(id)?.displayName ?? byId(id)?.displayName ?? '').filter(Boolean);
    },
  };
}
