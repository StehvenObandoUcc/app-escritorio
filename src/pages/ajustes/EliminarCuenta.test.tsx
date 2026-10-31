import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { renderWithSession } from '@/app/testing';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { EliminarCuentaSection } from './EliminarCuentaSection';

/** CU-08, spec F7 (AC-6): eliminar mi cuenta desde Ajustes. */
async function setup({ withOthers = false } = {}) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  if (withOthers) cloud.debug.addMember(team, cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto'), 'member', true);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  const base = createMockBridge();
  const bridge: Bridge = { ...base, localDataClear: vi.fn(base.localDataClear), aiConfigClear: vi.fn(base.aiConfigClear) };
  renderWithSession(<EliminarCuentaSection bridge={bridge} />, { cloud, bridge });
  await userEvent.click(await screen.findByRole('button', { name: 'Eliminar mi cuenta' }));
  const dialog = screen.getByRole('dialog');
  const confirm = () => [...dialog.querySelectorAll('button')].find((b) => b.textContent === 'Eliminar mi cuenta')!;
  return { cloud, bridge, dialog, confirm };
}

describe('Ajustes: eliminar mi cuenta', () => {
  afterEach(() => setLocale('es'));

  it('no deja confirmar hasta escribir el correo de la cuenta', async () => {
    const { confirm } = await setup();
    expect(confirm()).toBeDisabled();
    const input = screen.getByLabelText('Escribe tu correo (ana@pulso.test) para confirmar');
    await userEvent.type(input, 'otra@pulso.test');
    expect(confirm()).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'ANA@pulso.test');
    expect(confirm()).toBeEnabled();
  });

  it('al confirmar borra lo local, cierra la sesión y la cuenta ya no entra', async () => {
    const { cloud, bridge, confirm } = await setup();
    await userEvent.type(screen.getByLabelText(/Escribe tu correo/), 'ana@pulso.test');
    await userEvent.click(confirm());
    await waitFor(() => expect(bridge.localDataClear).toHaveBeenCalledOnce());
    expect(bridge.aiConfigClear).toHaveBeenCalledOnce();
    await waitFor(async () => expect(await cloud.currentUser()).toBeNull());
    await expect(cloud.signIn('ana@pulso.test', 'secreto-123')).rejects.toThrow();
  });

  it('si es la única propietaria de un equipo con más personas, lo dice y no borra nada local', async () => {
    const { cloud, bridge, dialog, confirm } = await setup({ withOthers: true });
    await userEvent.type(screen.getByLabelText(/Escribe tu correo/), 'ana@pulso.test');
    await userEvent.click(confirm());
    expect(await screen.findByRole('alert')).toHaveTextContent('Antes de eliminar tu cuenta, pasa la propiedad de «Equipo A» a otra persona');
    expect(dialog).toContainElement(screen.getByRole('alert'));
    expect(bridge.localDataClear).not.toHaveBeenCalled();
    expect(await cloud.currentUser()).not.toBeNull();
  });

  it('ofrece exportar los datos antes', async () => {
    const { bridge } = await setup();
    const spy = vi.spyOn(bridge, 'exportMyData').mockResolvedValue('C:\\Users\\demo\\Downloads\\pulso-mis-datos.json');
    await userEvent.click(screen.getByRole('button', { name: 'Exportar mis datos antes' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado en C:\\Users\\demo\\Downloads\\pulso-mis-datos.json');
    expect(spy).toHaveBeenCalledOnce();
  });
});
