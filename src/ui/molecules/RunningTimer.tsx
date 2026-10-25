import { Square } from 'lucide-react';
import { t } from '@/i18n';
import { formatClock, formatCompactClock } from '@/lib/time';
import { Button } from '@/ui/atoms';

export interface RunningTimerProps {
  elapsedSeconds: number;
  /** Tarea del temporizador; null si corre sin tarea o la tarea no está en el equipo activo. */
  taskTitle: string | null;
  /** Adónde lleva el nombre: la tarea, o Mi día si no hay tarea. */
  href: string;
  onStop: () => void;
}

/**
 * Temporizador en marcha dentro de la navegación, para verlo y detenerlo desde cualquier pantalla.
 *   compacta (< 640 px)  → franja sobre la barra inferior: tiempo, tarea y detener
 *   riel (640–1023 px)   → tiempo corto ("03:18", "1h05") y detener; la tarea en el título
 *   barra lateral        → bloque con tiempo, tarea y detener
 * `data-timer` deja que el Toast y los avisos suban por encima de la franja.
 */
export function RunningTimer({ elapsedSeconds, taskTitle, href, onStop }: RunningTimerProps) {
  const name = taskTitle ?? t('timer.running');
  return (
    <section
      data-timer
      aria-label={t('timer.running')}
      className="motion-enter flex min-w-0 items-center gap-2 rounded-lg bg-sunken py-1 pr-1 pl-3 md:flex-col md:gap-1 md:px-1 md:py-2 lg:flex-row lg:gap-2 lg:py-1 lg:pr-1 lg:pl-3"
    >
      <a href={href} title={name} className="flex min-w-0 flex-1 items-center gap-2 rounded-xs md:flex-col md:gap-0 lg:items-start">
        <span role="timer" aria-label={t('timer.label')} className="flex items-center gap-2 font-display font-semibold text-fg tabular-nums md:flex-col md:gap-1 md:text-sm lg:flex-row lg:gap-2 lg:text-base">
          <span aria-hidden="true" className="motion-pulse relative size-2 shrink-0 rounded-full bg-accent" />
          <span className="md:hidden lg:inline">{formatClock(elapsedSeconds)}</span>
          <span className="hidden md:inline lg:hidden">{formatCompactClock(elapsedSeconds)}</span>
        </span>
        {/* En el riel no cabe: ahí la tarea queda en el título y para el lector de pantalla. */}
        <span className="min-w-0 max-w-full truncate text-sm text-fg-muted md:hidden lg:block">{name}</span>
        <span className="sr-only hidden md:block lg:hidden">{name}</span>
      </a>
      <Button variant="ghost" size="sm" onClick={onStop} title={t('timer.stop')} icon={<Square size={16} aria-hidden="true" />}>
        <span className="sr-only">{t('timer.stop')}</span>
      </Button>
    </section>
  );
}
