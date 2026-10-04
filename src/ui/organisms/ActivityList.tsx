import type { ActivityBlock } from '@/bridge/contract';
import { CATEGORY_STYLE } from '@/lib/categories';
import { formatDuration, formatHour } from '@/lib/time';
import { Badge, CategoryMark } from '@/ui/atoms';

const seconds = (b: ActivityBlock) => (Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000;

/** Detalle del día, bloque por bloque. Es la versión en texto de la franja de pulso. */
export function ActivityList({ blocks }: { blocks: ActivityBlock[] }) {
  return (
    <ol aria-label="Bloques de actividad" className="divide-y divide-line">
      {blocks.map((block) => (
        <li key={block.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 md:px-5">
          <span className="w-24 shrink-0 text-sm text-fg-muted tabular-nums">
            {formatHour(block.startedAt)}–{formatHour(block.endedAt)}
          </span>
          <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
            <CategoryMark category={block.category} />
            <span className="truncate">
              <span className="font-medium text-fg">{block.appName}</span>
              {block.title && <span className="text-fg-muted"> {block.title}</span>}
            </span>
          </span>
          {block.aiTool && <Badge tone="accent">{block.aiTool}</Badge>}
          <span className="w-28 shrink-0 text-sm text-fg-muted">
            {CATEGORY_STYLE[block.category].label}
          </span>
          <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">
            {formatDuration(seconds(block))}
          </span>
        </li>
      ))}
    </ol>
  );
}
