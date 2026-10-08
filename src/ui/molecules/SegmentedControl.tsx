import { useRef, type KeyboardEvent } from 'react';
import { cx } from '@/lib/cx';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/**
 * Pestañas (AC-44): patrón ARIA de pestañas con foco móvil. Solo la pestaña activa recibe Tab; las flechas
 * izquierda y derecha cambian de pestaña, Inicio y Fin van a la primera y la última.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} role="tablist" aria-label={label} className="inline-flex max-w-full flex-wrap gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          data-value={o.value}
          aria-selected={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
          onClick={() => onChange(o.value)}
          onKeyDown={move}
          className={cx(
            'h-control-sm rounded-md px-3 text-sm font-medium transition-colors',
            value === o.value ? 'border border-line bg-surface text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
