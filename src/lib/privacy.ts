/**
 * Pantalla «Qué se mide y quién lo ve» (PS-01). Cada fila repite una fila de docs/ROLES.md;
 * privacy.test.ts comprueba que las marcas coinciden con la matriz.
 * Marcas: ✔ permitido · P solo en proyectos donde es lead · S solo sobre sí mismo · — denegado.
 */
import { t, type TKey } from '@/i18n';

export type Mark = '✔' | 'P' | 'S' | '—' | string;

export interface VisibilityRow {
  /** Número de fila en docs/ROLES.md */
  row: number;
  what: string;
  owner: Mark;
  admin: Mark;
  lead: Mark;
  member: Mark;
  viewer: Mark;
  /** Fase en la que llega a la app */
  phase: string;
}

export const VISIBILITY: VisibilityRow[] = [
  { row: 12, get what() { return t('privacy.rows.r12'); }, owner: 'S', admin: 'S', lead: 'S', member: 'S', viewer: '—', phase: 'F1' },
  { row: 7, get what() { return t('privacy.rows.r7'); }, owner: '✔', admin: '✔', lead: '✔', member: '✔', viewer: 'solo su fila', phase: 'F0' },
  { row: 13, get what() { return t('privacy.rows.r13'); }, owner: '✔', admin: '✔', lead: 'P (solo tiempo de sus proyectos)', member: '—', viewer: '—', phase: 'F2' },
  { row: 14, get what() { return t('privacy.rows.r14'); }, owner: '✔', admin: '✔', lead: 'P', member: '—', viewer: '—', phase: 'F2' },
  { row: 26, get what() { return t('privacy.rows.r26'); }, owner: '✔', admin: '✔', lead: 'S', member: 'S', viewer: '—', phase: 'F2' },
  { row: 9, get what() { return t('privacy.rows.r9'); }, owner: '✔', admin: '✔', lead: '—', member: '—', viewer: '—', phase: 'F2' },
  { row: 15, get what() { return t('privacy.rows.r15'); }, owner: '✔', admin: '✔', lead: '✔', member: '✔', viewer: '✔', phase: 'F5' },
  { row: 24, get what() { return t('privacy.rows.r24'); }, owner: '✔', admin: '✔', lead: 'P', member: 'si el equipo lo permite', viewer: '—', phase: 'F5' },
];

const MARK_KEY: Record<string, TKey> = {
  '✔': 'privacy.marks.yes',
  P: 'privacy.marks.projects',
  S: 'privacy.marks.self',
  '—': 'privacy.marks.no',
  'solo su fila': 'privacy.marks.ownRow',
  'P (solo tiempo de sus proyectos)': 'privacy.marks.projectTime',
  'si el equipo lo permite': 'privacy.marks.ifAllowed',
};

/** Las marcas se comparan con docs/ROLES.md en español; aquí se muestran en el idioma activo. */
export const describeMark = (mark: Mark) => (MARK_KEY[mark] ? t(MARK_KEY[mark]) : mark);
