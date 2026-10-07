import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { Segment, TimelineRow } from '@/lib/activity';
import { cleanTitle, displayAppName } from '@/lib/apps';
import { CATEGORY_STYLE } from '@/lib/categories';
import { formatHour, formatShortDuration } from '@/lib/time';
import { Badge, CategoryMark } from '@/ui/atoms';

function SegmentRow({ segment, nested = false }: { segment: Segment; nested?: boolean }) {
  const titles = segment.titles.map((t) => cleanTitle(t, segment.appName)).filter((t): t is string => Boolean(t));
  const extra = titles.length > 1 ? ` y ${titles.length - 1} más` : '';
  return (
    <div className={nested ? 'flex flex-wrap items-start gap-x-4 gap-y-1 py-2 pl-6' : 'flex flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 md:px-5'}>
      <span className="w-24 shrink-0 text-sm text-fg-muted tabular-nums">
        {formatHour(segment.startedAt)}–{formatHour(segment.endedAt)}
      </span>
      <span className="flex min-w-0 flex-1 basis-48 items-start gap-2">
        <span className="mt-1">
          <CategoryMark category={segment.category} />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-fg">{displayAppName(segment.appName)}</span>
          {titles[0] && (
            <span className="block truncate text-sm text-fg-muted" title={titles.join('\n')}>
              {titles[0]}
              {extra}
            </span>
          )}
        </span>
      </span>
      {segment.aiTool && <Badge tone="accent">{segment.aiTool}</Badge>}
      <span className="w-28 shrink-0 text-sm text-fg-muted">{CATEGORY_STYLE[segment.category].label}</span>
      <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">{formatShortDuration(segment.seconds)}</span>
    </div>
  );
}

function QuickRow({ row }: { row: Extract<TimelineRow, { kind: 'quick' }> }) {
  const [open, setOpen] = useState(false);
  const apps = [...new Set(row.segments.map((s) => displayAppName(s.appName)))];
  const Icon = open ? ChevronDown : ChevronRight;
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-wrap items-start gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-sunken md:px-5"
      >
        <span className="w-24 shrink-0 text-sm text-fg-muted tabular-nums">
          {formatHour(row.startedAt)}–{formatHour(row.endedAt)}
        </span>
        <span className="flex min-w-0 flex-1 basis-48 items-start gap-2">
          <Icon size={16} aria-hidden="true" className="mt-1 shrink-0 text-fg-muted" />
          <span className="min-w-0">
            <span className="block font-medium text-fg">
              {apps.length > 1 ? `Cambios rápidos entre ${apps.length} apps` : 'Cambios rápidos'}
            </span>
            <span className="block truncate text-sm text-fg-muted">{apps.join(', ')}</span>
          </span>
        </span>
        <span className="w-20 shrink-0 text-right text-sm text-fg tabular-nums">{formatShortDuration(row.seconds)}</span>
      </button>
      {open && (
        <div className="border-t border-line bg-sunken px-4 md:px-5">
          {row.segments.map((s) => (
            <SegmentRow key={s.blockIds[0]} segment={s} nested />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Línea de tiempo del día sin ruido: bloques seguidos de la misma app unidos, y las rachas de
 * cambios de menos de un minuto en una fila desplegable. Los títulos solo existen en este equipo.
 */
export function ActivityTimeline({ rows }: { rows: TimelineRow[] }) {
  return (
    <ol aria-label="Línea de tiempo" className="divide-y divide-line">
      {rows.map((row) => (
        <li key={row.kind === 'quick' ? `q-${row.startedAt}` : row.segment.blockIds[0]}>
          {row.kind === 'quick' ? <QuickRow row={row} /> : <SegmentRow segment={row.segment} />}
        </li>
      ))}
    </ol>
  );
}
