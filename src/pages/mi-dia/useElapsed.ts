import { useEffect, useState } from 'react';

/** Segundos transcurridos desde `startedAt`, actualizados cada segundo. 0 si no hay inicio. */
export function useElapsed(startedAt: string | null): number {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [startedAt]);

  if (!startedAt || now === null) return 0;
  return Math.max(0, (now - Date.parse(startedAt)) / 1000);
}
