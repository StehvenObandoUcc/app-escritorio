/**
 * Consentimiento explícito y versionado al unirse a un equipo (PS-02, ARQUITECTURA §9).
 * Cambiar cualquier punto exige subir la versión: queda guardada en team_members.consent_version.
 */
import { t } from '@/i18n';

export const CONSENT_VERSION = '2026-10-v2';

const POINTS = ['measured', 'never', 'who', 'ai', 'purpose', 'control'] as const;

/** Puntos del consentimiento en el idioma activo. El texto de cada versión es el mismo en los dos idiomas. */
export const CONSENT_POINTS: { title: string; text: string }[] = POINTS.map((k) => ({
  get title() {
    return t(`consent.${k}.title`);
  },
  get text() {
    return t(`consent.${k}.text`);
  },
}));
