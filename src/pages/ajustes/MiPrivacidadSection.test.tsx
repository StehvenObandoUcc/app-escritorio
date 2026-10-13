import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '@/i18n';
import { renderWithSession } from '@/app/testing';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { createMockCloud } from '@/cloud/mock';
import { MiPrivacidadSection } from './MiPrivacidadSection';

async function signedIn(role: 'owner' | 'viewer' = 'owner') {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  if (role === 'viewer') {
    const vera = cloud.debug.addAccount('vera@pulso.test', 'secreto-123', 'Vera');
    cloud.debug.addMember(team, vera, 'viewer', true);
    await cloud.signIn('vera@pulso.test', 'secreto-123');
  } else {
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
  }
  return { cloud, team };
}

describe('Ajustes: Mi privacidad', () => {
  afterEach(() => setLocale('es'));

  it('apagar el interruptor pide confirmar y llama a setShareAppNames (AC-24)', async () => {
    const { cloud, team } = await signedIn();
    const spy = vi.spyOn(cloud, 'setShareAppNames');
    renderWithSession(<MiPrivacidadSection bridge={createMockBridge()} />, { cloud });
    const toggle = await screen.findByRole('switch', { name: /Compartir los nombres de mis apps/ });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);
    expect(screen.getByText(/Tu equipo verá solo categorías\. Los nombres que ya subiste en este equipo se ocultan y lo nuevo se sube sin nombre ni sitio\./)).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Sí, dejar de compartir' }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith(team, false));
    await waitFor(() => expect(screen.getByRole('switch', { name: /Compartir los nombres/ })).not.toBeChecked());
    // Volver a encenderlo no pide confirmación.
    await userEvent.click(screen.getByRole('switch', { name: /Compartir los nombres/ }));
    await waitFor(() => expect(spy).toHaveBeenLastCalledWith(team, true));
  });

  it('cancelar la confirmación no cambia nada', async () => {
    const { cloud } = await signedIn();
    const spy = vi.spyOn(cloud, 'setShareAppNames');
    renderWithSession(<MiPrivacidadSection bridge={createMockBridge()} />, { cloud });
    await userEvent.click(await screen.findByRole('switch', { name: /Compartir los nombres/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(spy).not.toHaveBeenCalled();
    expect(screen.getByRole('switch', { name: /Compartir los nombres/ })).toBeChecked();
  });

  it('el observador no ve el interruptor, pero sí exportar', async () => {
    const { cloud } = await signedIn('viewer');
    renderWithSession(<MiPrivacidadSection bridge={createMockBridge()} />, { cloud });
    expect(await screen.findByRole('button', { name: 'Exportar mis datos' })).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('exportar llama a exportMyData y muestra la ruta (AC-25)', async () => {
    const bridge: Bridge = { ...createMockBridge(), exportMyData: vi.fn(async () => 'C:\\Users\\demo\\Downloads\\pulso-mis-datos-2026-10-05.json') };
    renderWithSession(<MiPrivacidadSection bridge={bridge} />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar mis datos' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Guardado en C:\\Users\\demo\\Downloads\\pulso-mis-datos-2026-10-05.json');
    expect(bridge.exportMyData).toHaveBeenCalledOnce();
  });

  it('si exportar falla, muestra el error', async () => {
    const bridge: Bridge = { ...createMockBridge(), exportMyData: () => Promise.reject(new Error('Inicia sesión para exportar tus datos.')) };
    renderWithSession(<MiPrivacidadSection bridge={bridge} />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Exportar mis datos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Inicia sesión para exportar tus datos.');
  });

  it('el error de exportar se traduce al inglés', async () => {
    setLocale('en');
    const bridge: Bridge = { ...createMockBridge(), exportMyData: () => Promise.reject(new Error('Inicia sesión para exportar tus datos.')) };
    renderWithSession(<MiPrivacidadSection bridge={bridge} />, { bridge });
    await userEvent.click(screen.getByRole('button', { name: 'Export my data' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign in to export your data.');
  });

  it('el interruptor se describe con su explicación', async () => {
    const { cloud } = await signedIn();
    renderWithSession(<MiPrivacidadSection bridge={createMockBridge()} />, { cloud });
    const toggle = await screen.findByRole('switch', { name: /Compartir los nombres/ });
    expect(toggle).toHaveAccessibleDescription(/tu equipo ve solo categorías/i);
  });

  it('apagar corta el envío de nombres al instante y la nube fallida lo revierte', async () => {
    const { cloud } = await signedIn();
    vi.spyOn(cloud, 'setShareAppNames').mockRejectedValue(new Error('Sin conexión'));
    const { engine } = renderWithSession(<MiPrivacidadSection bridge={createMockBridge()} />, { cloud });
    const apply = vi.spyOn(engine, 'setShareAppNames');
    await userEvent.click(await screen.findByRole('switch', { name: /Compartir los nombres/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Sí, dejar de compartir' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith(false));
    await waitFor(() => expect(apply).toHaveBeenLastCalledWith(true));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Compartir los nombres/ })).toBeChecked();
  });
});
