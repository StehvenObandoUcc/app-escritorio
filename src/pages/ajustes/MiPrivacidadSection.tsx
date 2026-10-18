import { useId, useState } from 'react';
import type { Bridge } from '@/bridge/contract';
import { useOptionalSession } from '@/app/session';
import { errorMessage, t } from '@/i18n';
import { Button, Heading, Surface } from '@/ui/atoms';
import { ConfirmDialog } from '@/ui/molecules';

/**
 * *Ajustes → Mi privacidad* (F5 D-19): compartir o no los nombres de mis apps con el equipo (PS-05)
 * y exportar mis datos (CU-07). La exportación es local, así que se ofrece también sin sesión.
 */
export function MiPrivacidadSection({ bridge }: { bridge: Bridge }) {
  const session = useOptionalSession();
  const hintId = useId();
  const team = session?.activeTeam ?? null;
  const canShare = Boolean(session && team && team.role !== 'viewer');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportedTo, setExportedTo] = useState<string | null>(null);

  const setShare = async (share: boolean) => {
    if (!session || !team) return;
    setBusy(true);
    setShareError(null);
    // Al apagar, el motor deja de subir nombres ya, sin esperar a la nube ni a releer los equipos (PS-05, R8).
    if (!share) session.applyShareAppNames(false);
    try {
      await session.cloud.setShareAppNames(team.id, share);
      if (share) session.applyShareAppNames(true);
      await session.refresh();
      setConfirming(false);
    } catch (cause) {
      if (!share) session.applyShareAppNames(true, true); // la nube no lo aceptó: sigue como estaba
      setShareError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const exportData = async () => {
    setExporting(true);
    setExportError(null);
    setExportedTo(null);
    try {
      setExportedTo(await bridge.exportMyData());
    } catch (cause) {
      setExportError(errorMessage(cause));
    } finally {
      setExporting(false);
    }
  };

  return (
    <Surface as="section" aria-label={t('myPrivacy.title')} className="flex max-w-prose flex-col gap-4">
      <div>
        <Heading level={2}>{t('myPrivacy.title')}</Heading>
        <p className="mt-1 text-sm text-fg-muted">{t('myPrivacy.hint')}</p>
      </div>
      {canShare && team && (
        <div className="flex flex-col gap-1">
          <label className="flex items-center gap-2 text-sm font-medium text-fg">
            <input
              type="checkbox"
              role="switch"
              className="size-4 accent-accent"
              checked={team.shareAppNames}
              disabled={busy}
              aria-describedby={hintId}
              onChange={(e) => (e.target.checked ? void setShare(true) : setConfirming(true))}
            />
            {t('myPrivacy.shareLabel')}
          </label>
          <p id={hintId} className="text-sm text-fg-muted">
            {t('myPrivacy.shareHint')}
          </p>
          <p className="text-xs text-fg-muted">{t('myPrivacy.shareTeam', { team: team.name })}</p>
          {!confirming && shareError && (
            <p role="alert" className="text-sm text-danger">
              {shareError}
            </p>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={t('myPrivacy.confirmTitle')}
        message={t('myPrivacy.confirmMessage')}
        confirmLabel={t('myPrivacy.confirmYes')}
        busy={busy}
        error={shareError}
        onCancel={() => {
          setConfirming(false);
          setShareError(null);
        }}
        onConfirm={() => void setShare(false)}
      />
      <div className="flex flex-col gap-2">
        <Heading level={3}>{t('myPrivacy.exportTitle')}</Heading>
        <p className="text-sm text-fg-muted">{t('myPrivacy.exportHint')}</p>
        <div>
          <Button onClick={() => void exportData()} disabled={exporting}>
            {exporting ? t('myPrivacy.exporting') : t('myPrivacy.exportButton')}
          </Button>
        </div>
        {exportedTo && (
          <p role="status" className="text-sm text-fg-muted">
            {t('myPrivacy.exported', { path: exportedTo })}
          </p>
        )}
        {exportError && (
          <p role="alert" className="text-sm text-danger">
            {exportError}
          </p>
        )}
      </div>
    </Surface>
  );
}
