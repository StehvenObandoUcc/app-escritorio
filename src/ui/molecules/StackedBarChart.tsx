import type { Category } from '@/bridge/contract';
import { intlLocale, t } from '@/i18n';
import { CATEGORY_STYLE } from '@/lib/categories';
import { cx } from '@/lib/cx';
import { CategoryMark } from '@/ui/atoms';

export interface StackedBarDatum {
  label: string;
  segments: { key: Category; value: number }[];
}

export interface StackedBarChartProps {
  /** Una barra por elemento; sus segmentos se apilan de abajo hacia arriba en el orden dado. */
  data: StackedBarDatum[];
  /** Nombre de la unidad de los valores (texto), p. ej. «horas». */
  unit: string;
  /** Cómo se escribe un valor. El componente no calcula: solo suma los segmentos para apilarlos. */
  formatValue: (value: number) => string;
  /** Etiqueta corta sobre la barra (cabe en una barra angosta). La tabla y el `title` siguen con `formatValue`. */
  formatShort?: (value: number) => string;
  /** Título de la gráfica: etiqueta accesible y título de la tabla. */
  label: string;
}

/** Con más barras que esto, el valor de cada una va solo en la tabla y en el título de la barra. */
const MAX_BARS_WITH_VALUE = 7;
/** En ancho estrecho (< 640 px) con más barras que esto, el valor sobre la barra se oculta: el dato sigue en la tabla y en el título. */
const MAX_BARS_COMPACT = 5;
const MAX_LABELS = 8;
const ORDER: Category[] = ['productive', 'ai', 'neutral', 'distraction', 'break', 'idle', 'paused'];

/** Horas con un decimal y la coma o el punto del idioma: 5.25 → «5,3 h» / «5.3 h». Solo formato. */
export const formatHoursShort = (hours: number) => t('charts.hoursShort', { v: new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(hours) });

const totalOf = (d: StackedBarDatum) => d.segments.reduce((sum, s) => sum + s.value, 0);

/**
 * Barras verticales apiladas por categoría (D-16). Sin librerías, solo tokens.
 * Nada depende solo del color: leyenda con texto, valor en texto y una tabla equivalente con las mismas cifras
 * (visible para lectores de pantalla) que repite cada segmento.
 */
export function StackedBarChart({ data, unit, formatValue, formatShort = formatValue, label }: StackedBarChartProps) {
  const keys = ORDER.filter((k) => data.some((d) => d.segments.some((s) => s.key === k)));
  const valueOf = (d: StackedBarDatum, key: Category) => d.segments.filter((s) => s.key === key).reduce((sum, s) => sum + s.value, 0);
  const max = Math.max(0, ...data.map(totalOf));
  const showValues = data.length <= MAX_BARS_WITH_VALUE;
  const labelStep = Math.max(1, Math.ceil(data.length / MAX_LABELS));

  return (
    <figure className="flex flex-col gap-3">
      <div role="img" aria-label={t('charts.summary', { label, days: data.length })} className="flex flex-col gap-1">
        <div className="flex h-40 items-end gap-1 border-b border-line-strong md:h-48">
          {data.map((d) => {
            const total = totalOf(d);
            return (
              <div key={d.label} title={t('charts.bar', { label: d.label, value: formatValue(total) })} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-1">
                {showValues && (
                  <span aria-hidden="true" className={cx('overflow-hidden text-center text-xs whitespace-nowrap text-fg-muted tabular-nums', data.length > MAX_BARS_COMPACT && 'hidden md:block')}>
                    {formatShort(total)}
                  </span>
                )}
                <div className="motion-grow-y flex flex-col-reverse overflow-hidden rounded-xs" style={{ height: max === 0 ? '0%' : `${(total / max) * (showValues ? 85 : 100)}%` }}>
                  {d.segments
                    .filter((s) => s.value > 0)
                    .map((s) => (
                      <div key={s.key} className={CATEGORY_STYLE[s.key].fill} style={{ height: `${(s.value / total) * 100}%` }} />
                    ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-1" aria-hidden="true">
          {data.map((d, i) => (
            <span key={d.label} className="min-w-0 flex-1 truncate text-center text-xs text-fg-muted">
              {i % labelStep === 0 ? d.label : ''}
            </span>
          ))}
        </div>
      </div>

      <ul aria-label={t('charts.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-fg">
        {keys.map((k) => (
          <li key={k} className="flex items-center gap-2">
            <CategoryMark category={k} />
            {CATEGORY_STYLE[k].label}
          </li>
        ))}
      </ul>

      <div className="sr-only">
        <table>
          <caption>{t('charts.caption', { label, unit })}</caption>
          <thead>
            <tr>
              <th scope="col">{t('charts.itemColumn')}</th>
              {keys.map((k) => (
                <th key={k} scope="col">
                  {CATEGORY_STYLE[k].label}
                </th>
              ))}
              <th scope="col">{t('charts.total')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.label}>
                <th scope="row">{d.label}</th>
                {keys.map((k) => (
                  <td key={k}>{formatValue(valueOf(d, k))}</td>
                ))}
                <td>{formatValue(totalOf(d))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
