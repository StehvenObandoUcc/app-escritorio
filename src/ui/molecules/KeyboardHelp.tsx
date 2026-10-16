import { useEffect, useId, useRef } from 'react';
import { t, type TKey } from '@/i18n';
import { Button, Heading } from '@/ui/atoms';

const SHORTCUTS: [string, TKey][] = [
  ['← ↑ → ↓', 'keyboard.arrows'],
  ['Enter', 'keyboard.enter'],
  ['Esc', 'keyboard.esc'],
  ['Ctrl+Enter', 'keyboard.ctrlEnter'],
  ['Alt+1 … Alt+6', 'keyboard.sections'],
];

/** Ayuda de atajos de teclado (ADR-0019). `<dialog>` nativo: Esc la cierra y el foco queda dentro. */
export function KeyboardHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
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
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-auto w-full max-w-auth rounded-lg border border-line bg-surface p-5 text-fg shadow-overlay"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <Heading level={2}>
            <span id={titleId}>{t('keyboard.title')}</span>
          </Heading>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {SHORTCUTS.map(([keys, label]) => (
              <div key={keys} className="contents">
                <dt>
                  <kbd className="rounded-xs border border-line-strong bg-sunken px-1 font-sans text-xs">{keys}</kbd>
                </dt>
                <dd className="text-fg-muted">{t(label)}</dd>
              </div>
            ))}
          </dl>
          <div className="flex justify-end">
            <Button variant="primary" autoFocus onClick={onClose}>
              {t('keyboard.close')}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
