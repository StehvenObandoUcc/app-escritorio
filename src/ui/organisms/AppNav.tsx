import { Activity, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { t } from '@/i18n';
import { cx } from '@/lib/cx';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/**
 * Navegación principal. Un solo componente, tres formas según el ancho:
 *   compacta (< 640 px)  → barra inferior
 *   media (640–1023 px)  → riel lateral de iconos
 *   expandida (≥ 1024)   → barra lateral con texto
 */
export function AppNav({ items, footer }: { items: NavItem[]; footer?: ReactNode }) {
  return (
    <nav
      aria-label={t('nav.main')}
      className={cx(
        // Sin línea de separación: el menú se distingue del contenido por su fondo.
        'flex min-w-0 shrink-0 bg-surface',
        'px-1 py-1',
        'md:w-rail md:flex-col md:gap-1 md:px-2 md:py-3',
        'lg:w-nav lg:px-3',
      )}
    >
      <div className="hidden h-control items-center gap-2 px-2 text-accent-text md:mb-3 md:flex md:justify-center lg:justify-start">
        <Activity size={22} aria-hidden="true" />
        <span className="hidden font-display text-lg font-semibold tracking-tight text-fg lg:inline">
          Pulso
        </span>
      </div>

      <ul className="flex min-w-0 flex-1 justify-around md:gap-1 md:flex-none md:flex-col md:justify-start">
        {items.map(({ to, label, icon: Icon }, i) => (
          <li key={to} className="min-w-0 flex-1 md:flex-none">
            <NavLink
              to={to}
              title={`${label} (Alt+${i + 1})`}
              className={({ isActive }) =>
                cx(
                  'flex min-h-touch min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs font-medium transition active:scale-95',
                  // Riel (640-1023 px): círculos de icono; barra lateral (≥ 1024 px): píldoras con texto.
                  'md:mx-auto md:size-11 md:min-h-0 md:rounded-full md:px-0',
                  'lg:mx-0 lg:h-auto lg:min-h-control lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base',
                  // Activo relleno de acento (4,62:1 sobre la superficie) y en negrita: no depende solo del tono (A-02).
                  isActive ? 'bg-accent font-semibold text-on-accent' : 'text-fg-muted hover:bg-sunken hover:text-fg',
                )
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span className="max-w-full truncate md:sr-only lg:not-sr-only">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {footer && <div className="mt-auto hidden md:flex md:justify-center lg:justify-start">{footer}</div>}
    </nav>
  );
}
