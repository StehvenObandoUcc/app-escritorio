import { Activity, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { t } from '@/i18n';
import { arrowNav, NAV_ITEM } from '@/lib/keyboard';
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
        'flex shrink-0 border-line bg-surface',
        'border-t px-2 py-1',
        'md:w-rail md:flex-col md:gap-1 md:border-t-0 md:border-r md:px-2 md:py-3',
        'lg:w-nav lg:px-3',
      )}
    >
      <div className="hidden h-control items-center gap-2 px-2 text-accent-text md:mb-3 md:flex md:justify-center lg:justify-start">
        <Activity size={22} aria-hidden="true" />
        <span className="hidden font-display text-lg font-semibold tracking-tight text-fg lg:inline">
          Pulso
        </span>
      </div>

      <ul onKeyDown={arrowNav} className="flex flex-1 justify-around gap-1 md:flex-none md:flex-col md:justify-start">
        {items.map(({ to, label, icon: Icon }, i) => (
          <li key={to} className="flex-1 md:flex-none">
            <NavLink
              to={to}
              {...{ [NAV_ITEM]: '' }}
              title={`${label} (Alt+${i + 1})`}
              className={({ isActive }) =>
                cx(
                  'flex min-h-touch flex-col items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition-colors',
                  'md:min-h-control lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base',
                  isActive
                    ? 'bg-accent-soft text-accent-text'
                    : 'text-fg-muted hover:bg-sunken hover:text-fg',
                )
              }
            >
              <Icon size={18} aria-hidden="true" />
              <span className="md:sr-only lg:not-sr-only">{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      {footer && <div className="mt-auto hidden md:flex md:justify-center lg:justify-start">{footer}</div>}
    </nav>
  );
}
