import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { MOCK_CODE } from '@/cloud/mock';
import { App } from './App';

describe('puerta de entrada', () => {
  it('sin sesión solo se ve el acceso; al entrar aparece la app, y al cerrar sesión vuelve el acceso', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();

    // Registro con la nube simulada (en pruebas no hay .env de Supabase).
    await userEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Ana');
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await userEvent.type(await screen.findByLabelText('Código'), MOCK_CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar correo' }));

    const nav = await screen.findByRole('navigation', { name: 'Principal' });
    expect(nav).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument();

    // Cerrar sesión solo está dentro de la app, en Ajustes.
    await userEvent.click(screen.getByRole('link', { name: 'Ajustes' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Principal' })).not.toBeInTheDocument();
  }, 30_000);
});
