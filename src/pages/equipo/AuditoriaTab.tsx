import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSession } from '@/app/session';
import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, type AuditAction, type AuditEntry, type MyTeam } from '@/cloud/contract';
import { errorMessage, formatDate, t } from '@/i18n';
import { Button, Heading, Select, Surface } from '@/ui/atoms';

const isAction = (value: string): value is AuditAction => (AUDIT_ACTIONS as readonly string[]).includes(value);

/** Texto de la acción; una acción que esta versión no conoce se muestra tal cual en lugar de ocultarla. */
const actionText = (action: string) => (isAction(action) ? t(`audit.actions.${action}`) : action);

/** Una fila de la auditoría ya con nombres: quién, qué y a quién afectó. */
export function AuditRow({ entry, actor, target }: { entry: AuditEntry; actor: string; target: string | null }) {
  return (
    <li className="flex flex-col gap-1 py-3">
      <time dateTime={entry.createdAt} className="text-sm text-fg-muted tabular-nums">
        {formatDate(entry.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
      </time>
      <p className="text-fg">
        <strong>{actor}</strong> · {actionText(entry.action)}
      </p>
      {target && <p className="text-sm text-fg-muted">{t('audit.affected', { name: target })}</p>}
    </li>
  );
}

/** Lista de filas con nombres resueltos (sin nube): la usan la pestaña y la galería. */
export function AuditList({ entries, names, unknownName }: { entries: AuditEntry[]; names: Map<string, string>; unknownName?: string }) {
  const nameOf = (id: string) => names.get(id) ?? unknownName ?? t('common.exMember');
  return (
    <ul className="flex flex-col divide-y divide-line" aria-label={t('audit.list')}>
      {entries.map((e) => (
        <AuditRow
          key={e.id}
          entry={e}
          actor={e.actorId ? nameOf(e.actorId) : t('audit.system')}
          target={e.targetUserId && e.targetUserId !== e.actorId ? nameOf(e.targetUserId) : null}
        />
      ))}
    </ul>
  );
}

/**
 * Auditoría del equipo (EQ-10, F5 D-12), solo para owner y admin: 50 filas por página, de la más nueva a la más
 * vieja, «Cargar más» con `beforeId` y filtro por acción.
 */
export function AuditoriaTab({ team }: { team: MyTeam }) {
  const { cloud } = useSession();
  const [action, setAction] = useState<AuditAction | ''>('');
  const members = useQuery({ queryKey: ['members', team.id], queryFn: () => cloud.members(team.id) });
  const log = useInfiniteQuery({
    queryKey: ['audit', team.id, action],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) => cloud.auditLog(team.id, { beforeId: pageParam, action: action || undefined }),
    getNextPageParam: (last) => (last.length >= AUDIT_PAGE_SIZE ? last[last.length - 1]!.id : undefined),
  });
  const entries = log.data?.pages.flat() ?? [];
  const names = new Map((members.data ?? []).map((m) => [m.userId, m.displayName ?? t('common.noName')]));
  // El fallo de «Cargar más» no tira lo ya cargado; el de la carga inicial sí ocupa el lugar de la lista.
  const nextFailed = log.isFetchNextPageError;
  const initialFailure = log.isError && !nextFailed ? log.error : null;

  return (
    <Surface as="section" aria-label={t('audit.title')} className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Heading level={2}>{t('audit.title')}</Heading>
          <p className="mt-1 text-sm text-fg-muted">{t('audit.hint')}</p>
        </div>
        <Select
          aria-label={t('audit.filter')}
          value={action}
          onChange={(e) => setAction(e.target.value as AuditAction | '')}
          options={[{ value: '', label: t('audit.all') }, ...AUDIT_ACTIONS.map((a) => ({ value: a, label: t(`audit.actions.${a}`) }))]}
        />
      </div>
      {log.isPending || members.isPending ? (
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      ) : initialFailure ? (
        <p role="alert" className="text-sm text-danger">
          {t('audit.loadError', { error: errorMessage(initialFailure) })}
        </p>
      ) : entries.length === 0 ? (
        <p className="text-fg-muted">{t('audit.empty')}</p>
      ) : (
        <>
          {members.isError && <p className="text-sm text-fg-muted">{t('audit.membersError')}</p>}
          <AuditList entries={entries} names={names} unknownName={members.isError ? t('audit.someone') : undefined} />
          {nextFailed && (
            <p role="alert" className="text-sm text-danger">
              {t('audit.loadMoreError', { error: errorMessage(log.error) })}
            </p>
          )}
          {log.hasNextPage && (
            <div>
              <Button onClick={() => void log.fetchNextPage()} disabled={log.isFetchingNextPage}>
                {nextFailed ? t('audit.retry') : t('audit.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </Surface>
  );
}
