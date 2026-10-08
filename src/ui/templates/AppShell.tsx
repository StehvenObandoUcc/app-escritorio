import type { ReactNode } from 'react';

/**
 * Marco de la aplicación: navegación + contenido.
 * La navegación va abajo en ventanas compactas y a la izquierda desde 640 px. El contenido recibe el foco
 * al cambiar de pantalla, así las flechas y Tab siguen desde ahí.
 * Al imprimir (PDF de un reporte, spec F4 D-15) se oculta la navegación y el contenido ocupa todas las páginas.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col-reverse bg-canvas text-fg md:flex-row print:block print:h-auto">
      <div className="contents print:hidden">{nav}</div>
      <main id="contenido" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
