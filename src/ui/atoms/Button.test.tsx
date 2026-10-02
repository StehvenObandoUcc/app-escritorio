import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('ejecuta onClick', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Guardar cambios</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('no envía formularios por accidente (type="button" por defecto)', () => {
    render(<Button>Cancelar</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('deshabilitado no responde', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Guardar cambios
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });
});
