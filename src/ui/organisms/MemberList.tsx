import { t } from '@/i18n';
import { assignableRoles, canRemove, ROLE_LABEL, type Role } from '@/lib/permissions';
import { Avatar, Badge, Button, Select } from '@/ui/atoms';

export interface MemberRow {
  userId: string;
  role: Role;
  displayName: string | null;
}

/**
 * Lista de miembros de un equipo (EQ-05). Muestra a cada rol solo las acciones que la matriz
 * le permite (docs/ROLES.md); la base de datos vuelve a comprobarlo todo.
 */
export function MemberList({
  members,
  myUserId,
  myRole,
  busy = false,
  onChangeRole,
  onRemove,
}: {
  members: MemberRow[];
  myUserId: string;
  myRole: Role;
  busy?: boolean;
  onChangeRole: (userId: string, role: Role) => void;
  onRemove: (userId: string, name: string) => void;
}) {
  const sorted = [...members].sort(
    (a, b) => ORDER.indexOf(a.role) - ORDER.indexOf(b.role) || (a.displayName ?? '').localeCompare(b.displayName ?? ''),
  );
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label={t('team.membersLabel')}>
      {sorted.map((m) => {
        const name = m.displayName ?? t('common.noName');
        const isMe = m.userId === myUserId;
        const roles = isMe ? [] : assignableRoles(myRole, m.role);
        return (
          <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
            <Avatar name={name} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">
                {name}
                {isMe && <span className="text-fg-muted"> {t('common.you')}</span>}
              </p>
            </div>
            {roles.length > 0 ? (
              <Select
                size="sm"
                aria-label={t('team.roleOf', { name })}
                value={m.role}
                disabled={busy}
                onChange={(e) => onChangeRole(m.userId, e.target.value as Role)}
                options={(roles.includes(m.role) ? roles : [m.role, ...roles]).map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
              />
            ) : (
              <Badge tone={m.role === 'owner' ? 'accent' : 'neutral'}>{ROLE_LABEL[m.role]}</Badge>
            )}
            {!isMe && canRemove(myRole, m.role) && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(m.userId, name)}>
                {t('team.remove')}
              </Button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const ORDER: Role[] = ['owner', 'admin', 'member', 'viewer'];
