import { useCallback, useEffect, useState } from 'react';
import type { Bridge, DayView, SensorStatus } from '@/bridge/contract';

type State =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; day: DayView; status: SensorStatus };

/** Carga el día y el estado del sensor, y expone las acciones del temporizador. */
export function useDay(bridge: Bridge, date: string) {
  const [state, setState] = useState<State>({ phase: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.all([bridge.dayView(date), bridge.sensorStatus()])
      .then(([day, status]) => {
        if (!cancelled) setState({ phase: 'ready', day, status });
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          const detail = cause instanceof Error ? cause.message : String(cause);
          setState({ phase: 'error', message: detail });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bridge, date]);

  const run = useCallback((action: () => Promise<SensorStatus>) => {
    action()
      .then((status) => setState((s) => (s.phase === 'ready' ? { ...s, status } : s)))
      .catch((cause: unknown) => {
        const detail = cause instanceof Error ? cause.message : String(cause);
        setState({ phase: 'error', message: detail });
      });
  }, []);

  return { state, run };
}
