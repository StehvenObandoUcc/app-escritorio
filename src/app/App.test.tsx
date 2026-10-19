import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('puerta de entrada', () => {
  it('sin sesión solo se ve el acceso; al entrar aparece la app, y al cerrar sesión vuelve el acceso', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();

    // Registro con la nube simulada (en pruebas no hay .env de Supabase).
    await userEvent.click(screen.getByRole('radio', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(nav).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument();

    // F-13: el botón «Atajos» del menú abre la ayuda de teclado.
    await userEvent.click(within(nav).getByRole('button', { name: 'Atajos' }));
    const help = await screen.findByRole('dialog', { name: 'Atajos de teclado' });
    await userEvent.click(within(help).getByRole('button', { name: 'Entendido' }));

    // Cerrar sesión solo está dentro de la app, en Ajustes; Mi privacidad enlaza a «Qué se mide y quién lo ve».
    await userEvent.click(screen.getByRole('link', { name: 'Ajustes' }));
    expect(await screen.findByRole('link', { name: 'Qué se mide y quién lo ve' })).toHaveAttribute('href', '#/equipo/privacidad');
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  }, 30_000);
});
