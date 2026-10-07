import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { CloudError } from '@/cloud/contract';
import { createMockCloud, MOCK_CODE } from '@/cloud/mock';
import { toCloudError } from '@/cloud/supabase';
import { AccesoPage } from './AccesoPage';

const ruta = () => screen.getByTestId('ruta').textContent;
/** Flujos con mucho tecleo simulado: con todas las pruebas en paralelo superan los 5 s por defecto. */
const LONG = 20_000;

describe('Acceso (CU-01 a CU-03)', () => {
  it('registra una cuenta y entra al instante, sin esperar un correo (AC-1, ADR-0008)', async () => {
    const { cloud } = renderWithSession(<AccesoPage />, { path: '/' });
    await userEvent.click(await screen.findByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Caro Díaz');
    await userEvent.type(screen.getByLabelText('Correo'), 'caro@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(ruta()).toBe('/equipo'));
    expect((await cloud.currentUser())?.email).toBe('caro@pulso.test');
  }, LONG);

  it('si Supabase aún exige confirmar el correo, pide el código y entra al verificarlo', async () => {
    const { cloud } = renderWithSession(<AccesoPage />, { path: '/', cloud: createMockCloud(undefined, { confirmEmail: true }) });
    await userEvent.click(await screen.findByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Caro Díaz');
    await userEvent.type(screen.getByLabelText('Correo'), 'caro@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
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
    renderWithSession(<AccesoPage />);
    await userEvent.click(await screen.findByRole('tab', { name: 'Crear cuenta' }));
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

  it('si el servidor no responde al registrarse, explica qué pasó y qué hacer (HTTP 504)', async () => {
    const cloud = createMockCloud();
    cloud.signUp = async () => {
      throw toCloudError({ message: 'HTTP 504', status: 504 });
    };
    renderWithSession(<AccesoPage />, { cloud });
    await userEvent.click(await screen.findByRole('tab', { name: 'Crear cuenta' }));
    await userEvent.type(screen.getByLabelText('Nombre visible'), 'Caro');
    await userEvent.type(screen.getByLabelText('Correo'), 'caro@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos crear la cuenta');
    expect(alert).toHaveTextContent('error 504');
    expect(alert).not.toHaveTextContent(/^HTTP 504$/);
  }, LONG);

  it('inicia sesión y, con la contraseña equivocada, dice qué revisar (AC-2)', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    renderWithSession(<AccesoPage />, { cloud });
    expect(await screen.findByRole('heading', { name: 'Hola de nuevo' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'otra-clave');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no coinciden');
    await userEvent.clear(screen.getByLabelText('Contraseña'));
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    await waitFor(() => expect(ruta()).toBe('/mi-dia'));
  }, LONG);

  it('el botón del ojo muestra y oculta la contraseña', async () => {
    renderWithSession(<AccesoPage />);
    const field = await screen.findByLabelText('Contraseña');
    expect(field).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(field).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }));
    expect(field).toHaveAttribute('type', 'password');
  });

  it('con el correo sin verificar (proyecto que exige confirmarlo), pasa a escribir el código', async () => {
    const cloud = createMockCloud(undefined, { confirmEmail: true });
    await cloud.signUp('beto@pulso.test', 'secreto-123', 'Beto');
    renderWithSession(<AccesoPage />, { cloud });
    await userEvent.type(await screen.findByLabelText('Correo'), 'beto@pulso.test');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto-123');
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('código nuevo');
  }, LONG);

  it('recupera la contraseña con un código y entra con la nueva (AC-3)', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'vieja-clave-1', 'Ana');
    renderWithSession(<AccesoPage />, { cloud });
    await userEvent.click(await screen.findByRole('button', { name: 'Olvidé mi contraseña' }));
    await userEvent.type(screen.getByLabelText('Correo'), 'ana@pulso.test');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar código' }));
    await userEvent.type(await screen.findByLabelText('Código'), MOCK_CODE);
    await userEvent.type(screen.getByLabelText('Contraseña nueva'), 'nueva-clave-2');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));
    await waitFor(() => expect(ruta()).toBe('/mi-dia'));
    await cloud.signOut();
    await expect(cloud.signIn('ana@pulso.test', 'nueva-clave-2')).resolves.toBeUndefined();
  }, LONG);
});

describe('errores del servidor', () => {
  it('un 5xx de Supabase se explica en vez de mostrar «HTTP 504»', () => {
    const err = toCloudError({ message: 'HTTP 504', status: 504 });
    expect(err).toBeInstanceOf(CloudError);
    expect(err.kind).toBe('network');
    expect(err.message).toMatch(/no respondió a tiempo \(error 504\)/);
  });
});
