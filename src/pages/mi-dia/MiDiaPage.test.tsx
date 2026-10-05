import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { MiDiaPage } from './MiDiaPage';

const DATE = '2026-10-01';

describe('Mi día', () => {
  it('muestra el resumen, la franja y la lista del día', async () => {
    render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);

    expect(await screen.findByText(/Jornada de 08:12 a 16:31/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Jornada de 08:12/ })).toBeInTheDocument();
    expect(screen.getByText('Datos de ejemplo')).toBeInTheDocument();

    const list = screen.getByRole('list', { name: 'Bloques de actividad' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(11);
  });

  it('inicia y detiene el temporizador', async () => {
    render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar temporizador' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Detener temporizador' }));
    expect(await screen.findByRole('button', { name: 'Iniciar temporizador' })).toBeInTheDocument();
  });

  it('la pausa de privacidad avisa de que no se registra nada', async () => {
    render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar 15 min' }));
    expect(await screen.findByText(/no se registra nada/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reanudar seguimiento' })).toBeInTheDocument();
  });

  it('si el sensor falla, explica qué pasó', async () => {
    const broken: Bridge = {
      ...createMockBridge(),
      dayView: () => Promise.reject(new Error('sensor no disponible')),
    };
    render(<MiDiaPage bridge={broken} date={DATE} />);
    expect(await screen.findByText('No se pudo leer tu actividad')).toBeInTheDocument();
    expect(screen.getByText(/sensor no disponible/)).toBeInTheDocument();
  });
});
