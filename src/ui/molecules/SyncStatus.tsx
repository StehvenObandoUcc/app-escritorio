import { CloudCheck, CloudOff, CloudUpload, RefreshCw, TriangleAlert } from 'lucide-react';
import { cx } from '@/lib/cx';
import { formatHour } from '@/lib/time';

export type SyncPhase = 'off' | 'syncing' | 'pending' | 'synced' | 'error';

const VIEW: Record<SyncPhase, { label: string; icon: typeof CloudCheck; tone: string }> = {
  off: { label: 'Sin sincronizar', icon: CloudOff, tone: 'text-fg-muted' },
  syncing: { label: 'Sincronizando', icon: RefreshCw, tone: 'text-fg-muted' },
  pending: { label: 'Pendiente', icon: CloudUpload, tone: 'text-fg-muted' },
  synced: { label: 'Al día', icon: CloudCheck, tone: 'text-accent-text' },
  error: { label: 'Error', icon: TriangleAlert, tone: 'text-danger' },
};

/**
 * Indicador del estado de sincronización (SY-05). El estado se dice con texto e icono,
 * no solo con color. `message` explica el motivo cuando hay algo pendiente o un error.
 */
export function SyncStatus({
  phase,
  message,
  lastSyncedAt,
  compact = false,
}: {
  phase: SyncPhase;
  message?: string | null;
  lastSyncedAt?: string | null;
  /** Solo el icono, con el texto para lectores de pantalla (riel de navegación) */
  compact?: boolean;
}) {
  const { label, icon: Icon, tone } = VIEW[phase];
  const detail =
    message ?? (phase === 'synced' && lastSyncedAt ? `Última subida a las ${formatHour(lastSyncedAt)}` : null);
  return (
    <div role="status" className={cx('flex min-w-0 items-start gap-2 text-sm', tone)} title={detail ?? label}>
      <Icon size={16} aria-hidden="true" className="mt-1 shrink-0" />
      <div className={cx('min-w-0', compact && 'sr-only lg:not-sr-only')}>
        <p className="font-medium">{label}</p>
        {detail && <p className="text-xs text-fg-muted">{detail}</p>}
      </div>
    </div>
  );
}
