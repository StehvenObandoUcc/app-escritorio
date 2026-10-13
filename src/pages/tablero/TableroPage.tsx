import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import { useState } from 'react';
import { useSession } from '@/app/session';
import { CloudError, type TeamDashboard } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { localDate, systemTimezone } from '@/lib/time';
import { Badge, Button, Select, Surface } from '@/ui/atoms';
import { EmptyState } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';
import { dashboardPeriod, TABLERO_PERIODS, type TableroPeriod } from './period';
import { AiSection, AppsSection, LeadSection, PeopleSection, PerDaySection, PresenceSection, TotalsSection } from './sections';

/** Cada cuánto se vuelve a pedir la presencia (D-4). */
export const PRESENCE_REFRESH_MS = 60_000;

/**
 * Tablero (spec F5): cada rol ve solo lo que el servidor le entrega en `team_dashboard` (D-2). La interfaz no calcula
 * cifras de negocio: solo les da formato. La presencia se pide aparte cada 60 s y solo a quien puede verla (D-4).
 */
export function TableroPage() {
  const { cloud, user, activeTeam, profile } = useSession();
  const [period, setPeriod] = useState<TableroPeriod>('this_week');
  const teamId = activeTeam?.id ?? null;
  const range = dashboardPeriod(period, localDate(), profile?.timezone ?? systemTimezone());

  const dashboard = useQuery({
    queryKey: ['team-dashboard', teamId, period, range.from, range.to],
    queryFn: () => cloud.teamDashboard(teamId!, range.from, range.to),
    enabled: teamId !== null,
  });
  const data = dashboard.data;

  // Presencia: owner y admin; member solo si el equipo lo permite; lead (lo dice el tablero); nunca viewer.
  const role = activeTeam?.role ?? null;
  const canSeePresence =
    role !== null && role !== 'viewer' && (role === 'owner' || role === 'admin' || activeTeam?.presenceVisibleToMembers === true || data?.isLead === true);
  const presence = useQuery({
    queryKey: ['team-presence', teamId],
    queryFn: () => cloud.teamPresence(teamId!),
    enabled: teamId !== null && canSeePresence,
    // Sin permiso (42501) se deja de preguntar: la sección no existe y no es un error para la persona.
    refetchInterval: (query) => (query.state.error instanceof CloudError && query.state.error.kind === 'forbidden' ? false : PRESENCE_REFRESH_MS),
    retry: false,
  });
  const presenceForbidden = presence.error instanceof CloudError && presence.error.kind === 'forbidden';

  if (!user) return null;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;
  if (!activeTeam || !teamId) {
    return (
      <PageLayout title={t('dashboard.title')} actions={sampleTag}>
        <EmptyState title={t('dashboard.title')} description={t('dashboard.noTeam')} />
      </PageLayout>
    );
  }

  const periodLabel = t(`dashboard.periods.${period}`);
  return (
    <PageLayout
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle')}
      actions={
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {sampleTag}
          <Select
            aria-label={t('dashboard.periodLabel')}
            value={period}
            onChange={(e) => setPeriod(e.target.value as TableroPeriod)}
            options={TABLERO_PERIODS.map((p) => ({ value: p, label: t(`dashboard.periods.${p}`) }))}
          />
          <Button icon={<Printer size={16} aria-hidden="true" />} onClick={() => window.print()}>
            {t('dashboard.print')}
          </Button>
        </div>
      }
    >
      <p className="hidden font-medium text-fg print:block">{t('dashboard.printTitle', { team: activeTeam.name, period: periodLabel })}</p>

      {canSeePresence && !presenceForbidden && presence.data && <PresenceSection people={presence.data} />}
      {canSeePresence && !presenceForbidden && presence.isError && (
        <Surface as="section" aria-label={t('dashboard.presence.title')} className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">
            {t('dashboard.presence.error')}: {errorMessage(presence.error)}
          </p>
          <div className="print:hidden">
            <Button size="sm" onClick={() => void presence.refetch()}>
              {t('dashboard.retry')}
            </Button>
          </div>
        </Surface>
      )}

      {dashboard.isPending && (
        <p role="status" className="text-fg-muted">
          {t('dashboard.loading')}
        </p>
      )}
      {dashboard.isError && (
        <Surface role="alert" className="flex flex-col items-start gap-2">
          <p className="font-medium text-danger">{t('dashboard.error')}</p>
          <p className="text-sm text-fg-muted">{errorMessage(dashboard.error)}</p>
          <div className="print:hidden">
            <Button size="sm" onClick={() => void dashboard.refetch()}>
              {t('dashboard.retry')}
            </Button>
          </div>
        </Surface>
      )}
      {data && <DashboardBody data={data} periodLabel={periodLabel} />}
    </PageLayout>
  );
}

/** El tablero tiene datos si hay horas o tareas; si no, un estado vacío (UI-07). */
const hasData = (d: TeamDashboard) => d.totals !== null && (d.totals.hoursActive > 0 || d.totals.tasksDoing > 0 || d.totals.tasksDone > 0);

export function DashboardBody({ data, periodLabel }: { data: TeamDashboard; periodLabel: string }) {
  const manager = data.role === 'owner' || data.role === 'admin';
  const empty = data.totals !== null && !hasData(data);
  return (
    <>
      {data.totals === null && <EmptyState title={t('dashboard.needMembers')} description={t('dashboard.needMembersHint')} />}
      {empty && <EmptyState title={t('dashboard.empty')} description={t('dashboard.emptyHint')} />}
      {data.totals && !empty && (
        <>
          <TotalsSection totals={data.totals} />
          {data.perDay.length > 0 && <PerDaySection perDay={data.perDay} label={`${t('dashboard.perDay.title')} · ${periodLabel}`} />}
          <AiSection totals={data.totals} />
          {manager && <PeopleSection members={data.members} />}
          {manager && <AppsSection apps={data.topApps} />}
        </>
      )}
      {/* Defensa ante un JSON incorrecto: un observador nunca ve la tabla del lead. */}
      {data.isLead && data.role !== 'viewer' && data.leadMembers.length > 0 && <LeadSection members={data.leadMembers} />}
    </>
  );
}
