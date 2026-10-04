import type { ActivityBlock } from '@/bridge/contract';
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
    </figure>
  );
}
