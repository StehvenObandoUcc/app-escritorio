import { useEffect, useId, useRef } from 'react';
import { t, type TKey } from '@/i18n';
import { Button, Heading } from '@/ui/atoms';

/** Secciones de la navegación hoy (Alt+1 … Alt+7): Mi día, Mis tareas, Proyectos, Equipo, Tablero, Reportes y Ajustes. */
const DEFAULT_SECTIONS = 7;

/** Ayuda de atajos de teclado (ADR-0019). `sectionCount` = cuántas secciones abre Alt+número (la lista de rutas de la app). `<dialog>` nativo: Esc la cierra y el foco queda dentro. */
export function KeyboardHelp({ open, onClose, sectionCount = DEFAULT_SECTIONS }: { open: boolean; onClose: () => void; sectionCount?: number }) {
  const shortcuts: [string, TKey][] = [
    ['← ↑ → ↓', 'keyboard.arrows'],
    ['Enter', 'keyboard.enter'],
    ['Esc', 'keyboard.esc'],
    ['Ctrl+Enter', 'keyboard.ctrlEnter'],
    [`Alt+1 … Alt+${sectionCount}`, 'keyboard.sections'],
  ];
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
      className="m-auto w-full max-w-auth rounded-lg bg-surface p-5 text-fg shadow-overlay"
    >
      {open && (
        <div className="flex flex-col gap-4">
          <Heading level={2}>
            <span id={titleId}>{t('keyboard.title')}</span>
          </Heading>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {shortcuts.map(([keys, label]) => (
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
