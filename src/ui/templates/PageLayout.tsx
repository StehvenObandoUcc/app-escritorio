import { useEffect, type ReactNode } from 'react';
import { t } from '@/i18n';
import { Heading } from '@/ui/atoms';

/** Título de la ventana con el de la pantalla («Mi día · Pulso»), para lectores de pantalla y la barra de tareas (A-05). */
export function useWindowTitle(title: string) {
  useEffect(() => {
    document.title = t('app.windowTitle', { title });
  }, [title]);
}

/** Estructura común de una página: título, texto de apoyo, acciones y contenido. */
export function PageLayout({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  useWindowTitle(title);
  return (
    <div className="motion-stagger mx-auto flex w-full max-w-content flex-col gap-5 p-4 md:p-6 lg:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Heading level={1}>{title}</Heading>
          {subtitle && <p className="mt-1 text-fg-muted first-letter:uppercase">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
  );
}
