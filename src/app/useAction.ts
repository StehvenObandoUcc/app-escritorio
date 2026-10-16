import { useCallback, useState } from 'react';
import { errorMessage } from '@/i18n';

/** Ejecuta una acción con estado de «ocupado» y el error en el idioma activo. No deja lanzarla dos veces a la vez. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(
    async (action: () => Promise<unknown>) => {
      if (busy) return false;
      setBusy(true);
      setError(null);
      try {
        await action();
        return true;
      } catch (cause) {
        setError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );
  return { busy, error, setError, run };
}
