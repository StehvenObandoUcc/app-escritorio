import { useCallback, useEffect, useState } from 'react';
import type { Bridge, NotAllowedAlert } from '@/bridge/contract';

/** Máximo de avisos a la vez: los más recientes. */
const MAX_ALERTS = 3;

/**
 * Avisos de sitio no permitido (ADR-0012). Un aviso queda en pantalla hasta que la persona lo cierra:
 * si estaba en el navegador cuando sonó, lo ve al volver a Pulso. Un mismo sitio no se repite: se
 * actualiza la hora del aviso que ya estaba.
 */
export function useNotAllowedAlerts(bridge: Bridge) {
  const [alerts, setAlerts] = useState<NotAllowedAlert[]>([]);

  useEffect(
    () =>
      bridge.onNotAllowedAlert((alert) =>
        setAlerts((list) => [alert, ...list.filter((a) => a.domain !== alert.domain)].slice(0, MAX_ALERTS)),
      ),
    [bridge],
  );

  const dismiss = useCallback((domain: string) => setAlerts((list) => list.filter((a) => a.domain !== domain)), []);
  return { alerts, dismiss };
}
