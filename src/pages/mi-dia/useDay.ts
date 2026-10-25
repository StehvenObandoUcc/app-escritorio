import { useCallback, useEffect, useState } from 'react';
import type { Bridge, DayView, SensorStatus, TimeEntry } from '@/bridge/contract';
import { errorMessage } from '@/i18n';

/** Lo emite quien arranca o detiene el temporizador fuera de react-query (Mi día, la navegación) para que el resto se entere. */
export const TIMER_CHANGED = 'pulso:timer-changed';

/** Cada cuánto se actualiza Mi día mientras la ventana está visible (AC-17). */
export const REFRESH_MS = 30_000;

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; day: DayView; status: SensorStatus; entries: TimeEntry[] };


/** Carga el día, el estado del sensor y las entradas de tiempo; se actualiza cada 30 s y al enfocar la ventana. */
export function useDay(bridge: Bridge, date: string) {
  const [state, setState] = useState<State>({ phase: 'loading' });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = () =>
      Promise.all([bridge.dayView(date), bridge.sensorStatus(), bridge.timeEntries(date)])
        .then(([day, status, entries]) => {
          if (!cancelled) setState({ phase: 'ready', day, status, entries });
        })
        .catch((cause: unknown) => {
          // Un fallo al actualizar no borra lo que ya se estaba mostrando.
          if (!cancelled) setState((s) => (s.phase === 'ready' ? s : { phase: 'error', message: errorMessage(cause) }));
        });
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };

    void refresh();
    const id = setInterval(refreshIfVisible, REFRESH_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    // Al volver a Pulso desde otra app (p. ej. el navegador) se ve al instante el tiempo actual.
    window.addEventListener('focus', refreshIfVisible);
    // El temporizador cambió (aquí o desde la navegación): siempre por una acción de quien usa la app.
    const onTimer = () => void refresh();
    window.addEventListener(TIMER_CHANGED, onTimer);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('focus', refreshIfVisible);
      window.removeEventListener(TIMER_CHANGED, onTimer);
    };
  }, [bridge, date, version]);

  /** Vuelve a cargar ahora mismo (p. ej. tras guardar una entrada). */
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  const run = useCallback((action: () => Promise<SensorStatus>) => {
    action()
      .then((status) => {
        setState((s) => (s.phase === 'ready' ? { ...s, status } : s));
        // El temporizador crea o cierra una entrada de tiempo: se recarga Mi día y se entera la navegación.
        window.dispatchEvent(new Event(TIMER_CHANGED));
      })
      .catch((cause: unknown) => setState({ phase: 'error', message: errorMessage(cause) }));
  }, []);

  return { state, run, reload };
}
