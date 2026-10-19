import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChartColumn, FolderKanban, LayoutDashboard, ListChecks, Settings, Sun, Users } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router';
import { AppNav, type NavItem } from './AppNav';

const ITEMS: NavItem[] = [
  { to: '/mi-dia', label: 'Mi día', icon: Sun },
  { to: '/tareas', label: 'Mis tareas', icon: ListChecks },
  { to: '/proyectos', label: 'Proyectos', icon: FolderKanban },
  { to: '/equipo', label: 'Equipo', icon: Users },
  { to: '/tablero', label: 'Tablero', icon: LayoutDashboard },
  { to: '/reportes', label: 'Reportes', icon: ChartColumn },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

function Where() {
  return <p data-testid="ruta">{useLocation().pathname}</p>;
}

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav items={ITEMS} />
      <Where />
    </MemoryRouter>,
  );

describe('menú: «Más» por debajo de 640 px (F-19)', () => {
  it('los 4 primeros van en la barra y el resto en «Más»; los 7 siguen en el menú desde 640 px', () => {
    renderAt('/mi-dia');
    const items = within(screen.getByRole('navigation')).getAllByRole('listitem');
    // 7 secciones + «Más». Las 3 últimas se ocultan bajo 640 px (`hidden md:block`) y «Más» desde 640 px (`md:hidden`).
    expect(items).toHaveLength(8);
    expect(items.slice(4, 7).every((li) => li.classList.contains('hidden') && li.classList.contains('md:block'))).toBe(true);
    expect(items[7]).toHaveClass('md:hidden');
    expect(screen.getByRole('button', { name: 'Más' })).toHaveAttribute('data-active', 'false');
  });

  it('se marca activo en Tablero, Reportes o Ajustes, y lo dice al lector de pantalla', () => {
    renderAt('/reportes');
    const more = screen.getByRole('button', { name: /Más/ });
    expect(more).toHaveAttribute('data-active', 'true');
    expect(more).toHaveAccessibleName('Más (estás en Reportes)');
  });

  it('se abre con teclado, Esc la cierra y devuelve el foco, y elegir una sección navega y la cierra', async () => {
    renderAt('/mi-dia');
    const more = screen.getByRole('button', { name: 'Más' });
    more.focus();
    await userEvent.keyboard('{Enter}');
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Más' });
    expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Tablero', 'Reportes', 'Ajustes']);

    within(list).getByRole('link', { name: 'Reportes' }).focus();
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('list', { name: 'Más' })).not.toBeInTheDocument();
    expect(more).toHaveFocus();
    expect(more).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(more);
    await userEvent.click(within(screen.getByRole('list', { name: 'Más' })).getByRole('link', { name: 'Ajustes' }));
    expect(screen.getByTestId('ruta')).toHaveTextContent('/ajustes');
    expect(screen.queryByRole('list', { name: 'Más' })).not.toBeInTheDocument();
  });
});
