import type { ReactNode } from 'react';

/**
 * Marco de la aplicación: navegación + contenido.
 * La navegación va abajo en ventanas compactas y a la izquierda desde 640 px.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col-reverse bg-canvas text-fg md:flex-row">
      {nav}
      <main className="min-h-0 min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
