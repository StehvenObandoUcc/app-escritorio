import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { localDate } from '@/lib/time';
import { MiDiaPage } from './MiDiaPage';

const DATE = '2026-10-01';

describe('Mi día: acciones del temporizador', () => {
  it('si una acción falla, el día sigue a la vista y el error se dice junto al temporizador', async () => {
    const bridge = createMockBridge();
    vi.spyOn(bridge, 'timerStart').mockRejectedValueOnce(new Error('El sensor no responde'));
    render(<MiDiaPage bridge={bridge} date={DATE} />);
    await screen.findByText(/Jornada de 08:12/);

    await userEvent.click(screen.getByRole('button', { name: 'Iniciar temporizador' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El sensor no responde');
    expect(screen.getByText(/Jornada de 08:12/)).toBeInTheDocument();
    expect(screen.queryByText('No se pudo leer tu actividad')).not.toBeInTheDocument();

    // La siguiente acción buena quita el error.
    await userEvent.click(screen.getByRole('button', { name: 'Iniciar temporizador' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('durante la pausa de privacidad no se puede tomar un descanso', async () => {
    const base = createMockBridge();
    const status = await base.sensorStatus();
    const bridge: Bridge = { ...base, sensorStatus: async () => ({ ...status, state: 'paused' }) };
    render(<MiDiaPage bridge={bridge} date={DATE} />);
    expect(await screen.findByRole('button', { name: 'Tomar un descanso' })).toBeDisabled();
  });

  it('si no se pudieron leer los equipos, no se ofrece la pausa (no se sabe el tope)', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    cloud.debug.addTeam('Equipo A', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    vi.spyOn(cloud, 'myTeams').mockRejectedValue(new Error('Sin conexión'));
    renderWithSession(<MiDiaPage bridge={createMockBridge()} date={localDate()} />, { cloud });
    const button = await screen.findByRole('button', { name: /^Pausar/ });
    await new Promise((r) => setTimeout(r, 100)); // que la lectura de equipos termine en error
    expect(button).toBeDisabled();
  });
});
