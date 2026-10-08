import { t } from '@/i18n';
import { useState } from 'react';
import type { TimeEntry } from '@/bridge/contract';
import { formatDuration, formatHour, localDate, localDateTimeToIso } from '@/lib/time';
import { Badge, Button } from '@/ui/atoms';
import { ConfirmDialog, TimeEntryForm, type TimeEntryValues } from '@/ui/molecules';

export interface TimeEntryListProps {
  entries: TimeEntry[];
  onUpdate: (id: string, start: string, end: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const toValues = (e: TimeEntry): TimeEntryValues => ({
  date: localDate(new Date(e.startedAt)),
  start: formatHour(e.startedAt),
  end: e.endedAt ? formatHour(e.endedAt) : '',
});

/** Entradas de tiempo del día. Las del temporizador en marcha no se pueden editar todavía. */
export function TimeEntryList({ entries, onUpdate, onDelete }: TimeEntryListProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const remove = async (id: string) => {
    setDeleteError(null);
    try {
      await onDelete(id);
      setConfirming(null);
    } catch (cause) {
      setDeleteError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <>
      <ConfirmDialog
        open={confirming !== null}
        title={t('entries.confirmDelete')}
        message={t('entries.deleteHint')}
        confirmLabel={t('entries.yesDelete')}
        danger
        error={deleteError}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && void remove(confirming)}
      />
      <ul aria-label={t('entries.label')} className="divide-y divide-line">
        {entries.map((entry) => {
          const range = `${formatHour(entry.startedAt)}–${entry.endedAt ? formatHour(entry.endedAt) : t('entries.running')}`;
          if (editing === entry.id) {
            return (
              <li key={entry.id} className="px-4 py-3 md:px-5">
                <TimeEntryForm
                  initial={toValues(entry)}
                  submitLabel={t('common.save')}
                  onCancel={() => setEditing(null)}
                  onSubmit={async (v) => {
                    await onUpdate(entry.id, localDateTimeToIso(v.date, v.start), localDateTimeToIso(v.date, v.end));
                    setEditing(null);
                  }}
                />
              </li>
            );
          }
          return (
            <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 md:px-5">
              <span className="w-32 shrink-0 text-sm text-fg tabular-nums">{range}</span>
              <span className="w-20 shrink-0 text-sm text-fg-muted tabular-nums">
                {entry.endedAt ? formatDuration((Date.parse(entry.endedAt) - Date.parse(entry.startedAt)) / 1000) : '—'}
              </span>
              <Badge>{t(`entries.source.${entry.source}`)}</Badge>
              <span className="flex min-w-0 flex-1 basis-48 flex-wrap items-center justify-end gap-2">
                {entry.endedAt && (
                  <>
                    <Button size="sm" variant="ghost" aria-label={t('entries.editOf', { range })} onClick={() => setEditing(entry.id)}>
                      {t('entries.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('entries.deleteOf', { range })}
                      onClick={() => {
                        setDeleteError(null);
                        setConfirming(entry.id);
                      }}
                    >
                      {t('entries.delete')}
                    </Button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
