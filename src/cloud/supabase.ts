/**
 * Nube real: Supabase (Auth + Postgres con RLS + funciones SQL de supabase/migrations).
 * La sesión no va al almacenamiento del navegador: se guarda con el puente (Rust la cifra, PS-08).
 */
import { createClient, type SupabaseClient, type SupportedStorage, type User } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Bridge, SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';
import type { Database } from '@/lib/database.types';
import {
  CloudError,
  DEFAULT_WORKDAY,
  DomainRuleSchema,
  DomainUsageSchema,
  MemberSchema,
  MyInvitationSchema,
  MyTeamSchema,
  ProfileSchema,
  TeamInvitationSchema,
  TeamRoleSchema,
  WorkdaySchema,
  WRONG_INVITATION_CODE,
  type Cloud,
  type CloudUser,
} from './contract';

/**
 * Almacenamiento de la sesión en el puente. supabase-js guarda varias claves; aquí se juntan en un
 * solo JSON y cada cambio se escribe en orden (sin carreras entre escrituras).
 */
export function bridgeStorage(bridge: Bridge): SupportedStorage {
  let cache: Record<string, string> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const load = async () => {
    if (cache === null) {
      const raw = await bridge.sessionGet();
      try {
        cache = raw ? (z.record(z.string(), z.string()).parse(JSON.parse(raw)) as Record<string, string>) : {};
      } catch {
        cache = {};
      }
    }
    return cache;
  };
  const persist = (change: (c: Record<string, string>) => void) => {
    queue = queue.then(async () => {
      const c = await load();
      change(c);
      await (Object.keys(c).length > 0 ? bridge.sessionSet(JSON.stringify(c)) : bridge.sessionClear());
    });
    return queue;
  };
  return {
    getItem: async (key) => (await load())[key] ?? null,
    setItem: (key, value) =>
      persist((c) => {
        c[key] = value;
      }),
    removeItem: (key) =>
      persist((c) => {
        delete c[key];
      }),
  };
}

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'El correo o la contraseña no coinciden. Revísalos e inténtalo de nuevo.',
  email_not_confirmed: 'Tu correo aún no está verificado. Escribe el código que te enviamos.',
  otp_expired: 'El código no es válido o ya venció. Pide uno nuevo.',
  weak_password: 'La contraseña es muy débil. Usa al menos 8 caracteres, con letras y números.',
  same_password: 'La contraseña nueva debe ser distinta de la anterior.',
  user_already_exists: 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  email_exists: 'Ya existe una cuenta con ese correo. Inicia sesión o recupera tu contraseña.',
  email_address_invalid: 'El correo no es válido. Revísalo.',
  over_email_send_rate_limit: 'Se enviaron demasiados correos. Espera unos minutos antes de pedir otro código.',
  over_request_rate_limit: 'Demasiados intentos seguidos. Espera unos minutos.',
  signup_disabled: 'El registro de cuentas está desactivado en este proyecto.',
};

const isNetwork = (message: string) => /fetch|network|failed to fetch|networkerror|load failed/i.test(message);

/** Traduce un error de Supabase a un mensaje para la persona. */
export function toCloudError(error: { message: string; code?: string | null; status?: number }): CloudError {
  const code = error.code ?? '';
  const authMessage = AUTH_MESSAGES[code];
  if (authMessage) return new CloudError(authMessage, 'auth');
  // 5xx: el servidor (o un servicio suyo, como el de correo) no respondió a tiempo.
  // supabase-js los entrega como «HTTP 504» sin más; aquí se explican.
  if ((error.status ?? 0) >= 500 || /^HTTP 5\d\d$/.test(error.message)) {
    const status = error.status || Number(error.message.slice(5));
    return new CloudError(`El servidor no respondió a tiempo (error ${status}). Espera un minuto e inténtalo de nuevo.`, 'network');
  }
  if (isNetwork(error.message)) {
    return new CloudError('Sin conexión con el servidor. Tus datos siguen guardados en este equipo.', 'network');
  }
  // Las funciones SQL ya responden en español (raise exception '…').
  if (code === '42501') {
    const msg = /row-level security/i.test(error.message) ? 'No tienes permiso para esta acción.' : error.message;
    return new CloudError(msg, 'forbidden');
  }
  if (code === 'P0001' || code === '22023' || code.startsWith('23')) return new CloudError(error.message, 'invalid');
  if (code.startsWith('PGRST')) return new CloudError('El servidor rechazó la petición. Inténtalo de nuevo.', 'unknown');
  return new CloudError(error.message || 'Ocurrió un error inesperado.', 'unknown');
}

const toUser = (u: User | null | undefined): CloudUser | null =>
  u ? { id: u.id, email: u.email ?? '', emailVerified: Boolean(u.email_confirmed_at) } : null;

/** Lanza `CloudError` si la respuesta trae error; si no, devuelve los datos. */
type ErrorLike = { message: string; code?: string | null; status?: number };
async function run<R extends { data: unknown; error: ErrorLike | null }>(request: PromiseLike<R>): Promise<R['data']> {
  let result: R;
  try {
    result = await request;
  } catch (cause) {
    throw toCloudError({ message: cause instanceof Error ? cause.message : String(cause) });
  }
  if (result.error) throw toCloudError(result.error);
  return result.data;
}

const TeamRowSchema = z.object({
  team_id: z.uuid(),
  role: TeamRoleSchema,
  consent_at: z.string().nullable(),
  consent_version: z.string().nullable(),
  teams: z.object({ name: z.string(), settings: z.record(z.string(), z.unknown()).nullable() }),
});

export function createSupabaseCloud(bridge: Bridge, url: string, anonKey: string): Cloud {
  // Tipado con los tipos generados de la base (npm run db:types): nombres de tablas, columnas y funciones
  // se comprueban al compilar. Las respuestas se siguen validando con zod (ARQUITECTURA §5).
  const client: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
    auth: {
      storage: bridgeStorage(bridge),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  const auth = client.auth;
  type Fn = keyof Database['public']['Functions'];
  const rpc = <F extends Fn>(fn: F, args?: Database['public']['Functions'][F]['Args']) => run(client.rpc(fn, args));

  const requireUser = async () => {
    const { data } = await auth.getSession();
    const user = toUser(data.session?.user);
    if (!user) throw new CloudError('Tu sesión terminó. Vuelve a iniciar sesión.', 'auth');
    return user;
  };

  const readProfile = async (id: string) => {
    const row = await run(client.from('profiles').select('id, display_name, timezone').eq('id', id).maybeSingle());
    if (!row) return null;
    const r = row as { id: string; display_name: string; timezone: string };
    return ProfileSchema.parse({ id: r.id, displayName: r.display_name, timezone: r.timezone });
  };

  return {
    source: 'supabase',

    currentUser: async () => {
      const { data } = await auth.getSession();
      return toUser(data.session?.user);
    },
    onUserChange: (listener) => {
      const { data } = auth.onAuthStateChange((_event, session) => listener(toUser(session?.user)));
      return () => data.subscription.unsubscribe();
    },
    signUp: async (email, password, displayName) => {
      await run(auth.signUp({ email, password, options: { data: { display_name: displayName } } }));
    },
    verifySignUp: async (email, code) => {
      await run(auth.verifyOtp({ email, token: code, type: 'signup' }));
    },
    resendSignUpCode: async (email) => {
      await run(auth.resend({ type: 'signup', email }));
    },
    signIn: async (email, password) => {
      await run(auth.signInWithPassword({ email, password }));
    },
    signOut: async () => {
      // Sin red, el cierre de sesión local debe ocurrir igual.
      try {
        await auth.signOut();
      } finally {
        await bridge.sessionClear();
      }
    },
    requestPasswordReset: async (email) => {
      await run(auth.resetPasswordForEmail(email));
    },
    resetPassword: async (email, code, newPassword) => {
      await run(auth.verifyOtp({ email, token: code, type: 'recovery' }));
      await run(auth.updateUser({ password: newPassword }));
    },

    ensureProfile: async (fallbackTimezone) => {
      const { data } = await auth.getSession();
      const user = data.session?.user;
      if (!user) throw new CloudError('Tu sesión terminó. Vuelve a iniciar sesión.', 'auth');
      const existing = await readProfile(user.id);
      if (existing) return existing;
      const meta = z.object({ display_name: z.string().min(1).max(80) }).safeParse(user.user_metadata);
      const displayName = meta.success ? meta.data.display_name : (user.email ?? 'Persona').split('@')[0]!.slice(0, 80);
      await run(client.from('profiles').insert({ id: user.id, display_name: displayName, timezone: fallbackTimezone }));
      return ProfileSchema.parse({ id: user.id, displayName, timezone: fallbackTimezone });
    },
    saveProfile: async (displayName, timezone) => {
      const user = await requireUser();
      await run(client.from('profiles').update({ display_name: displayName, timezone }).eq('id', user.id));
      const saved = await readProfile(user.id);
      if (!saved) throw new CloudError('No se encontró tu perfil.', 'unknown');
      return saved;
    },

    myTeams: async () => {
      const user = await requireUser();
      const rows = await run(
        client
          .from('team_members')
          .select('team_id, role, consent_at, consent_version, teams(name, settings)')
          .eq('user_id', user.id),
      );
      return z
        .array(TeamRowSchema)
        .parse(rows)
        .map((r) => {
          const workday = WorkdaySchema.safeParse(r.teams.settings?.workday);
          const policies = z
            .object({ allow_hidden_apps: z.boolean(), alert_not_allowed: z.boolean(), alert_repeat_minutes: z.number().int() })
            .partial()
            .safeParse(r.teams.settings?.policies);
          const policy = policies.success ? policies.data : {};
          return MyTeamSchema.parse({
            id: r.team_id,
            name: r.teams.name,
            role: r.role,
            consentAt: r.consent_at,
            consentVersion: r.consent_version,
            workday: workday.success ? workday.data : DEFAULT_WORKDAY,
            allowHiddenApps: policy.allow_hidden_apps ?? true,
            alertNotAllowed: policy.alert_not_allowed ?? true,
            alertRepeatMinutes: policy.alert_repeat_minutes ?? 10,
          });
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'es'));
    },
    createTeam: async (name) => z.uuid().parse(await rpc('create_team', { p_name: name })),
    giveConsent: async (teamId, version) => {
      await rpc('give_consent', { p_team: teamId, p_version: version });
    },
    members: async (teamId) => {
      const rows = z
        .array(z.object({ user_id: z.uuid(), role: TeamRoleSchema, joined_at: z.string() }))
        .parse(await run(client.from('team_members').select('user_id, role, joined_at').eq('team_id', teamId)));
      const ids = rows.map((r) => r.user_id);
      const profiles = ids.length
        ? z
            .array(z.object({ id: z.uuid(), display_name: z.string() }))
            .parse(await run(client.from('profiles').select('id, display_name').in('id', ids)))
        : [];
      const names = new Map(profiles.map((p) => [p.id, p.display_name]));
      return rows.map((r) =>
        MemberSchema.parse({ userId: r.user_id, role: r.role, displayName: names.get(r.user_id) ?? null, joinedAt: r.joined_at }),
      );
    },
    setMemberRole: async (teamId, userId, role) => {
      await rpc('set_member_role', { p_team: teamId, p_user: userId, p_role: role });
    },
    removeMember: async (teamId, userId) => {
      await rpc('remove_member', { p_team: teamId, p_user: userId });
    },
    leaveTeam: async (teamId) => {
      await rpc('leave_team', { p_team: teamId });
    },

    teamInvitations: async (teamId) => {
      const rows = z
        .array(z.object({ id: z.uuid(), email: z.string(), role: TeamRoleSchema, expires_at: z.string(), code: z.string().nullable() }))
        .parse(
          await run(
            client
              .from('invitations')
              .select('id, email, role, expires_at, code')
              .eq('team_id', teamId)
              .eq('status', 'pending')
              .order('created_at'),
          ),
        );
      return rows.map((r) =>
        TeamInvitationSchema.parse({ id: r.id, email: r.email, role: r.role, expiresAt: r.expires_at, code: r.code }),
      );
    },
    invite: async (teamId, email, role) => {
      const [row] = z
        .array(z.object({ id: z.uuid(), code: z.string() }))
        .parse(await rpc('invite_member', { p_team: teamId, p_email: email, p_role: role }));
      if (!row) throw new CloudError('No se pudo crear la invitación.', 'unknown');
      return { code: row.code };
    },
    revokeInvitation: async (id) => {
      await rpc('revoke_invitation', { p_id: id });
    },
    myInvitations: async () => {
      const rows = z
        .array(
          z.object({
            id: z.uuid(),
            team_id: z.uuid(),
            team_name: z.string(),
            role: TeamRoleSchema,
            invited_by_name: z.string().nullable(),
            expires_at: z.string(),
          }),
        )
        .parse(await rpc('my_invitations'));
      return rows.map((r) =>
        MyInvitationSchema.parse({
          id: r.id,
          teamId: r.team_id,
          teamName: r.team_name,
          role: r.role,
          invitedByName: r.invited_by_name,
          expiresAt: r.expires_at,
        }),
      );
    },
    acceptInvitation: async (id, code, consentVersion) => {
      const team = z
        .uuid()
        .nullable()
        .parse(await rpc('accept_invitation', { p_id: id, p_code: code, p_consent_version: consentVersion }));
      if (!team) throw new CloudError(WRONG_INVITATION_CODE, 'invalid');
      return team;
    },
    declineInvitation: async (id) => {
      await rpc('decline_invitation', { p_id: id });
    },

    teamRules: async (teamId) => {
      const rows = z
        .array(
          z.object({
            match_type: z.enum(['process', 'title', 'domain']),
            pattern: z.string(),
            category: z.enum(['productive', 'neutral', 'distraction', 'ai']),
            ai_tool: z.string().nullable(),
            not_allowed: z.boolean(),
          }),
        )
        .parse(
          await run(
            client
              .from('classification_rules')
              .select('match_type, pattern, category, ai_tool, not_allowed')
              .eq('team_id', teamId)
              .order('priority'),
          ),
        );
      return rows.map(
        (r): TeamRule => ({ match: r.match_type, pattern: r.pattern, category: r.category, ai_tool: r.ai_tool, not_allowed: r.not_allowed }),
      );
    },
    setTeamPolicy: async (teamId, allowHiddenApps) => {
      await rpc('set_team_policy', { p_team: teamId, p_allow_hidden_apps: allowHiddenApps });
    },
    setAlertPolicy: async (teamId, enabled, repeatMinutes) => {
      await rpc('set_alert_policy', { p_team: teamId, p_enabled: enabled, p_repeat_minutes: repeatMinutes });
    },
    domainRules: async (teamId) => {
      const rows = z
        .array(z.object({ id: z.uuid(), pattern: z.string(), not_allowed: z.boolean() }))
        .parse(
          await run(
            client
              .from('classification_rules')
              .select('id, pattern, not_allowed')
              .eq('team_id', teamId)
              .eq('match_type', 'domain')
              .order('pattern'),
          ),
        );
      return rows.map((r) => DomainRuleSchema.parse({ id: r.id, domain: r.pattern, notAllowed: r.not_allowed }));
    },
    addNotAllowedDomain: async (teamId, domain) => {
      const user = await requireUser();
      await run(
        client.from('classification_rules').insert({
          team_id: teamId,
          priority: 0,
          match_type: 'domain',
          pattern: domain,
          category: 'distraction',
          not_allowed: true,
          created_by: user.id,
        }),
      );
    },
    removeDomainRule: async (ruleId) => {
      await run(client.from('classification_rules').delete().eq('id', ruleId));
    },
    teamDomainSummary: async (teamId, from, to) => {
      const rows = z
        .array(z.object({ user_id: z.uuid(), domain: z.string(), category: z.string(), seconds: z.coerce.number() }))
        .parse(await rpc('team_domain_summary', { p_team: teamId, p_from: from, p_to: to }));
      return rows.map((r) => DomainUsageSchema.parse({ userId: r.user_id, domain: r.domain, category: r.category, seconds: r.seconds }));
    },
    upsertBlocks: async (userId, rows) => {
      await run(client.from('activity_blocks').upsert(rows.map((b) => blockRow(userId, b)), { onConflict: 'id' }));
    },
    upsertEntries: async (userId, rows) => {
      await run(client.from('time_entries').upsert(rows.map((e) => entryRow(userId, e)), { onConflict: 'id' }));
    },
    upsertClosures: async (userId, rows) => {
      await run(client.from('app_closures').upsert(rows.map((c) => closureRow(userId, c)), { onConflict: 'id' }));
    },
  };
}

// Filas tal como las espera Postgres. Ninguna tiene título: el tipo de origen no lo trae (D-05).
export const blockRow = (userId: string, b: SyncBlock) => ({
  id: b.id,
  team_id: b.teamId,
  user_id: userId,
  started_at: b.startedAt,
  ended_at: b.endedAt,
  app_name: b.appName,
  category: b.category,
  ai_tool: b.aiTool,
  domain: b.domain,
});

export const entryRow = (userId: string, e: SyncEntry) => ({
  id: e.id,
  team_id: e.teamId,
  user_id: userId,
  started_at: e.startedAt,
  ended_at: e.endedAt,
  task_id: e.taskId,
  source: e.source,
  updated_at: e.updatedAt,
  deleted_at: e.deletedAt,
});

export const closureRow = (userId: string, c: SyncClosure) => ({
  id: c.id,
  team_id: c.teamId,
  user_id: userId,
  closed_at: c.closedAt,
  reopened_at: c.reopenedAt,
});
