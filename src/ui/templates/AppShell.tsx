import type { ReactNode } from 'react';
import { t } from '@/i18n';

/**
 * Marco de la aplicación: navegación + contenido.
 * La navegación va abajo en ventanas compactas y a la izquierda desde 640 px. El primer Tab muestra
 * «Saltar al contenido» (ADR-0019); el contenido recibe el foco al cambiar de pantalla.
 */
export function AppShell({ nav, children }: { nav: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-dvh flex-col-reverse bg-canvas text-fg md:flex-row">
      <a
        href="#contenido"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('contenido')?.focus();
        }}
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-fg focus:shadow-overlay"
      >
        {t('keyboard.skip')}
      </a>
      {nav}
      <main id="contenido" tabIndex={-1} className="min-h-0 min-w-0 flex-1 overflow-y-auto outline-none">
        {children}
      </main>
    </div>
  );
}
