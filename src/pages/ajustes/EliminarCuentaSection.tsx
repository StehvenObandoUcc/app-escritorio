import { useState } from 'react';
import type { Bridge } from '@/bridge/contract';
import { useOptionalSession } from '@/app/session';
import { useAction } from '@/app/useAction';
import { t } from '@/i18n';
import { Button, Heading, Input, Surface } from '@/ui/atoms';
import { ConfirmDialog } from '@/ui/molecules';

/**
 * *Ajustes → Cuenta*: eliminar mi cuenta (CU-08, spec F7). Orden (D-5): nube → datos locales → cerrar sesión.
 * Si la nube falla o lo bloquea, el error se ve en el diálogo y no se borra nada local.
 */
export function EliminarCuentaSection({ bridge }: { bridge: Bridge }) {
  const session = useOptionalSession();
  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState('');
  const [exportedTo, setExportedTo] = useState<string | null>(null);
  const action = useAction();
  const exporting = useAction();
  const user = session?.user;
  if (!session || !user) return null;

  const close = () => {
    setConfirming(false);
    setEmail('');
    setExportedTo(null);
    action.setError(null);
    exporting.setError(null);
  };
  const remove = () =>
    void action.run(async () => {
      await session.cloud.deleteAccount();
      try {
        await bridge.localDataClear();
        await bridge.aiConfigClear();
      } finally {
        // La cuenta ya no existe: la sesión se cierra aunque falle lo local. La app vuelve a la pantalla de acceso.
        await session.cloud.signOut();
      }
    });
  const exportData = () =>
    void exporting.run(async () => {
      setExportedTo(await bridge.exportMyData());
    });

  return (
    <Surface as="section" aria-label={t('deleteAccount.title')} className="flex flex-col gap-2">
      <Heading level={3} className="text-lg">{t('deleteAccount.title')}</Heading>
      <p className="text-sm text-fg-muted">{t('deleteAccount.hint')}</p>
      <div>
        <Button variant="danger" onClick={() => setConfirming(true)}>
          {t('deleteAccount.button')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('deleteAccount.confirmTitle')}
        message={t('deleteAccount.confirmMessage')}
        confirmLabel={t('deleteAccount.confirmYes')}
        danger
        busy={action.busy}
        error={action.error ?? exporting.error}
        confirmDisabled={email.trim().toLowerCase() !== user.email.toLowerCase()}
        onCancel={close}
        onConfirm={remove}
      >
        <div className="flex flex-col gap-1">
          <div>
            <Button onClick={exportData} disabled={exporting.busy}>
              {exporting.busy ? t('myPrivacy.exporting') : t('deleteAccount.exportFirst')}
            </Button>
          </div>
          {exportedTo && (
            <p role="status" className="text-sm text-fg-muted">
              {t('myPrivacy.exported', { path: exportedTo })}
            </p>
          )}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('deleteAccount.typeEmail', { email: user.email })}
          <Input name="confirmEmail" type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
      </ConfirmDialog>
    </Surface>
  );
}
