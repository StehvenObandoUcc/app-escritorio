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
import type { SyncBlock, SyncClosure, SyncEntry, TeamRule } from '@/bridge/contract';

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

/** Error con un mensaje para la persona (qué pasó y qué hacer) y una clase para decidir qué hacer. */
export class CloudError extends Error {
  constructor(
    message: string,
    /** network: reintentar · forbidden: sin permiso · invalid: dato rechazado · auth: sesión o credenciales */
    readonly kind: 'network' | 'forbidden' | 'invalid' | 'auth' | 'unknown',
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

/** Mensaje cuando el código de invitación no coincide (accept_invitation devuelve null). */
export const WRONG_INVITATION_CODE =
  'El código no coincide o la invitación ya venció. Revísalo con quien te invitó: tras 5 intentos la invitación se anula.';

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

  // ---- Reglas y sincronización (SY-02, SY-03) ----
  teamRules(teamId: string): Promise<TeamRule[]>;
  /** Suben con upsert por `id`: repetir una subida no duplica nada. */
  upsertBlocks(userId: string, rows: SyncBlock[]): Promise<void>;
  upsertEntries(userId: string, rows: SyncEntry[]): Promise<void>;
  upsertClosures(userId: string, rows: SyncClosure[]): Promise<void>;
}
