import type { ReactNode } from 'react';

/**
 * Marco de la aplicación: navegación + contenido.
 * La navegación va abajo en ventanas compactas y a la izquierda desde 640 px. El contenido recibe el foco
 * al cambiar de pantalla, así las flechas y Tab siguen desde ahí.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col-reverse bg-canvas text-fg md:flex-row">
      {nav}
      <main id="contenido" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
        {children}
      </main>
    </div>
  );
}
