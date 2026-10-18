import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import { PageLayout } from './PageLayout';

describe('marco de la app (A-05, A-06)', () => {
  it('cada pantalla pone su nombre en el título de la ventana', () => {
    const { rerender } = render(<PageLayout title="Mi día">{null}</PageLayout>);
    expect(document.title).toBe('Mi día · Pulso');
    rerender(<PageLayout title="Ajustes">{null}</PageLayout>);
    expect(document.title).toBe('Ajustes · Pulso');
  });

  it('«Saltar al contenido» es lo primero con Tab y lleva el foco al contenido sin cambiar la ruta', async () => {
    const hash = window.location.hash;
    render(
      <AppShell nav={<nav><a href="#/mi-dia">Mi día</a></nav>}>
        <p>Contenido</p>
      </AppShell>,
    );
    await userEvent.tab();
    const skip = screen.getByRole('link', { name: 'Saltar al contenido' });
    expect(skip).toHaveFocus();
    await userEvent.click(skip);
    expect(screen.getByRole('main')).toHaveFocus();
    expect(window.location.hash).toBe(hash);
  });
});
