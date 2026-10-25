import { Activity, Ellipsis, type LucideIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { NavLink, matchPath, useLocation } from 'react-router';
import { t } from '@/i18n';
import { cx } from '@/lib/cx';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Ítems que caben en la barra inferior; el resto va en «Más» (F-19). */
const COMPACT_ITEMS = 4;

/** Forma de cada ítem, compartida por la lista principal y «Más». */
const itemClass = (active: boolean) =>
  cx(
    'flex min-h-touch min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-0.5 text-xs font-medium transition active:scale-95',
    // Riel (640-1023 px): círculos de icono; barra lateral (≥ 1024 px): píldoras con texto.
    'md:mx-auto md:size-11 md:min-h-0 md:rounded-full md:px-0',
    'lg:mx-0 lg:h-auto lg:min-h-control lg:w-full lg:flex-row lg:justify-start lg:gap-3 lg:px-3 lg:text-base',
    // Activo relleno de acento (4,62:1 sobre la superficie) y en negrita: no depende solo del tono (A-02).
    active ? 'bg-accent font-semibold text-on-accent' : 'text-fg-muted hover:bg-sunken hover:text-fg',
  );

/**
 * Navegación principal. Un solo componente, tres formas según el ancho:
 *   compacta (< 640 px)  → barra inferior con 4 ítems y «Más» con el resto (F-19)
 *   media (640–1023 px)  → riel lateral de iconos, con todos
 *   expandida (≥ 1024)   → barra lateral con texto, con todos
 * Alt+1…n abre cada sección en cualquier ancho (src/app/keyboard.ts).
 * `timer` (el temporizador en marcha) va sobre la barra inferior en compacto y sobre el pie en los demás.
 */
export function AppNav({ items, footer, timer }: { items: NavItem[]; footer?: ReactNode; timer?: ReactNode }) {
  const extra = items.slice(COMPACT_ITEMS);
  return (
    <nav
      aria-label={t('nav.main')}
      className={cx(
        // Sin línea de separación: el menú se distingue del contenido por su fondo.
        'relative flex min-w-0 shrink-0 flex-col bg-surface',
        'px-1 py-1',
        'md:w-rail md:gap-1 md:px-2 md:py-3',
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
          // Por debajo de 640 px, los que no caben se ven en «Más».
          <li key={to} className={cx('min-w-0 flex-1 md:block md:flex-none', i >= COMPACT_ITEMS && 'hidden')}>
            <NavLink to={to} title={`${label} (Alt+${i + 1})`} className={({ isActive }) => itemClass(isActive)}>
              <Icon size={18} aria-hidden="true" />
              <span className="max-w-full truncate md:sr-only lg:not-sr-only">{label}</span>
            </NavLink>
          </li>
        ))}
        {extra.length > 0 && (
          <li className="min-w-0 flex-1 md:hidden">
            <MoreMenu items={extra} offset={COMPACT_ITEMS} />
          </li>
        )}
      </ul>

      <div className="max-md:contents md:mt-auto md:flex md:flex-col md:gap-3">
        {timer && <div className="order-first mb-1 md:order-none md:mb-0">{timer}</div>}
        {footer && <div className="hidden md:flex md:justify-center lg:justify-start">{footer}</div>}
      </div>
    </nav>
  );
}

/**
 * «Más» (F-19): botón que abre la lista de las secciones que no caben en la barra inferior. Se marca activo
 * si la pantalla actual es una de ellas. Esc o un clic fuera la cierran y el foco vuelve al botón.
 */
function MoreMenu({ items, offset }: { items: NavItem[]; offset: number }) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const { pathname } = useLocation();
  const current = items.find((x) => matchPath({ path: x.to, end: false }, pathname));

  // Al cambiar de pantalla, la lista se cierra.
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  return (
    <div ref={box} className="relative" onKeyDown={onKeyDown}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        data-active={Boolean(current)}
        // Activo: el nombre dice en qué sección se está (lo visible sigue siendo «Más»).
        aria-label={current ? `${t('nav.more')} ${t('nav.moreCurrent', { section: current.label })}` : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cx(itemClass(Boolean(current)), 'w-full')}
      >
        <Ellipsis size={18} aria-hidden="true" />
        <span className="max-w-full truncate">{t('nav.more')}</span>
      </button>
      {open && (
        <ul id={listId} aria-label={t('nav.more')} className="motion-enter absolute right-0 bottom-full z-30 mb-2 flex w-48 flex-col gap-1 rounded-lg bg-surface p-2 shadow-overlay">
          {items.map(({ to, label, icon: Icon }, i) => (
            <li key={to}>
              <NavLink
                to={to}
                title={`${label} (Alt+${offset + i + 1})`}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  cx(
                    'flex min-h-touch items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                    isActive ? 'bg-accent font-semibold text-on-accent' : 'text-fg hover:bg-sunken',
                  )
                }
              >
                <Icon size={18} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
