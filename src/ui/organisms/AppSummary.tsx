import { t } from '@/i18n';
import type { AppTotal } from '@/lib/activity';
import { appColor, displayAppName } from '@/lib/apps';
import { CATEGORY_STYLE } from '@/lib/categories';
import { formatShortDuration } from '@/lib/time';
import { Badge, CategoryMark, ProgressBar } from '@/ui/atoms';

/**
 * Tiempo por app, de más a menos: responde «¿en qué se me fue el día?». Cada app tiene su color de
 * barra (siempre el mismo); la categoría se dice con su marca y en texto (nada depende solo del color).
 */
export function AppSummary({
  totals,
  kind = 'app',
  flagged,
}: {
  totals: AppTotal[];
  /** `site`: cada fila es un dominio (se muestra tal cual) */
  kind?: 'app' | 'site';
  /** Filas marcadas «No permitido» por el equipo (dominios) */
  flagged?: ReadonlySet<string>;
}) {
  const max = totals[0]?.seconds ?? 0;
  return (
    <ol aria-label={kind === 'site' ? t('activity.bySite') : t('activity.byApp')} className="divide-y divide-line">
      {totals.map((x) => {
        const name = kind === 'site' ? x.appName : displayAppName(x.appName);
        const ai = x.byCategory.ai ?? 0;
        return (
          <li key={x.appName} className="flex flex-col gap-2 px-4 py-3 md:px-5">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <CategoryMark category={x.mainCategory} />
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{name}</span>
              {flagged?.has(x.appName) && <Badge tone="danger">{t('activity.notAllowed')}</Badge>}
              <span className="text-sm text-fg-muted">{CATEGORY_STYLE[x.mainCategory].label}</span>
              <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">{formatShortDuration(x.seconds)}</span>
            </div>
            <ProgressBar value={max ? x.seconds / max : 0} label={`${name}: ${formatShortDuration(x.seconds)}`} fill={appColor(x.appName)} />
            {ai > 0 && x.mainCategory !== 'ai' && (
              <p className="text-sm text-fg-muted">
                {t('activity.includesAi', { time: formatShortDuration(ai), tools: x.aiTools.length ? ` (${x.aiTools.join(', ')})` : '' })}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
