import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListChecks, Sun } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
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

  it('las flechas recorren el menú de navegación', async () => {
    setup();
    screen.getByRole('link', { name: 'Mi día' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Mis tareas' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('link', { name: 'Mi día' })).toHaveFocus();
  });
});
