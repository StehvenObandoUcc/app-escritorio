import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

const dialogOf = () => screen.getByText('¿Seguro?').closest('dialog')!;

describe('ConfirmDialog', () => {
  it('Esc no cierra mientras la acción está en curso; sin ella, sí', () => {
    const onCancel = vi.fn();
    const props = { open: true, title: '¿Seguro?', message: 'Se borra.', confirmLabel: 'Borrar', onConfirm: () => {}, onCancel };
    const { rerender } = render(<ConfirmDialog {...props} busy />);
    fireEvent(dialogOf(), new Event('cancel', { cancelable: true }));
    expect(onCancel).not.toHaveBeenCalled();

    rerender(<ConfirmDialog {...props} busy={false} />);
    fireEvent(dialogOf(), new Event('cancel', { cancelable: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
