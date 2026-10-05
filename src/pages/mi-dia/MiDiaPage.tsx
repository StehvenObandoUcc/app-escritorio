import type { Bridge, Category } from '@/bridge/contract';
import { WORK_CATEGORIES } from '@/lib/categories';
import { formatDuration, formatHour, formatLongDate, localDate } from '@/lib/time';
import { Badge, Heading, Surface } from '@/ui/atoms';
import { CategoryBreakdown, EmptyState, TimerControl } from '@/ui/molecules';
import { ActivityList, PulseStrip } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { useDay } from './useDay';
import { useElapsed } from './useElapsed';

const BREAKDOWN: Category[] = ['productive', 'ai', 'neutral', 'distraction', 'break'];
const PAUSE_MINUTES = 15;

export function MiDiaPage({ bridge, date = localDate() }: { bridge: Bridge; date?: string }) {
  const { state, run } = useDay(bridge, date);
  const status = state.phase === 'ready' ? state.status : null;
  const elapsed = useElapsed(status?.timer.startedAt ?? null);

  const sampleTag = bridge.source === 'mock' && <Badge tone="accent">Datos de ejemplo</Badge>;

  if (state.phase === 'loading') {
    return (
      <PageLayout title="Mi día" subtitle={formatLongDate(date)} actions={sampleTag}>
        <p className="text-fg-muted" role="status">
          Cargando tu día…
        </p>
      </PageLayout>
    );
  }

  if (state.phase === 'error') {
    return (
      <PageLayout title="Mi día" subtitle={formatLongDate(date)} actions={sampleTag}>
        <EmptyState
          title="No se pudo leer tu actividad"
          description={`El sensor respondió con un error: ${state.message}. Cierra y vuelve a abrir Pulso; si se repite, revisa el registro en Ajustes.`}
        />
      </PageLayout>
    );
  }

  const { day } = state;
  const worked = WORK_CATEGORIES.reduce((sum, c) => sum + day.totals[c], 0);
  const summary =
    day.workdayStart && day.workdayEnd
      ? `Jornada de ${formatHour(day.workdayStart)} a ${formatHour(day.workdayEnd)}. ${formatDuration(worked)} de trabajo, ${formatDuration(day.totals.ai)} con IA.`
      : 'Todavía no hay actividad registrada hoy.';

  return (
    <PageLayout title="Mi día" subtitle={formatLongDate(date)} actions={sampleTag}>
      <Surface as="section" aria-label="Ritmo del día">
        <p className="mb-4 text-fg">{summary}</p>
        <PulseStrip blocks={day.blocks} summary={summary} />
      </Surface>

      <div className="flex flex-col gap-5 lg:flex-row">
        <Surface as="section" aria-label="Temporizador" className="lg:flex-1">
          <TimerControl
            running={state.status.timer.running}
            elapsedSeconds={elapsed}
            state={state.status.state}
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
        <Surface as="section" aria-label="Reparto del tiempo" className="lg:flex-1">
          <CategoryBreakdown totals={day.totals} categories={BREAKDOWN} />
        </Surface>
      </div>

      <section className="flex flex-col gap-3">
        <Heading level={2}>Actividad</Heading>
        {day.blocks.length === 0 ? (
          <EmptyState
            title="Aún no hay bloques"
            description="Pulso empieza a registrar en cuanto usas el computador. Los títulos de ventana se quedan en este equipo."
          />
        ) : (
          <Surface padding="flush">
            <ActivityList blocks={day.blocks} />
          </Surface>
        )}
      </section>
    </PageLayout>
  );
}
