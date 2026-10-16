import { useEffect, useId, useRef, type ReactNode } from 'react';
import { t } from '@/i18n';
import { Button, Heading } from '@/ui/atoms';

/**
 * Confirmación de una acción con consecuencias (D3). Usa `<dialog>` nativo: atrapa el foco, se cierra con Esc
 * y es accesible sin código extra. `children` permite pedir algo más (por ejemplo, escribir el nombre de lo
 * que se borra); `confirmDisabled` bloquea el botón hasta que esté bien.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  busy = false,
  confirmDisabled = false,
  error,
  children,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  confirmDisabled?: boolean;
  error?: string | null;
  children?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // jsdom no implementa showModal: en las pruebas basta con el atributo `open`.
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby={titleId}
      className="m-auto w-full max-w-auth rounded-lg border border-line bg-surface p-5 text-fg shadow-overlay"
    >
      {open && (
        <form
          method="dialog"
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirmDisabled && !busy) onConfirm();
          }}
        >
          <Heading level={2}>
            <span id={titleId}>{title}</span>
          </Heading>
          <p className="text-fg-muted">{message}</p>
          {children}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant={danger ? 'danger' : 'primary'} disabled={confirmDisabled || busy}>
              {confirmLabel}
            </Button>
          </div>
        </form>
      )}
    </dialog>
  );
}
