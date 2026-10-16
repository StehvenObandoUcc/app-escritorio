import { useState } from 'react';
import { PROJECT_ROLES, type ProjectMember, type ProjectRole } from '@/cloud/contract';
import { t } from '@/i18n';
import { formatMinutes, PROJECT_ROLE_LABEL } from '@/lib/tasks';
import { Avatar, Badge, Button, Select, type SelectOption } from '@/ui/atoms';

const roleOptions = () => PROJECT_ROLES.map((r) => ({ value: r, label: PROJECT_ROLE_LABEL[r] }));

/**
 * Miembros de un proyecto (PT-02). Quien gestiona el proyecto (owner, admin o lead) añade, cambia el rol
 * o quita; los demás solo ven la lista. `seconds`: tiempo por persona (fila 13 «P»), solo para quien gestiona.
 */
export function ProjectMemberList({
  members,
  myUserId,
  canManage,
  candidates,
  seconds,
  busy = false,
  onSetRole,
  onRemove,
}: {
  members: ProjectMember[];
  myUserId: string;
  canManage: boolean;
  /** Personas del equipo que se pueden añadir (no viewers, aún no en el proyecto). */
  candidates: SelectOption[];
  seconds?: Map<string | null, number>;
  busy?: boolean;
  onSetRole: (userId: string, role: ProjectRole) => void;
  onRemove: (userId: string) => void;
}) {
  const [pick, setPick] = useState('');
  const [role, setRole] = useState<ProjectRole>('contributor');
  const exMembers = seconds?.get(null);
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t('projects.members.label')} className="flex flex-col divide-y divide-line">
        {members.map((m) => {
          const name = m.displayName ?? t('common.noName');
          const time = seconds?.get(m.userId);
          return (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar name={name} />
              <p className="min-w-0 flex-1 truncate font-medium text-fg">
                {name}
                {m.userId === myUserId && <span className="text-fg-muted"> {t('common.you')}</span>}
              </p>
              {seconds && <span className="text-sm text-fg-muted tabular-nums">{formatMinutes((time ?? 0) / 60)}</span>}
              {canManage ? (
                <>
                  <Select
                    size="sm"
                    aria-label={t('projects.members.roleOf', { name })}
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => onSetRole(m.userId, e.target.value as ProjectRole)}
                    options={roleOptions()}
                  />
                  <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(m.userId)}>
                    {t('common.remove')}
                  </Button>
                </>
              ) : (
                <Badge tone={m.role === 'lead' ? 'accent' : 'neutral'}>{PROJECT_ROLE_LABEL[m.role]}</Badge>
              )}
            </li>
          );
        })}
      </ul>
      {seconds && exMembers ? <p className="text-sm text-fg-muted">{t('projects.members.exMembers', { time: formatMinutes(exMembers / 60) })}</p> : null}
      {canManage && candidates.length > 0 && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) {
              onSetRole(pick, role);
              setPick('');
            }
          }}
        >
          <Select
            size="sm"
            aria-label={t('projects.members.person')}
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            options={[{ value: '', label: t('projects.members.pick') }, ...candidates]}
          />
          <Select size="sm" aria-label={t('projects.members.role')} value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} options={roleOptions()} />
          <Button type="submit" size="sm" disabled={busy || !pick}>
            {t('projects.members.add')}
          </Button>
        </form>
      )}
    </div>
  );
}
