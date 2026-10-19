import { useId, useRef, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/**
 * Control segmentado con foco móvil (AC-44): solo la opción activa recibe Tab; las flechas cambian de
 * opción, Inicio y Fin van a la primera y la última. Dos semánticas (A-03):
 * - con `panelId`, son pestañas que cambian el contenido de ese panel (`tablist`/`tab` + `aria-controls`);
 *   el panel lleva `role="tabpanel"` e `id={panelId}` y se nombra con `tabPanelLabel(panelId, value)`;
 * - sin `panelId`, es una elección de filtro o vista (`radiogroup`/`radio`).
 * La opción activa lleva una barra inferior, no solo un fondo distinto (A-02, WCAG 1.4.1).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  panelId,
}: {
  label: string;
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
  panelId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const fallbackId = useId();
  const tabs = Boolean(panelId);
  const move = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = options.findIndex((o) => o.value === value);
    const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: options.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const target = options[(next + options.length) % options.length]!;
    onChange(target.value);
    ref.current?.querySelector<HTMLButtonElement>(`[data-value="${CSS.escape(target.value)}"]`)?.focus();
  };
  return (
    <div ref={ref} role={tabs ? 'tablist' : 'radiogroup'} aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            id={tabs ? tabId(panelId!, o.value) : `${fallbackId}-${o.value}`}
            role={tabs ? 'tab' : 'radio'}
            data-value={o.value}
            aria-selected={tabs ? active : undefined}
            aria-checked={tabs ? undefined : active}
            aria-controls={tabs && active ? panelId : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={move}
            className={cx(
              'h-control-sm rounded-full border border-b-3 px-3 text-sm font-medium transition-colors',
              active ? 'border-line border-b-accent bg-surface text-fg' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const tabId = (panelId: string, value: string) => `${panelId}-tab-${value}`;

/** `aria-labelledby` del panel: la pestaña activa lo nombra. */
export const tabPanelLabel = (panelId: string, value: string) => tabId(panelId, value);
