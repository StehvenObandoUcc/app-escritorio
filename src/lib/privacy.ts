/**
 * Pantalla «Qué se mide y quién lo ve» (PS-01). Cada fila repite una fila de docs/ROLES.md;
 * privacy.test.ts comprueba que las marcas coinciden con la matriz.
 * Marcas: ✔ permitido · P solo en proyectos donde es lead · S solo sobre sí mismo · — denegado.
 */
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
  { row: 12, what: 'Tu actividad con títulos de ventana (solo en tu equipo)', owner: 'S', admin: 'S', lead: 'S', member: 'S', viewer: '—', phase: 'F1' },
  { row: 7, what: 'Lista de miembros', owner: '✔', admin: '✔', lead: '✔', member: '✔', viewer: 'solo su fila', phase: 'F0' },
  { row: 13, what: 'Actividad por miembro: categorías, apps y horas', owner: '✔', admin: '✔', lead: 'P (solo tiempo de sus proyectos)', member: '—', viewer: '—', phase: 'F2' },
  { row: 14, what: 'Uso de IA por miembro', owner: '✔', admin: '✔', lead: 'P', member: '—', viewer: '—', phase: 'F2' },
  { row: 26, what: 'Cierres de Pulso dentro de la jornada', owner: '✔', admin: '✔', lead: 'S', member: 'S', viewer: '—', phase: 'F2' },
  { row: 9, what: 'Registro de auditoría', owner: '✔', admin: '✔', lead: '—', member: '—', viewer: '—', phase: 'F2' },
  { row: 15, what: 'Totales del equipo sin nombres', owner: '✔', admin: '✔', lead: '✔', member: '✔', viewer: '✔', phase: 'F5' },
  { row: 24, what: 'Quién está activo ahora', owner: '✔', admin: '✔', lead: 'P', member: 'si el equipo lo permite', viewer: '—', phase: 'F5' },
];

export const MARK_LABEL: Record<string, string> = {
  '✔': 'Sí',
  P: 'Solo en sus proyectos',
  S: 'Solo lo suyo',
  '—': 'No',
};

export const describeMark = (mark: Mark) => MARK_LABEL[mark] ?? mark;
