import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignableRoles, canRemove, canSeeMembers, invitableRoles } from './permissions';
import { VISIBILITY } from './privacy';

/** Filas de la matriz de docs/ROLES.md: número → [owner, admin, member+lead, member, viewer]. */
function matrix(): Map<number, string[]> {
  const text = readFileSync(resolve(process.cwd(), 'docs/ROLES.md'), 'utf8');
  const rows = new Map<number, string[]>();
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('|').map((c) => c.trim());
    const n = Number(cells[1]);
    if (Number.isInteger(n) && n > 0 && cells.length >= 9) rows.set(n, cells.slice(3, 8));
  }
  return rows;
}

describe('«Qué se mide y quién lo ve» repite la matriz de roles (AC-14)', () => {
  const roles = matrix();

  it.each(VISIBILITY)('fila $row: $what', (v) => {
    expect(roles.get(v.row), `la fila ${v.row} existe en docs/ROLES.md`).toBeDefined();
    expect([v.owner, v.admin, v.lead, v.member, v.viewer]).toEqual(roles.get(v.row));
  });
});

describe('acciones visibles según el rol (filas 2 a 8)', () => {
  it('el owner invita y asigna cualquier rol; el admin solo member y viewer; los demás nada', () => {
    expect(invitableRoles('owner')).toEqual(['owner', 'admin', 'member', 'viewer']);
    expect(invitableRoles('admin')).toEqual(['member', 'viewer']);
    expect(invitableRoles('member')).toEqual([]);
    expect(invitableRoles('viewer')).toEqual([]);
    expect(assignableRoles('admin', 'member')).toEqual(['member', 'viewer']);
    expect(assignableRoles('admin', 'admin')).toEqual([]);
    expect(assignableRoles('admin', 'owner')).toEqual([]);
    expect(assignableRoles('member', 'viewer')).toEqual([]);
  });

  it('el admin expulsa member y viewer, no admin ni owner; el viewer no ve la lista', () => {
    expect(canRemove('admin', 'viewer')).toBe(true);
    expect(canRemove('admin', 'admin')).toBe(false);
    expect(canRemove('owner', 'admin')).toBe(true);
    expect(canRemove('member', 'viewer')).toBe(false);
    expect(canSeeMembers('viewer')).toBe(false);
    expect(canSeeMembers('member')).toBe(true);
  });
});
