import type { AppTotal } from '@/lib/activity';
import { displayAppName } from '@/lib/apps';
import { CATEGORY_STYLE } from '@/lib/categories';
import { formatShortDuration } from '@/lib/time';
import { CategoryMark, ProgressBar } from '@/ui/atoms';

/**
 * Tiempo por app, de más a menos: responde «¿en qué se me fue el día?». La barra es relativa a la
 * app con más tiempo; la categoría se repite en texto (nada depende solo del color).
 */
export function AppSummary({ totals }: { totals: AppTotal[] }) {
  const max = totals[0]?.seconds ?? 0;
  return (
    <ol aria-label="Tiempo por app" className="divide-y divide-line">
      {totals.map((t) => {
        const name = displayAppName(t.appName);
        const ai = t.byCategory.ai ?? 0;
        return (
          <li key={t.appName} className="flex flex-col gap-2 px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CategoryMark category={t.mainCategory} />
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{name}</span>
              <span className="text-sm text-fg-muted">{CATEGORY_STYLE[t.mainCategory].label}</span>
              <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">{formatShortDuration(t.seconds)}</span>
            </div>
            <ProgressBar value={max ? t.seconds / max : 0} label={`${name}: ${formatShortDuration(t.seconds)}`} fill={CATEGORY_STYLE[t.mainCategory].fill} />
            {ai > 0 && t.mainCategory !== 'ai' && (
              <p className="text-sm text-fg-muted">
                Incluye {formatShortDuration(ai)} con IA{t.aiTools.length ? ` (${t.aiTools.join(', ')})` : ''}.
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
