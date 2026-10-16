import { useEffect } from 'react';

/** Aviso breve de que algo salió bien (D4). Se va solo a los 3 s; lo anuncia el lector de pantalla. */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(onDone, 3000);
    return () => clearTimeout(timer);
  }, [message, onDone]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-20 z-20 flex justify-center md:bottom-6">
      {message && <p className="rounded-md bg-fg px-4 py-2 text-sm text-canvas shadow-overlay">{message}</p>}
    </div>
  );
}
