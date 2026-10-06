import type { ActivityBlock } from '@/bridge/contract';
import { CATEGORY_STYLE } from '@/lib/categories';
import { cleanTitle, displayAppName } from '@/lib/apps';
import { formatHour, formatShortDuration } from '@/lib/time';
import { Badge, CategoryMark } from '@/ui/atoms';

const seconds = (b: ActivityBlock) => (Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000;

/** Detalle del día, bloque por bloque, tal como lo guardó el sensor. Es la versión en texto de la franja de pulso. */
export function ActivityList({ blocks }: { blocks: ActivityBlock[] }) {
  return (
    <ol aria-label="Bloques de actividad" className="divide-y divide-line">
      {blocks.map((block) => (
        <li key={block.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 md:px-5">
          <span className="w-24 shrink-0 text-sm text-fg-muted tabular-nums">
            {formatHour(block.startedAt)}–{formatHour(block.endedAt)}
          </span>
          <span className="flex min-w-0 flex-1 basis-48 items-start gap-2">
            <span className="mt-1">
              <CategoryMark category={block.category} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium text-fg">{displayAppName(block.appName)}</span>
              {cleanTitle(block.title, block.appName) && (
                <span className="block truncate text-sm text-fg-muted">{cleanTitle(block.title, block.appName)}</span>
              )}
            </span>
          </span>
          {block.aiTool && <Badge tone="accent">{block.aiTool}</Badge>}
          <span className="w-28 shrink-0 text-sm text-fg-muted">
            {CATEGORY_STYLE[block.category].label}
          </span>
          <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">
            {formatShortDuration(seconds(block))}
          </span>
        </li>
      ))}
    </ol>
  );
}
