import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListChecks, Sun } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { TaskForm } from '@/ui/molecules';
import { AppNav } from '@/ui/organisms';
import { useAppKeyboard } from './keyboard';

const ROUTES = ['/mi-dia', '/tareas'];

function Harness({ onHelp, onSubmit }: { onHelp: () => void; onSubmit: () => void }) {
  useAppKeyboard(ROUTES, onHelp);
  return (
    <>
      <AppNav
        items={[
          { to: '/mi-dia', label: 'Mi día', icon: Sun },
          { to: '/tareas', label: 'Mis tareas', icon: ListChecks },
        ]}
      />
      <form
        aria-label="Formulario cualquiera"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <input aria-label="Uno" />
        <input aria-label="Dos" />
        <textarea aria-label="Notas" />
        <button type="submit">Enviar</button>
      </form>
      <p data-testid="ruta">{useLocation().pathname}</p>
    </>
  );
}

const setup = () => {
  const onHelp = vi.fn();
  const onSubmit = vi.fn();
  render(
    <MemoryRouter initialEntries={['/mi-dia']}>
      <Harness onHelp={onHelp} onSubmit={onSubmit} />
    </MemoryRouter>,
  );
  return { onHelp, onSubmit };
};

describe('teclado en toda la app (ADR-0019)', () => {
  it('Enter pasa al siguiente campo vacío de cualquier formulario y envía cuando no quedan', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText('Uno'), 'a{Enter}');
    expect(screen.getByLabelText('Dos')).toHaveFocus();
    expect(onSubmit).not.toHaveBeenCalled();
    await userEvent.keyboard('b{Enter}');
    expect(screen.getByLabelText('Notas')).toHaveFocus();
    await userEvent.keyboard('texto{Control>}{Enter}{/Control}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('Alt+número abre cada sección y «?» abre la ayuda (no mientras se escribe)', async () => {
    const { onHelp } = setup();
    await userEvent.keyboard('{Alt>}2{/Alt}');
    expect(screen.getByTestId('ruta')).toHaveTextContent('/tareas');
    await userEvent.type(screen.getByLabelText('Uno'), '?');
    expect(onHelp).not.toHaveBeenCalled();
    screen.getByLabelText('Uno').blur();
    await userEvent.keyboard('?');
    expect(onHelp).toHaveBeenCalled();
  });

  it('las flechas van al elemento más cercano en esa dirección (navegación espacial)', async () => {
    render(
      <div>
        <button>A</button>
        <button>B</button>
        <button>C</button>
        <button>D</button>
      </div>,
    );
    // Cuadrícula de 2×2: A B / C D
    const place = (name: string, left: number, top: number) =>
      vi.spyOn(screen.getByRole('button', { name }), 'getBoundingClientRect').mockReturnValue({ left, top, width: 80, height: 30, right: left + 80, bottom: top + 30, x: left, y: top, toJSON: () => ({}) });
    place('A', 0, 0);
    place('B', 200, 0);
    place('C', 0, 100);
    place('D', 200, 100);
    function Keys() {
      useAppKeyboard(ROUTES, () => {});
      return null;
    }
    render(
      <MemoryRouter>
        <Keys />
      </MemoryRouter>,
    );
    screen.getByRole('button', { name: 'A' }).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('button', { name: 'B' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'D' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(screen.getByRole('button', { name: 'C' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('button', { name: 'A' })).toHaveFocus();
  });

  it('Esc y Cancelar piden confirmar si el formulario cambió; sin cambios cancelan directo (F-01, H3)', async () => {
    const onCancel = vi.fn();
    const view = render(<TaskForm people={[]} manage isNew submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={onCancel} />);
    // Sin tocar nada, Esc cancela sin preguntar.
    await userEvent.click(screen.getByLabelText('Descripción'));
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    view.unmount();

    render(<TaskForm people={[]} manage isNew submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={onCancel} />);
    onCancel.mockClear();
    await userEvent.type(screen.getByLabelText('Descripción'), 'Notas a medias');
    await userEvent.keyboard('{Escape}');
    const dialog = screen.getByRole('dialog', { name: '¿Descartar los cambios?' });
    expect(onCancel).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Descripción')).toHaveValue('Notas a medias');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(screen.getByRole('dialog', { name: '¿Descartar los cambios?' })).getByRole('button', { name: 'Descartar' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('las flechas recorren el menú de navegación', async () => {
    setup();
    screen.getByRole('link', { name: 'Mi día' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Mis tareas' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('link', { name: 'Mi día' })).toHaveFocus();
  });
});
