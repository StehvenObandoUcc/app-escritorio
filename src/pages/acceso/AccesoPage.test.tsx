import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockCloud, MOCK_CODE } from '@/cloud/mock';
import { AccesoPage } from './AccesoPage';

const ruta = () => screen.getByTestId('ruta').textContent;
/** Flujos con mucho tecleo simulado: con todas las pruebas en paralelo superan los 5 s por defecto. */
const LONG = 20_000;

describe('Acceso (CU-01 a CU-03)', () => {
  it('registra una cuenta, pide el código de 6 dígitos y entra (AC-1)', async () => {
    const { cloud } = renderWithSession(<AccesoPage />, { path: '/acceso' });
    await userEvent.click(await screen.findByRole('button', { name: 'Crear una cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Caro Díaz');
    await userEvent.type(screen.getByLabelText('Correo'), 'caro@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Verifica tu correo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('caro@pulso.test');

    // Un código incorrecto dice qué hacer.
    await userEvent.type(screen.getByLabelText('Código'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar correo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Pide uno nuevo');

    await userEvent.clear(screen.getByLabelText('Código'));
    await userEvent.type(screen.getByLabelText('Código'), MOCK_CODE);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar correo' }));
    await waitFor(() => expect(ruta()).toBe('/equipo'));
    expect((await cloud.currentUser())?.email).toBe('caro@pulso.test');
  }, LONG);

  it('valida el formulario antes de enviar y explica cada problema', async () => {
    renderWithSession(<AccesoPage />, { path: '/acceso' });
    await userEvent.click(await screen.findByRole('button', { name: 'Crear una cuenta' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Escribe tu nombre');
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Caro');
    await userEvent.type(screen.getByLabelText('Correo'), 'no-es-correo');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('correo válido');
    await userEvent.clear(screen.getByLabelText('Correo'));
    await userEvent.type(screen.getByLabelText('Correo'), 'caro@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('al menos 8');
  }, LONG);

  it('inicia sesión y, con la contraseña equivocada, dice qué revisar (AC-2)', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    renderWithSession(<AccesoPage />, { path: '/acceso', cloud });
    await userEvent.type(await screen.findByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'otra-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden');
    await userEvent.clear(screen.getByLabelText('Contraseña'));
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(ruta()).toBe('/equipo'));
  });

  it('con el correo sin verificar, pasa a escribir el código', async () => {
    const cloud = createMockCloud();
    await cloud.signUp('beto@pulso.test', 'secreto-123', 'Beto');
    renderWithSession(<AccesoPage />, { path: '/acceso', cloud });
    await userEvent.type(await screen.findByLabelText('Correo'), 'beto@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Verifica tu correo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('código nuevo');
  });

  it('recupera la contraseña con un código y entra con la nueva (AC-3)', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'vieja-clave-1', 'Ana');
    renderWithSession(<AccesoPage />, { path: '/acceso', cloud });
    await userEvent.click(await screen.findByRole('button', { name: 'Olvidé mi contraseña' }));
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código'), MOCK_CODE);
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'nueva-clave-2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() => expect(ruta()).toBe('/equipo'));
    await cloud.signOut();
    await expect(cloud.signIn('ana@pulso.test', 'nueva-clave-2')).resolves.toBeUndefined();
  }, LONG);

  it('con sesión iniciada muestra la cuenta y permite cerrar sesión', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    renderWithSession(<AccesoPage />, { path: '/acceso', cloud });
    expect(await screen.findByRole('heading', { name: 'Tu cuenta' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(await cloud.currentUser()).toBeNull();
  });
});
