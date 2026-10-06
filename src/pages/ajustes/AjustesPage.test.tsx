import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { AjustesPage } from './AjustesPage';

describe('Ajustes', () => {
  it('muestra los valores actuales', async () => {
    render(<AjustesPage bridge={createMockBridge()} />);
    expect(await screen.findByLabelText('Minutos de inactividad')).toHaveValue(5);
    expect(screen.getByLabelText('Apps ocultas')).toHaveValue('');
    expect(screen.getByText('Datos de ejemplo')).toBeInTheDocument();
  });

  it('guarda el umbral y las apps ocultas, y las normaliza', async () => {
    const bridge = createMockBridge();
    render(<AjustesPage bridge={bridge} />);
    const minutes = await screen.findByLabelText('Minutos de inactividad');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '10');
    await userEvent.type(screen.getByLabelText('Apps ocultas'), ' KeePass, WhatsApp ,keepass');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados.')).toBeInTheDocument();
    expect(screen.getByLabelText('Apps ocultas')).toHaveValue('keepass, whatsapp');
    expect(await bridge.settingsGet()).toEqual({ idleMinutes: 10, hiddenApps: ['keepass', 'whatsapp'] });
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
