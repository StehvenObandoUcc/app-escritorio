import { t } from '@/i18n';
import type { useForm } from '@/lib/useForm';
import { ConfirmDialog } from './ConfirmDialog';

/** Confirma descartar los cambios de un formulario (F-01). Va junto al `<form>`, nunca dentro. */
export function DiscardDialog({ discard }: { discard: ReturnType<typeof useForm>['discard'] }) {
  return (
    <ConfirmDialog
      open={discard.open}
      title={t('forms.discardTitle')}
      message={t('forms.discardMessage')}
      confirmLabel={t('forms.discardConfirm')}
      cancelLabel={t('forms.keepEditing')}
      danger
      onConfirm={discard.confirm}
      onCancel={discard.keep}
    />
  );
}
