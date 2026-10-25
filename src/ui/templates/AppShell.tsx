import type { MouseEvent, ReactNode } from 'react';
import { t } from '@/i18n';

/** Lleva el foco al contenido sin tocar la ruta: con HashRouter, `#contenido` sería una pantalla. */
const skipToContent = (e: MouseEvent<HTMLAnchorElement>) => {
  e.preventDefault();
  document.getElementById('contenido')?.focus();
};

/**
 * Marco de la aplicación: navegación + contenido.
 * La navegación va abajo en ventanas compactas y a la izquierda desde 640 px. El contenido recibe el foco
 * al cambiar de pantalla, así las flechas y Tab siguen desde ahí.
 * «Saltar al contenido» es lo primero con Tab y solo se ve con el foco (A-06).
 * Al imprimir (PDF de un reporte, spec F4 D-15) se oculta la navegación y el contenido ocupa todas las páginas.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="group/shell flex h-dvh flex-col-reverse bg-canvas text-fg md:flex-row print:block print:h-auto">
      <a
        href="#contenido"
        data-skip-arrows
        onClick={skipToContent}
        className="sr-only z-50 rounded-md bg-surface px-4 py-2 font-medium text-fg shadow-overlay focus:not-sr-only focus:fixed focus:top-2 focus:left-2 print:hidden"
      >
        {t('app.skipToContent')}
      </a>
      <div className="contents print:hidden">{nav}</div>
      <main id="contenido" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none print:overflow-visible">
        {children}
      </main>
    </div>
  );
}
