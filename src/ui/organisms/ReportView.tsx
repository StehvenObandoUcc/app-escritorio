import { Download, Printer } from 'lucide-react';
import type { Fact, Narrative, ReportRun } from '@/cloud/contract';
import { formatDate, t } from '@/i18n';
import { factLabel, factValue, periodLabel } from '@/lib/reports';
import { formatHour } from '@/lib/time';
import { Badge, Button, Heading } from '@/ui/atoms';

export type ExportFormat = 'markdown' | 'json' | 'csv' | 'pdf';

/**
 * Un reporte (spec F4, D-19): las cifras se pintan desde los hechos que calculó SQL y el texto de la IA va debajo,
 * marcado como redactado por IA e indicativo. Cada observación muestra las cifras en que se apoya (RI-04).
 */
export function ReportView({ report, title, onExport }: { report: ReportRun; title: string; onExport?: (format: ExportFormat) => void }) {
  const byId = new Map(report.facts.map((f) => [f.id, f]));
  const { narrative } = report;
  return (
    <article aria-label={title} className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Heading level={2}>{title}</Heading>
        <p className="text-sm text-fg-muted">
          {periodLabel(report)} · {t('reports.view.generatedBy', { date: formatDate(report.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), mode: t(`reports.modes.${report.mode}`) })}
        </p>
        <div className="flex flex-wrap gap-2">
          {report.dataUntil && <Badge>{t('reports.view.dataUntil', { time: formatHour(report.dataUntil) })}</Badge>}
          <Badge tone={report.validatedBy === 'server' ? 'accent' : 'neutral'}>
            {report.validatedBy === 'server' ? t('reports.view.validatedServer') : t('reports.view.validatedClient')}
          </Badge>
        </div>
      </header>

      <section aria-label={t('reports.view.figures')} className="flex flex-col gap-2">
        <Heading level={3}>{t('reports.view.figures')}</Heading>
        {report.facts.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('reports.view.noFigures')}</p>
        ) : (
          <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {report.facts.map((f) => (
              <div key={f.id} className="flex flex-col rounded-md border border-line bg-surface px-3 py-2">
                <dt className="text-sm text-fg-muted">{factLabel(f)}</dt>
                <dd className="text-lg font-semibold text-fg tabular-nums">{factValue(f)}</dd>
              </div>
            ))}
          </dl>
        )}
        <p className="text-xs text-fg-muted">{t('reports.view.figuresHint')}</p>
      </section>

      <section aria-label={t('reports.view.summary')} className="flex flex-col gap-3">
        <Heading level={3}>{t('reports.view.summary')}</Heading>
        {report.validation === 'fallback' && (
          <p role="note" className="rounded-md bg-sunken px-3 py-2 text-sm text-fg">
            {t('reports.view.fallback')}
          </p>
        )}
        <p className="text-fg">{narrative.insufficient_data && !narrative.summary ? t('reports.view.insufficient') : narrative.summary}</p>
      </section>
      <Items title={t('reports.view.insights')} items={narrative.insights} byId={byId} />
      <Items title={t('reports.view.recommendations')} items={narrative.recommendations} byId={byId} />
      <p className="text-xs text-fg-muted">{t('reports.view.aiWritten')}</p>

      {onExport && (
        <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label={t('reports.export.title')}>
          {(['markdown', 'json', 'csv'] as const).map((format) => (
            <Button key={format} size="sm" variant="secondary" icon={<Download size={16} aria-hidden="true" />} onClick={() => onExport(format)}>
              {t(`reports.export.${format}`)}
            </Button>
          ))}
          <Button size="sm" variant="secondary" icon={<Printer size={16} aria-hidden="true" />} onClick={() => onExport('pdf')}>
            {t('reports.export.pdf')}
          </Button>
        </div>
      )}
    </article>
  );
}

function Items({ title, items, byId }: { title: string; items: Narrative['insights']; byId: Map<string, Fact> }) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <Heading level={3}>{title}</Heading>
      <ul className="flex flex-col gap-2">
        {items.map((item, i) => {
          const cited = item.fact_ids.map((id) => byId.get(id)).filter((f): f is Fact => Boolean(f));
          return (
            <li key={i} className="flex flex-col gap-1 rounded-md bg-sunken px-3 py-2">
              <span className="text-fg">{item.text}</span>
              {cited.length > 0 && (
                <span className="text-xs text-fg-muted">
                  {t('reports.view.cites')}: {cited.map((f) => `${factLabel(f)} ${factValue(f)}`).join(' · ')}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
