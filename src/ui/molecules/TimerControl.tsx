import { useId } from 'react';
import { t } from '@/i18n';
import { Coffee, EyeOff, Play, Square } from 'lucide-react';
import { formatClock } from '@/lib/time';
import { Button } from '@/ui/atoms';

export interface TimerControlProps {
  running: boolean;
  /** Segundos transcurridos del temporizador en curso */
  elapsedSeconds: number;
  state: 'tracking' | 'paused' | 'break' | 'stopped';
  /** Tarea del temporizador en marcha (TA-05), si se conoce. */
  taskTitle?: string | null;
  onStart: () => void;
  onStop: () => void;
  onBreakToggle: () => void;
  onPauseToggle: () => void;
  /** Minutos que ofrece la pausa; si se pasa, la etiqueta los dice (tope diario del equipo, F5 D-11). */
  pauseMinutes?: number;
  /** Si viene texto, la pausa no se puede iniciar (sí reanudar) y se explica el motivo. */
  pauseDisabledReason?: string | null;
  /** Desactiva la pausa sin mostrar motivo (p. ej. mientras se averigua cuánto queda). Reanudar sigue activo. */
  pauseDisabled?: boolean;
}


export function TimerControl({
  running,
  elapsedSeconds,
  state,
  taskTitle,
  onStart,
  onStop,
  onBreakToggle,
  onPauseToggle,
  pauseMinutes,
  pauseDisabledReason,
  pauseDisabled = false,
}: TimerControlProps) {
  const reasonId = useId();
  const blocked = (pauseDisabled || Boolean(pauseDisabledReason)) && state !== 'paused';
  const showReason = blocked && Boolean(pauseDisabledReason);
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p
          role="timer"
          aria-label={t('timer.label')}
          className="font-display text-display font-semibold tracking-tight text-fg tabular-nums"
        >
          {formatClock(elapsedSeconds)}
        </p>
        <p className="mt-1 text-sm text-fg-muted" aria-live="polite">
          {t(`timer.state.${state}`)}
        </p>
        {running && taskTitle && <p className="text-sm text-fg">{t('timer.onTask', { title: taskTitle })}</p>}
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button variant="primary" icon={<Square size={16} aria-hidden="true" />} onClick={onStop}>
            {t('timer.stop')}
          </Button>
        ) : (
          <Button variant="primary" icon={<Play size={16} aria-hidden="true" />} onClick={onStart}>
            {t('timer.start')}
          </Button>
        )}
        <Button icon={<Coffee size={16} aria-hidden="true" />} onClick={onBreakToggle}>
          {state === 'break' ? t('timer.endBreak') : t('timer.takeBreak')}
        </Button>
        <Button
          variant="ghost"
          icon={<EyeOff size={16} aria-hidden="true" />}
          onClick={onPauseToggle}
          disabled={blocked}
          aria-describedby={showReason ? reasonId : undefined}
        >
          {state === 'paused' ? t('timer.resume') : !pauseMinutes ? t('timer.pause') : t('timer.pauseFor', { min: pauseMinutes })}
        </Button>
      </div>
      {showReason && (
        <p id={reasonId} className="text-sm text-fg-muted">
          {pauseDisabledReason}
        </p>
      )}
    </div>
  );
}
