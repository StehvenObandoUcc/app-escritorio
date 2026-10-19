import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useOptionalSession } from '@/app/session';
import type { Bridge, RangeView } from '@/bridge/contract';
import { CloudError } from '@/cloud/contract';
import { errorMessage, formatDate, t } from '@/i18n';
import { formatDuration, systemTimezone } from '@/lib/time';
import { Button, Heading, Surface } from '@/ui/atoms';
import { EmptyState, formatHoursShort, HorizontalBarList, StackedBarChart, type HorizontalBarItem } from '@/ui/molecules';
import { cloudPeriod, daysOf, groupByProject, rangeTotals, type DateRange, type RangeKind } from './range';

const CHART_CATEGORIES = ['productive', 'ai', 'neutral', 'distraction'] as const;

/** Horas (decimales) escritas como duración: 1.5 → «1 h 30 min». */
const formatHours = (hours: number) => formatDuration(hours * 3600);

type Loaded = { key: string; view: RangeView } | { key: string; error: string };

/** Lee `range_view` del periodo (dato local, sin red). */
function useRangeView(bridge: Bridge, range: DateRange) {
  const key = `${range.from}/${range.to}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    bridge.rangeView(range.from, range.to).then(
      (view) => alive && setLoaded({ key, view }),
      (cause: unknown) => alive && setLoaded({ key, error: errorMessage(cause) }),
    );
    return () => {
      alive = false;
    };
  }, [bridge, key, range.from, range.to, attempt]);
  const retry = () => {
    setLoaded(null);
    setAttempt((a) => a + 1);
  };
  return { loaded: loaded?.key === key ? loaded : null, retry };
}

/** Título del periodo: «Del 5 al 11 de oct.» o «octubre de 2026». */
export function rangeTitle(kind: RangeKind, range: DateRange): string {
  if (kind === 'month') return formatDate(range.from, { month: 'long', year: 'numeric' });
  const short = { day: 'numeric', month: 'short' } as const;
  return t('myRange.weekTitle', { from: formatDate(range.from, short), to: formatDate(range.to, short) });
}

/**
 * Mi semana y Mi mes (D-14): horas por día y totales desde el sensor (sin red) y, con conexión, el tiempo por
 * proyecto y tarea desde la nube. Sin desglose por app: eso sigue solo en el día.
 */
export function MyRangeView({
  bridge,
  kind,
  range,
  canGoNext,
  onShift,
}: {
  bridge: Bridge;
  kind: RangeKind;
  range: DateRange;
  canGoNext: boolean;
  onShift: (direction: -1 | 1) => void;
}) {
  const session = useOptionalSession();
  const aiCounts = session?.activeTeam?.aiCountsAsProductive ?? false;
  const { loaded, retry } = useRangeView(bridge, range);
  const title = rangeTitle(kind, range);

  const view = loaded && 'view' in loaded ? loaded.view : null;
  const totals = useMemo(() => (view ? rangeTotals(view, aiCounts) : null), [view, aiCounts]);
  const chart = useMemo(() => {
    if (!view) return [];
    const byDate = new Map(view.days.map((d) => [d.date, d.totals]));
    return daysOf(range).map((date) => ({
      label: formatDate(date, kind === 'week' ? { weekday: 'short', day: 'numeric' } : { day: 'numeric' }),
      segments: CHART_CATEGORIES.map((key) => ({ key, value: (byDate.get(date)?.[key] ?? 0) / 3600 })),
    }));
  }, [view, range, kind]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" aria-label={t(`myRange.prev.${kind}`)} onClick={() => onShift(-1)}>
          <ChevronLeft aria-hidden="true" className="size-4" />
        </Button>
        <p className="min-w-0 truncate text-center font-medium text-fg first-letter:uppercase" aria-live="polite">
          {title}
        </p>
        <Button size="sm" aria-label={t(`myRange.next.${kind}`)} disabled={!canGoNext} onClick={() => onShift(1)}>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>

      {!loaded && (
        <p className="text-fg-muted" role="status">
          {t('myRange.loading')}
        </p>
      )}
      {loaded && 'error' in loaded && <EmptyState title={t('myRange.readError')} description={t('myRange.readErrorHint')} onRetry={retry} />}

      {view && totals && (
        <>
          <dl aria-label={t('myRange.totalsLabel')} className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Stat label={t('myRange.totals.active')} value={formatDuration(totals.active)} />
            <Stat
              label={t('myRange.totals.productive')}
              value={formatDuration(totals.productive)}
              hint={aiCounts ? t('myRange.productiveWithAi') : t('myRange.productiveWithoutAi')}
            />
            <Stat label={t('myRange.totals.ai')} value={formatDuration(totals.ai)} />
          </dl>
          {totals.active === 0 ? (
            <EmptyState title={t('myRange.empty')} description={t('myRange.emptyHint')} />
          ) : (
            <Surface as="section" aria-label={t('myRange.chartTitle')} className="flex flex-col gap-3">
              <Heading level={2}>{t('myRange.chartTitle')}</Heading>
              <StackedBarChart data={chart} unit={t('myRange.chartUnit')} formatValue={formatHours} formatShort={formatHoursShort} label={`${t('myRange.chartTitle')} · ${title}`} />
            </Surface>
          )}
        </>
      )}

      {session?.activeTeam && session.activeTeam.role !== 'viewer' ? (
        <TimeByTaskSection teamId={session.activeTeam.id} range={range} />
      ) : (
        session && (
          <Surface as="section" aria-label={t('myRange.tasks.title')} className="flex flex-col gap-3">
            <Heading level={2}>{t('myRange.tasks.title')}</Heading>
            <p className="text-fg-muted">{session.activeTeam ? t('myRange.tasks.viewerRole') : t('myRange.tasks.noTeam')}</p>
          </Surface>
        )
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Surface className="flex flex-col gap-1">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold text-fg tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </Surface>
  );
}

/** Tiempo propio por proyecto y tarea (`my_time_by_task`). Sin red, solo esta sección lo dice. */
function TimeByTaskSection({ teamId, range }: { teamId: string; range: DateRange }) {
  const session = useOptionalSession()!;
  const period = cloudPeriod(range, session.profile?.timezone ?? systemTimezone());
  const query = useQuery({
    queryKey: ['my-time-by-task', teamId, period.from, period.to],
    queryFn: () => session.cloud.myTimeByTask(teamId, period.from, period.to),
    retry: false,
  });
  const noTask = t('myRange.tasks.noTask');
  const items = useMemo<HorizontalBarItem[]>(
    () =>
      groupByProject(query.data ?? [], noTask).flatMap((g) => [
        { key: g.key, label: g.projectName ?? noTask, value: g.seconds, depth: 0 as const },
        ...g.tasks.map((task) => ({ key: `${g.key}/${task.key}`, label: task.title, value: task.seconds, depth: 1 as const })),
      ]),
    [query.data, noTask],
  );
  const offline = query.error instanceof CloudError && query.error.kind === 'network';

  return (
    <Surface as="section" aria-label={t('myRange.tasks.title')} className="flex flex-col gap-3">
      <Heading level={2}>{t('myRange.tasks.title')}</Heading>
      {query.isPending && (
        <p className="text-fg-muted" role="status">
          {t('myRange.tasks.loading')}
        </p>
      )}
      {query.isError &&
        (offline ? (
          <div role="status">
            <p className="font-medium text-fg">{t('myRange.tasks.offline')}</p>
            <p className="text-sm text-fg-muted">{t('myRange.tasks.offlineHint')}</p>
          </div>
        ) : (
          <div role="alert">
            <p className="font-medium text-danger">{t('myRange.tasks.error')}</p>
            <p className="text-sm text-fg-muted">{errorMessage(query.error)}</p>
          </div>
        ))}
      {query.isSuccess &&
        (items.length === 0 ? (
          <div>
            <p className="font-medium text-fg">{t('myRange.tasks.empty')}</p>
            <p className="text-sm text-fg-muted">{t('myRange.tasks.emptyHint')}</p>
          </div>
        ) : (
          <HorizontalBarList items={items} label={t('myRange.tasks.title')} formatValue={formatDuration} />
        ))}
    </Surface>
  );
}
