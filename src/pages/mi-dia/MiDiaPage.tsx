import { t } from '@/i18n';
import { useEffect, useMemo, useState } from 'react';
import type { Bridge, Category } from '@/bridge/contract';
import { useOptionalSession } from '@/app/session';
import { aiToolTotals, appTotals, buildTimeline, domainTotals } from '@/lib/activity';
import { HIDDEN_APP } from '@/lib/apps';
import { parseTasksCache } from '@/lib/tasks';
import { WORK_CATEGORIES } from '@/lib/categories';
import { formatDuration, formatHour, formatLongDate, formatShortDuration, localDate, localDateTimeToIso } from '@/lib/time';
import { Badge, Heading, Surface } from '@/ui/atoms';
import { CategoryBreakdown, EmptyState, SegmentedControl, TimeEntryForm, TimerControl } from '@/ui/molecules';
import { ActivityList, ActivityTimeline, AppSummary, PulseStrip, TimeEntryList } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { useDay } from './useDay';
import { useElapsed } from './useElapsed';

const BREAKDOWN: Category[] = ['productive', 'ai', 'neutral', 'distraction', 'break'];
const PAUSE_MINUTES = 15;

type ActivityView = 'resumen' | 'sitios' | 'linea' | 'detalle';
const views = (): { value: ActivityView; label: string }[] => [
  { value: 'resumen', label: t('myDay.views.apps') },
  { value: 'sitios', label: t('myDay.views.sites') },
  { value: 'linea', label: t('myDay.views.timeline') },
  { value: 'detalle', label: t('myDay.views.detail') },
];

/** Título de la tarea del temporizador, desde la copia local de tareas (sin red también). */
function useTaskTitle(bridge: Bridge, taskId: string | null) {
  const [title, setTitle] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!taskId) return;
    void bridge
      .tasksCacheGet()
      .then((json) => {
        const tasks = parseTasksCache(json)?.tasks ?? [];
        if (alive) setTitle(tasks.find((t) => t.id === taskId)?.title ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bridge, taskId]);
  return taskId ? title : null;
}

export function MiDiaPage({ bridge, date = localDate() }: { bridge: Bridge; date?: string }) {
  const { state, run, reload } = useDay(bridge, date);
  const status = state.phase === 'ready' ? state.status : null;
  const elapsed = useElapsed(status?.timer.startedAt ?? null);
  const taskTitle = useTaskTitle(bridge, status?.timer.taskId ?? null);
  const [view, setView] = useState<ActivityView>('resumen');
  const [showHidden, setShowHidden] = useState(true);
  const allBlocks = state.phase === 'ready' ? state.day.blocks : null;
  const hasHidden = useMemo(() => Boolean(allBlocks?.some((b) => b.appName === HIDDEN_APP)), [allBlocks]);
  // Solo cambia lo que se ve: los totales del día (franja y reparto) siguen incluyendo las apps ocultas.
  const blocks = useMemo(
    () => (allBlocks && !showHidden ? allBlocks.filter((b) => b.appName !== HIDDEN_APP) : allBlocks),
    [allBlocks, showHidden],
  );
  const totalsByApp = useMemo(() => (blocks ? appTotals(blocks) : []), [blocks]);
  const timeline = useMemo(() => (blocks ? buildTimeline(blocks) : []), [blocks]);
  const aiTools = useMemo(() => (allBlocks ? aiToolTotals(allBlocks) : []), [allBlocks]);
  const totalsBySite = useMemo(() => (blocks ? domainTotals(blocks) : []), [blocks]);
  const session = useOptionalSession();
  const notAllowed = useMemo(() => new Set(session?.notAllowedDomains ?? []), [session?.notAllowedDomains]);
  const sampleTag = bridge.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;

  if (state.phase === 'loading') {
    return (
      <PageLayout title={t('nav.myDay')} subtitle={formatLongDate(date)} actions={sampleTag}>
        <p className="text-fg-muted" role="status">
          {t('myDay.loading')}
        </p>
      </PageLayout>
    );
  }

  if (state.phase === 'error') {
    return (
      <PageLayout title={t('nav.myDay')} subtitle={formatLongDate(date)} actions={sampleTag}>
        <EmptyState
          title={t('myDay.readError')}
          description={t('myDay.readErrorHint', { error: state.message })}
        />
      </PageLayout>
    );
  }

  const { day, entries } = state;
  const worked = WORK_CATEGORIES.reduce((sum, c) => sum + day.totals[c], 0);
  const summary =
    day.workdayStart && day.workdayEnd
      ? t('myDay.summary', { start: formatHour(day.workdayStart), end: formatHour(day.workdayEnd), worked: formatDuration(worked), ai: formatDuration(day.totals.ai) })
      : t('myDay.noActivity');

  return (
    <PageLayout title={t('nav.myDay')} subtitle={formatLongDate(date)} actions={sampleTag}>
      <Surface as="section" aria-label={t('myDay.rhythm')}>
        <p className="mb-4 text-fg">{summary}</p>
        <PulseStrip blocks={day.blocks} summary={summary} />
      </Surface>

      <div className="flex flex-col gap-5 lg:flex-row">
        <Surface as="section" aria-label={t('timer.label')} className="lg:flex-1">
          <TimerControl
            running={state.status.timer.running}
            elapsedSeconds={elapsed}
            state={state.status.state}
            taskTitle={taskTitle}
            onStart={() => run(() => bridge.timerStart())}
            onStop={() => run(() => bridge.timerStop())}
            onBreakToggle={() =>
              run(() => (state.status.state === 'break' ? bridge.breakEnd() : bridge.breakStart()))
            }
            onPauseToggle={() =>
              run(() =>
                state.status.state === 'paused'
                  ? bridge.privacyResume()
                  : bridge.privacyPause(PAUSE_MINUTES),
              )
            }
          />
        </Surface>
        <Surface as="section" aria-label={t('myDay.breakdown')} className="lg:flex-1">
          <CategoryBreakdown totals={day.totals} categories={BREAKDOWN} />
        </Surface>
      </div>

      <section className="flex flex-col gap-3">
        <Heading level={2}>{t('myDay.timeLog')}</Heading>
        <Surface as="section" aria-label={t('myDay.addManual')}>
          <TimeEntryForm
            initial={{ date, start: '', end: '' }}
            submitLabel={t('myDay.saveEntry')}
            clearOnSuccess
            onSubmit={async (v) => {
              await bridge.timeEntryAdd(localDateTimeToIso(v.date, v.start), localDateTimeToIso(v.date, v.end));
              reload();
            }}
          />
        </Surface>
        {entries.length === 0 ? (
          <EmptyState
            title={t('myDay.noEntries')}
            description={t('myDay.noEntriesHint')}
          />
        ) : (
          <Surface padding="flush">
            <TimeEntryList
              entries={entries}
              onUpdate={async (id, start, end) => {
                await bridge.timeEntryUpdate(id, start, end);
                reload();
              }}
              onDelete={async (id) => {
                await bridge.timeEntryDelete(id);
                reload();
              }}
            />
          </Surface>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={2}>{t('myDay.activity')}</Heading>
          {day.blocks.length > 0 && <SegmentedControl label={t('myDay.activityView')} options={views()} value={view} onChange={setView} />}
        </div>
        {hasHidden && (
          <label className="flex items-center gap-2 text-sm text-fg-muted">
            <input type="checkbox" className="size-4 accent-accent" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} />
            {t('myDay.showHidden')}
            <span className="text-xs">{t('myDay.showHiddenHint')}</span>
          </label>
        )}
        {day.blocks.length === 0 ? (
          <EmptyState
            title={t('myDay.noBlocks')}
            description={t('myDay.noBlocksHint')}
          />
        ) : (
          <Surface padding="flush">
            {view === 'resumen' && aiTools.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3 md:px-5" aria-label={t('myDay.aiToday')}>
                <span className="text-sm font-medium text-fg">{t('myDay.aiTodayLabel')}</span>
                {aiTools.map((x) => (
                  <Badge key={x.tool} tone="accent">
                    {x.tool} · {formatShortDuration(x.seconds)}
                  </Badge>
                ))}
              </div>
            )}
            {view === 'resumen' &&
              (totalsByApp.length ? (
                <AppSummary totals={totalsByApp} />
              ) : (
                <p className="p-4 text-fg-muted md:p-5">{t('myDay.onlyIdle')}</p>
              ))}
            {view === 'sitios' &&
              (totalsBySite.length ? (
                <AppSummary totals={totalsBySite} kind="site" flagged={notAllowed} />
              ) : (
                <p className="p-4 text-fg-muted md:p-5">
                  {t('myDay.noSites')}
                </p>
              ))}
            {view === 'linea' && <ActivityTimeline rows={timeline} />}
            {view === 'detalle' && <ActivityList blocks={blocks ?? []} />}
          </Surface>
        )}
      </section>
    </PageLayout>
  );
}
