/**
 * Qué acciones de equipo muestra la interfaz a cada rol (docs/ROLES.md, filas 2 a 8).
 * Solo decide qué botones aparecen: quien hace cumplir las reglas es la base de datos (RLS y
 * funciones SQL, probadas en supabase/tests). Si esto y la base discrepan, gana la base.
 */
export type Role = 'owner' | 'admin' | 'member' | 'viewer';

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
  viewer: 'Observador',
};

/** Fila 8: el admin invita member o viewer; el owner, cualquier rol. */
export function invitableRoles(mine: Role): Role[] {
  if (mine === 'owner') return ['owner', 'admin', 'member', 'viewer'];
  if (mine === 'admin') return ['member', 'viewer'];
  return [];
}

/** Filas 2 y 3: roles a los que `mine` puede cambiar a alguien que hoy es `target`. */
export function assignableRoles(mine: Role, target: Role): Role[] {
  if (mine === 'owner') return ['owner', 'admin', 'member', 'viewer'];
  if (mine === 'admin' && (target === 'member' || target === 'viewer')) return ['member', 'viewer'];
  return [];
}

/** Filas 4 y 5: expulsar (nunca a uno mismo; para eso está «Salir del equipo»). */
export function canRemove(mine: Role, target: Role): boolean {
  return mine === 'owner' || (mine === 'admin' && (target === 'member' || target === 'viewer'));
}

/** Fila 7: el viewer no ve la lista de miembros. */
export function canSeeMembers(mine: Role): boolean {
  return mine !== 'viewer';
}
