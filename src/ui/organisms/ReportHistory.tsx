import type { ReportRun } from '@/cloud/contract';
import { t } from '@/i18n';
import { periodLabel } from '@/lib/reports';
import { Badge } from '@/ui/atoms';

/** Historial de reportes que la persona puede ver (RI-09, D-14). `titleOf` da el nombre de cada uno. */
export function ReportHistory({
  reports,
  selectedId,
  titleOf,
  onOpen,
}: {
  reports: ReportRun[];
  selectedId: string | null;
  titleOf: (r: ReportRun) => string;
  onOpen: (r: ReportRun) => void;
}) {
  if (reports.length === 0) return <p className="text-sm text-fg-muted">{t('reports.history.empty')}</p>;
  return (
    <ul aria-label={t('reports.history.title')} className="flex flex-col divide-y divide-line">
      {reports.map((r) => {
        const name = titleOf(r);
        return (
          <li key={r.id} className="py-2">
            <button
              type="button"
              aria-current={r.id === selectedId || undefined}
              aria-label={t('reports.history.open', { name: `${name}, ${periodLabel(r)}` })}
              onClick={() => onOpen(r)}
              className={`flex w-full flex-col gap-1 rounded-md px-2 py-1 text-left hover:bg-sunken ${r.id === selectedId ? 'bg-sunken' : ''}`}
            >
              <span className="truncate font-medium text-fg">{name}</span>
              <span className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
                {periodLabel(r)}
                <Badge>{t(`reports.modes.${r.mode}`)}</Badge>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
