import { useEffect, useRef } from 'react';
import { t } from '@/i18n';
import { Button, Heading } from '@/ui/atoms';

/**
 * Confirmación de una acción con consecuencias (D3). Usa `<dialog>` nativo: atrapa el foco, se cierra con Esc
 * y es accesible sin código extra.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
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
      aria-labelledby="confirm-title"
      className="m-auto w-full max-w-auth rounded-lg border border-line bg-surface p-5 text-fg shadow-overlay"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <Heading level={2}>
            <span id="confirm-title">{title}</span>
          </Heading>
          <p className="text-fg-muted">{message}</p>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={onCancel}>
              {t('common.cancel')}
            </Button>
            <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
