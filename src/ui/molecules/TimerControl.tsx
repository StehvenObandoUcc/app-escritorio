import { Coffee, EyeOff, Play, Square } from 'lucide-react';
import { formatClock } from '@/lib/time';
import { Button } from '@/ui/atoms';

export interface TimerControlProps {
  running: boolean;
  /** Segundos transcurridos del temporizador en curso */
  elapsedSeconds: number;
  state: 'tracking' | 'paused' | 'break' | 'stopped';
  onStart: () => void;
  onStop: () => void;
  onBreakToggle: () => void;
  onPauseToggle: () => void;
}

const STATE_TEXT: Record<TimerControlProps['state'], string> = {
  tracking: 'Registrando tu actividad',
  break: 'En descanso',
  paused: 'Seguimiento en pausa: no se registra nada',
  stopped: 'El sensor está detenido',
};

export function TimerControl({
  running,
  elapsedSeconds,
  state,
  onStart,
  onStop,
  onBreakToggle,
  onPauseToggle,
}: TimerControlProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p
          role="timer"
          aria-label="Temporizador"
          className="font-display text-display font-semibold tracking-tight text-fg tabular-nums"
        >
          {formatClock(elapsedSeconds)}
        </p>
        <p className="mt-1 text-sm text-fg-muted" aria-live="polite">
          {STATE_TEXT[state]}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {running ? (
          <Button variant="primary" icon={<Square size={16} aria-hidden="true" />} onClick={onStop}>
            Detener temporizador
          </Button>
        ) : (
          <Button variant="primary" icon={<Play size={16} aria-hidden="true" />} onClick={onStart}>
            Iniciar temporizador
          </Button>
        )}
        <Button icon={<Coffee size={16} aria-hidden="true" />} onClick={onBreakToggle}>
          {state === 'break' ? 'Terminar descanso' : 'Tomar un descanso'}
        </Button>
        <Button variant="ghost" icon={<EyeOff size={16} aria-hidden="true" />} onClick={onPauseToggle}>
          {state === 'paused' ? 'Reanudar seguimiento' : 'Pausar 15 min'}
        </Button>
      </div>
    </div>
  );
}
