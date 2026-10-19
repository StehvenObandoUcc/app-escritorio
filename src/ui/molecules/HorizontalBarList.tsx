import { t } from '@/i18n';
import { cx } from '@/lib/cx';

export interface HorizontalBarItem {
  /** Identificador estable (p. ej. el id del proyecto o de la tarea). */
  key: string;
  label: string;
  value: number;
  /** 0 = fila principal (p. ej. un proyecto); 1 = fila anidada (p. ej. sus tareas). */
  depth?: 0 | 1;
}

export interface HorizontalBarListProps {
  items: HorizontalBarItem[];
  /** Nombre accesible de la lista. */
  label: string;
  /** Cómo se escribe un valor. */
  formatValue: (value: number) => string;
  /** Clase de color de relleno (token). Por defecto, el acento. */
  fill?: string;
}

/**
 * Barras horizontales con etiqueta y valor (D-16). La propia lista es la versión en texto: cada fila dice su
 * nombre y su valor con palabras, y la barra solo lo repite en forma visual (`aria-hidden`).
 * Las barras se miden contra el mayor valor de la lista.
 */
export function HorizontalBarList({ items, label, formatValue, fill = 'bg-accent' }: HorizontalBarListProps) {
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0) return <p className="text-fg-muted">{t('charts.empty')}</p>;
  return (
    <ul aria-label={label} className="flex flex-col gap-3">
      {items.map((item) => {
        const nested = item.depth === 1;
        return (
          <li key={item.key} className={cx('flex flex-col gap-1', nested && 'pl-4 md:pl-6')}>
            <div className="flex items-baseline gap-2 text-sm">
              <span className={cx('min-w-0 truncate', nested ? 'text-fg-muted' : 'font-medium text-fg')}>{item.label}</span>
              <span className="ml-auto shrink-0 text-fg-muted tabular-nums">{formatValue(item.value)}</span>
            </div>
            <div aria-hidden="true" className={cx('w-full overflow-hidden rounded-full bg-sunken', nested ? 'h-1' : 'h-2')}>
              <div className={cx('motion-grow-x h-full rounded-full', fill)} style={{ width: `${max === 0 ? 0 : (item.value / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
