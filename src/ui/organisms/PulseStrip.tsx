import type { ActivityBlock, Category } from '@/bridge/contract';
import { t } from '@/i18n';
import { CATEGORY_STYLE } from '@/lib/categories';
import { cx } from '@/lib/cx';
import { formatHour } from '@/lib/time';
import { hourTicks, layoutBlocks, stripRange } from './pulseLayout';

/**
 * Franja de pulso: el día dibujado como un latido.
 * Cada bloque ocupa su tramo horario; la ALTURA y el COLOR indican la categoría
 * (trabajo enfocado = latido alto, distracción = bajo, sin actividad = línea base).
 * Es la pieza distintiva de Pulso: el resto de la interfaz se mantiene sobria.
 */
export function PulseStrip({ blocks, summary }: { blocks: ActivityBlock[]; summary: string }) {
  const range = stripRange(blocks);
  const placed = layoutBlocks(blocks, range);
  const ticks = hourTicks(range);
  const sparse = ticks.length > 9;
  // Leyenda: solo las categorías que hay en el día, en el orden de CATEGORY_STYLE (de más a menos altura).
  const present = (Object.keys(CATEGORY_STYLE) as Category[]).filter((c) => blocks.some((b) => b.category === c));

  return (
    <figure className="m-0">
      <div role="img" aria-label={summary} className="relative h-strip border-b border-line-strong">
        {placed.map(({ block, leftPct, widthPct }) => {
          const style = CATEGORY_STYLE[block.category];
          return (
            <div
              key={block.id}
              className="absolute bottom-0 flex h-full items-end pr-px"
              style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
              title={`${formatHour(block.startedAt)}–${formatHour(block.endedAt)} ${style.label}: ${block.appName}`}
            >
              <div className={cx('w-full rounded-t-xs', style.height, style.fill)} />
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-xs text-fg-muted tabular-nums">
        {ticks.map((hour, i) => (
          <span key={hour} className={cx((sparse ? i % 2 === 1 : false) && 'invisible md:visible')}>
            {String(hour).padStart(2, '0')}
          </span>
        ))}
      </div>
      {present.length > 0 && (
        <figcaption className="mt-3">
          <ul aria-label={t('pulseStrip.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            {present.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={cx('size-2.5 rounded-xs', CATEGORY_STYLE[c].fill)} />
                {CATEGORY_STYLE[c].label}
              </li>
            ))}
          </ul>
        </figcaption>
      )}
    </figure>
  );
}
