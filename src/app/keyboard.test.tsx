import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ListChecks, Sun } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { TaskForm } from '@/ui/molecules';
import { AppNav } from '@/ui/organisms';
import { AppShell } from '@/ui/templates';
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

  it('Ctrl+Enter guarda también desde un campo de una línea, como dice la pista (clarify)', async () => {
    const { onSubmit } = setup();
    await userEvent.type(screen.getByLabelText('Uno'), 'a{Control>}{Enter}{/Control}');
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

  it('cambiar de pantalla con un formulario con cambios pide confirmar; sin cambios no (F-01, H3)', async () => {
    function Screen() {
      useAppKeyboard(ROUTES, () => {});
      return (
        <>
          <AppNav
            items={[
              { to: '/mi-dia', label: 'Mi día', icon: Sun },
              { to: '/tareas', label: 'Mis tareas', icon: ListChecks },
            ]}
          />
          {useLocation().pathname === '/mi-dia' && <TaskForm people={[]} manage isNew submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={() => {}} />}
          <p data-testid="ruta">{useLocation().pathname}</p>
        </>
      );
    }
    render(
      <MemoryRouter initialEntries={['/mi-dia']}>
        <Screen />
      </MemoryRouter>,
    );
    const ruta = screen.getByTestId('ruta');
    await userEvent.type(screen.getByLabelText('Descripción'), 'Notas a medias');

    // Clic en el menú: pregunta y no se va; «Seguir editando» conserva lo escrito.
    await userEvent.click(screen.getByRole('link', { name: 'Mis tareas' }));
    expect(ruta).toHaveTextContent('/mi-dia');
    await userEvent.click(within(screen.getByRole('dialog', { name: '¿Descartar los cambios?' })).getByRole('button', { name: 'Seguir editando' }));
    expect(ruta).toHaveTextContent('/mi-dia');
    expect(screen.getByLabelText('Descripción')).toHaveValue('Notas a medias');

    // Alt+número también pregunta; «Descartar» completa la salida.
    await userEvent.keyboard('{Alt>}2{/Alt}');
    expect(ruta).toHaveTextContent('/mi-dia');
    await userEvent.click(within(screen.getByRole('dialog', { name: '¿Descartar los cambios?' })).getByRole('button', { name: 'Descartar' }));
    expect(ruta).toHaveTextContent('/tareas');

    // Sin formulario con cambios, el menú navega directo.
    await userEvent.click(screen.getByRole('link', { name: 'Mi día' }));
    expect(ruta).toHaveTextContent('/mi-dia');
    await userEvent.click(screen.getByRole('link', { name: 'Mis tareas' }));
    expect(ruta).toHaveTextContent('/tareas');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«Saltar al contenido» es solo para Tab: las flechas no lo alcanzan (A-06, ADR-0021)', async () => {
    function Keys() {
      useAppKeyboard(ROUTES, () => {});
      return null;
    }
    render(
      <MemoryRouter>
        <Keys />
        <AppShell
          nav={
            <AppNav
              items={[
                { to: '/mi-dia', label: 'Mi día', icon: Sun },
                { to: '/tareas', label: 'Mis tareas', icon: ListChecks },
              ]}
            />
          }
        >
          <button>Algo</button>
        </AppShell>
      </MemoryRouter>,
    );
    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    // ↑ desde el primer ítem del menú no cae en el enlace.
    screen.getByRole('link', { name: 'Mi día' }).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(skip).not.toHaveFocus();
    // Tab desde el principio sigue llegando primero al enlace.
    (document.activeElement as HTMLElement | null)?.blur();
    await userEvent.tab();
    expect(skip).toHaveFocus();
  });

  it('con campos obligatorios, Enter no pasa por los opcionales: envía cuando los obligatorios están llenos (F-14)', async () => {
    const onSubmit = vi.fn();
    function Keys() {
      useAppKeyboard(ROUTES, () => {});
      return null;
    }
    render(
      <MemoryRouter>
        <Keys />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <input aria-label="Título" required />
          <input aria-label="Etiquetas" />
          <button type="submit">Crear</button>
        </form>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText('Título'), 'Diseñar portada{Enter}');
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Etiquetas')).not.toHaveFocus();
  });

  it('con el foco en el contenido y una pantalla larga, ↓ desplaza en lugar de saltar al primer elemento (F-14)', async () => {
    function Keys() {
      useAppKeyboard(ROUTES, () => {});
      return null;
    }
    render(
      <MemoryRouter>
        <Keys />
        <main id="contenido" tabIndex={-1}>
          <button>Primero</button>
        </main>
      </MemoryRouter>,
    );
    const main = screen.getByRole('main');
    Object.defineProperty(main, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(main, 'clientHeight', { value: 500, configurable: true });
    main.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(main).toHaveFocus();
    // Si no hay nada que desplazar, la flecha sigue llevando al primer elemento.
    Object.defineProperty(main, 'scrollHeight', { value: 500, configurable: true });
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Primero' })).toHaveFocus();
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
