/**
 * Nube simulada en memoria: permite usar cuentas y equipos en `npm run dev` y en las pruebas,
 * sin red. Imita las reglas de las funciones SQL (docs/ROLES.md); la fuente de verdad sigue siendo
 * la base de datos, probada en supabase/tests.
 * El código de verificación y de recuperación siempre es MOCK_CODE.
 */
import type { SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';
import { CONSENT_VERSION } from '@/lib/consent';
import { deliveryFields } from '@/lib/evidence';
import {
  CloudError,
  DEFAULT_WORKDAY,
  wrongInvitationCode,
  type Cloud,
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
  };
}

const fail = (message: string, kind: CloudError['kind'] = 'forbidden') => {
  throw new CloudError(message, kind);
};

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
      fail('Solo se añaden owners, admins o members del equipo; un viewer no pertenece a proyectos', 'invalid');
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
            workday: DEFAULT_WORKDAY,
            allowHiddenApps: policies.get(m.teamId) ?? true,
            alertNotAllowed: alerts.get(m.teamId)?.enabled ?? true,
            alertRepeatMinutes: alerts.get(m.teamId)?.repeat ?? 10,
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
      if (target === 'owner' && role !== 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un owner', 'invalid');
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
      if (target === 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un owner', 'invalid');
      members = members.filter((m) => !(m.teamId === teamId && m.userId === userId));
      leaveWork(teamId, userId);
    },
    leaveTeam: async (teamId) => {
      const a = me();
      const mine = roleIn(teamId, a.id);
      if (!mine) fail('No perteneces a este equipo');
      if (mine === 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un owner', 'invalid');
      members = members.filter((m) => !(m.teamId === teamId && m.userId === a.id));
      leaveWork(teamId, a.id);
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
    removeDomainRule: async (ruleId) => {
      const i = domainRules.findIndex((r) => r.id === ruleId);
      if (i < 0 || !canManage(domainRules[i]!.teamId, me().id)) fail('No tienes permiso para esta acción.');
      domainRules.splice(i, 1);
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
        fail('Solo se añaden owners, admins o members del equipo; un viewer no pertenece a proyectos', 'invalid');
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
      upload(uploaded.blocks, rows, (r) => r.id);
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
  };
}
