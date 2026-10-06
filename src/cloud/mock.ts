/**
 * Nube simulada en memoria: permite usar cuentas y equipos en `npm run dev` y en las pruebas,
 * sin red. Imita las reglas de las funciones SQL (docs/ROLES.md); la fuente de verdad sigue siendo
 * la base de datos, probada en supabase/tests.
 * El código de verificación y de recuperación siempre es MOCK_CODE.
 */
import type { SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';
import {
  CloudError,
  DEFAULT_WORKDAY,
  WRONG_INVITATION_CODE,
  type Cloud,
  type CloudUser,
  type Member,
  type MyTeam,
  type Profile,
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
  let offline = false;
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
  const pendingFor = (email: string) =>
    invitations.filter((i) => i.email === email && i.status === 'pending' && Date.parse(i.expiresAt) > now().getTime());

  return {
    source: 'mock',
    debug: {
      addAccount: (email, password, displayName) => addAccount(email, password, displayName),
      addTeam,
      addMember: (teamId, userId, role, consent = true) => {
        const at = consent ? now().toISOString() : null;
        members.push({ teamId, userId, role, consentAt: at, consentVersion: consent ? 'v1' : null, joinedAt: now().toISOString() });
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
    },
    leaveTeam: async (teamId) => {
      const a = me();
      const mine = roleIn(teamId, a.id);
      if (!mine) fail('No perteneces a este equipo');
      if (mine === 'owner' && owners(teamId) === 1) fail('El equipo debe conservar al menos un owner', 'invalid');
      members = members.filter((m) => !(m.teamId === teamId && m.userId === a.id));
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
        fail(WRONG_INVITATION_CODE, 'invalid');
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

    teamRules: async (teamId) => rules.get(teamId) ?? [],
    upsertBlocks: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      upload(uploaded.blocks, rows, (r) => r.id);
    },
    upsertEntries: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      upload(uploaded.entries, rows, (r) => r.id);
    },
    upsertClosures: async (userId, rows) => {
      checkConsent(userId, rows.map((r) => r.teamId));
      upload(uploaded.closures, rows, (r) => r.id);
    },
  };
}
