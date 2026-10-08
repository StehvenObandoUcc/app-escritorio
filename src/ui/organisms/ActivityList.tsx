import { t } from '@/i18n';
import type { ActivityBlock, AiUsage } from '@/bridge/contract';
import { AI_USAGES, CATEGORY_STYLE } from '@/lib/categories';
import { cleanTitle, displayAppName } from '@/lib/apps';
import { formatHour, formatShortDuration } from '@/lib/time';
import { Badge, CategoryMark, Select } from '@/ui/atoms';

const seconds = (b: ActivityBlock) => (Date.parse(b.endedAt) - Date.parse(b.startedAt)) / 1000;

/**
 * Detalle del día, bloque por bloque, tal como lo guardó el sensor. Es la versión en texto de la franja de pulso.
 * Con `onAiUsage`, cada bloque de IA se puede etiquetar por tipo de uso (IA-04).
 */
export function ActivityList({ blocks, onAiUsage }: { blocks: ActivityBlock[]; onAiUsage?: (blockId: string, usage: AiUsage | null) => void }) {
  return (
    <ol aria-label={t('activity.blocks')} className="divide-y divide-line">
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
          {onAiUsage && block.category === 'ai' && (
            <Select
              size="sm"
              aria-label={t('aiUsage.of', { app: displayAppName(block.appName) })}
              value={block.aiUsage ?? ''}
              onChange={(e) => onAiUsage(block.id, (e.target.value || null) as AiUsage | null)}
              options={[{ value: '', label: t('aiUsage.none') }, ...AI_USAGES.map((u) => ({ value: u, label: t(`aiUsage.${u}`) }))]}
            />
          )}
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
