/**
 * Esquemas de cada formulario (AC-42). Validan antes de enviar y devuelven un error por campo, con los mismos
 * límites que la base (`limits.ts`). La base vuelve a validarlo todo: esto solo evita viajes inútiles y
 * explica el problema junto al campo. Se construyen al usarlos para que los mensajes salgan en el idioma activo.
 */
import { z } from 'zod';
import { t } from '@/i18n';
import { EVIDENCE_TYPES, LIMITS } from './limits';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const HTTP_URL = /^https?:\/\/\S+$/;
/** Código de invitación (ADR-0008): XXXX-XXXX; el guion es opcional al escribirlo. */
export const INVITATION_CODE = /^[A-Z2-9]{4}-?[A-Z2-9]{4}$/;
export const OTP_CODE = /^\d{6,10}$/;

const text = (min: number, max: number, key: Parameters<typeof t>[0]) =>
  z.string().trim().min(min, t(key, { min, max })).max(max, t(key, { min, max }));
const email = () => z.string().trim().max(LIMITS.email.max, t('forms.email')).regex(EMAIL, t('forms.email'));
const password = () => z.string().min(LIMITS.password.min, t('forms.password', { min: LIMITS.password.min })).max(LIMITS.password.max, t('forms.passwordMax', { max: LIMITS.password.max }));

export const forms = {
  signIn: () => z.object({ email: email(), password: z.string().min(1, t('forms.passwordRequired')) }),
  signUp: () => z.object({ name: text(LIMITS.displayName.min, LIMITS.displayName.max, 'forms.length'), email: email(), password: password() }),
  recover: () => z.object({ email: email() }),
  verify: () => z.object({ code: z.string().trim().regex(OTP_CODE, t('forms.otp')) }),
  newPassword: () => z.object({ code: z.string().trim().regex(OTP_CODE, t('forms.otp')), password: password() }),
  profile: () =>
    z.object({
      name: text(LIMITS.displayName.min, LIMITS.displayName.max, 'forms.length'),
      timezone: z.string().trim().refine(validTimezone, t('forms.timezone')),
    }),
  team: () => z.object({ name: text(LIMITS.teamName.min, LIMITS.teamName.max, 'forms.length') }),
  project: () => z.object({ name: text(LIMITS.projectName.min, LIMITS.projectName.max, 'forms.length') }),
  invite: () => z.object({ email: email() }),
  invitationCode: () => z.object({ code: z.string().trim().toUpperCase().regex(INVITATION_CODE, t('forms.invitationCode')) }),
  timeEntry: () =>
    z
      .object({ date: z.iso.date(t('forms.required')), start: z.string().min(1, t('forms.required')), end: z.string().min(1, t('forms.required')) })
      .refine((v) => v.end > v.start, { message: t('forms.endAfterStart'), path: ['end'] }),
  task: () =>
    z.object({
      title: text(LIMITS.taskTitle.min, LIMITS.taskTitle.max, 'forms.length'),
      description: z.string().max(LIMITS.taskDescription.max, t('forms.max', { max: LIMITS.taskDescription.max })),
      labels: z
        .string()
        .transform((s) => s.split(',').map((l) => l.trim()).filter(Boolean))
        .refine((l) => l.length <= LIMITS.labels.count && l.every((x) => x.length <= LIMITS.labels.length), t('forms.labels', { count: LIMITS.labels.count, length: LIMITS.labels.length })),
      estimateMinutes: z
        .union([z.number(), z.nan()])
        .nullable()
        .refine((m) => m === null || (Number.isInteger(m) && m >= LIMITS.estimateMinutes.min && m <= LIMITS.estimateMinutes.max), t('forms.estimate')),
      criteria: z
        .string()
        .transform((s) => s.split('\n').map((c) => c.trim()).filter(Boolean))
        .refine((c) => c.length <= LIMITS.criteria.count && c.every((x) => x.length <= LIMITS.criteria.length), t('forms.criteria', { count: LIMITS.criteria.count, length: LIMITS.criteria.length })),
    }),
  reviewComment: (required: boolean) =>
    z.object({
      comment: z
        .string()
        .trim()
        .max(LIMITS.reviewComment.max, t('forms.max', { max: LIMITS.reviewComment.max }))
        .refine((c) => !required || c.length > 0, t('forms.commentRequired')),
    }),
  deleteProject: (name: string) => z.object({ confirm: z.string().refine((v) => v.trim() === name, t('forms.confirmName', { name })) }),
};

export const linksField = () =>
  z
    .string()
    .transform((s) => s.split('\n').map((l) => l.trim()).filter(Boolean))
    .refine((l) => l.length <= LIMITS.links.count && l.every((x) => HTTP_URL.test(x) && x.length <= LIMITS.links.length), t('forms.links', { count: LIMITS.links.count }));

export const isHttpUrl = (value: string) => HTTP_URL.test(value);

/** Archivos de evidencia: cuántos, cuánto pesan y de qué tipo (igual que el bucket). */
export function fileProblem(files: File[]): string | null {
  if (files.length > LIMITS.evidence.files) return t('forms.filesCount', { count: LIMITS.evidence.files });
  if (files.some((f) => f.size > LIMITS.evidence.bytes)) return t('forms.fileSize');
  if (files.some((f) => !(EVIDENCE_TYPES as readonly string[]).includes(f.type))) return t('forms.fileType');
  return null;
}

export function validTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
}

/** Errores por campo (el primero de cada uno) o null si todo está bien. */
export function fieldErrors<S extends z.ZodType>(schema: S, values: unknown): { data: z.infer<S>; errors: null } | { data: null; errors: Record<string, string> } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}
