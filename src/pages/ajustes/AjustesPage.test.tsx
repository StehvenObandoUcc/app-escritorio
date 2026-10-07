import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { AjustesPage } from './AjustesPage';

describe('Ajustes', () => {
  it('muestra los valores actuales', async () => {
    render(<AjustesPage bridge={createMockBridge()} />);
    expect(await screen.findByLabelText('Minutos de inactividad')).toHaveValue(5);
    // Las apps usadas hace poco aparecen para marcarlas, sin escribir su nombre de proceso.
    expect(await screen.findByRole('checkbox', { name: /Google Chrome/ })).not.toBeChecked();
    expect(screen.getByText('Datos de ejemplo')).toBeInTheDocument();
  });

  it('guarda el umbral y las apps ocultas, y las normaliza', async () => {
    const bridge = createMockBridge();
    render(<AjustesPage bridge={bridge} />);
    const minutes = await screen.findByLabelText('Minutos de inactividad');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '10');
    await userEvent.click(await screen.findByRole('checkbox', { name: /Slack/ }));
    await userEvent.type(screen.getByLabelText('Añadir otra app'), ' KeePass ');
    await userEvent.click(screen.getByRole('button', { name: 'Añadir' }));
    // Añadir dos veces la misma no la duplica.
    await userEvent.type(screen.getByLabelText('Añadir otra app'), 'keepass{Enter}');
    // KeePass está instalado: sale con su nombre real del registro y queda marcada.
    expect(screen.getByRole('checkbox', { name: /KeePass/ })).toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(await bridge.settingsGet()).toEqual({ idleMinutes: 10, hiddenApps: ['slack', 'keepass'], language: 'es' });
    // Desmarcar deja de ocultarla.
    await userEvent.click(screen.getByRole('checkbox', { name: /Slack/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(async () => expect((await bridge.settingsGet()).hiddenApps).toEqual(['keepass']));
  });

  it.each(['2', '16', '', '5.5'])('rechaza %j como umbral y dice qué corregir', async (value) => {
    render(<AjustesPage bridge={createMockBridge()} />);
    const minutes = await screen.findByLabelText('Minutos de inactividad');
    await userEvent.clear(minutes);
    if (value) await userEvent.type(minutes, value);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('entre 3 y 15');
  });

  it('muestra el error del núcleo si guardar falla', async () => {
    const bridge: Bridge = {
      ...createMockBridge(),
      settingsSet: () => Promise.reject(new Error('disco lleno')),
    };
    render(<AjustesPage bridge={bridge} />);
    await screen.findByLabelText('Minutos de inactividad');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('disco lleno');
  });

  it('muestra apps abiertas e instaladas y el buscador filtra (ADR-0010)', async () => {
    render(<AjustesPage bridge={createMockBridge()} />);
    expect(await screen.findByRole('list', { name: 'Abiertas ahora' })).toHaveTextContent('WhatsApp');
    expect(screen.getByRole('list', { name: 'Instaladas' })).toHaveTextContent('Spotify');
    await userEvent.type(screen.getByLabelText('Buscar app'), 'spot');
    expect(screen.getByRole('checkbox', { name: /Spotify/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /WhatsApp/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('checkbox', { name: /Spotify/ }));
    await userEvent.clear(screen.getByLabelText('Buscar app'));
    // Lo marcado pasa a «Ocultas ahora», arriba.
    expect(screen.getByRole('list', { name: 'Ocultas ahora' })).toHaveTextContent('Spotify');
  });

  it('avisa si Windows tiene las notificaciones apagadas (ADR-0011)', async () => {
    const off: Bridge = { ...createMockBridge(), notificationsStatus: async () => ({ windowsToastsEnabled: false }) };
    render(<AjustesPage bridge={off} />);
    expect(await screen.findByText(/notificaciones de Windows están apagadas/)).toBeInTheDocument();
    render(<AjustesPage bridge={createMockBridge()} />);
    expect(screen.getAllByText(/notificaciones de Windows están apagadas/)).toHaveLength(1);
  });

  it('si no puede leer los ajustes, lo explica', async () => {
    const bridge: Bridge = {
      ...createMockBridge(),
      settingsGet: () => Promise.reject(new Error('sin núcleo')),
    };
    render(<AjustesPage bridge={bridge} />);
    expect(await screen.findByText('No se pudieron leer los ajustes')).toBeInTheDocument();
    expect(screen.getByText(/sin núcleo/)).toBeInTheDocument();
  });
});
