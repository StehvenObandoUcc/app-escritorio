import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimerControl, type TimerControlProps } from './TimerControl';

const base = (over: Partial<TimerControlProps> = {}): TimerControlProps => ({
  running: false,
  elapsedSeconds: 0,
  state: 'tracking',
  onStart: vi.fn(),
  onStop: vi.fn(),
  onBreakToggle: vi.fn(),
  onPauseToggle: vi.fn(),
  ...over,
});

describe('TimerControl: pausa', () => {
  it('sin props nuevas dice «Pausar 15 min» y funciona', async () => {
    const props = base();
    render(<TimerControl {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Pausar 15 min' }));
    expect(props.onPauseToggle).toHaveBeenCalledOnce();
  });

  it('con pauseMinutes dice los minutos', () => {
    render(<TimerControl {...base({ pauseMinutes: 10 })} />);
    expect(screen.getByRole('button', { name: 'Pausar 10 min' })).toBeEnabled();
  });

  it('con motivo, la pausa se desactiva y el motivo la describe', () => {
    render(<TimerControl {...base({ pauseMinutes: 0, pauseDisabledReason: 'Ya usaste el tope.' })} />);
    const button = screen.getByRole('button', { name: 'Pausar 15 min' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription('Ya usaste el tope.');
    expect(screen.getByRole('button', { name: 'Iniciar temporizador' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Tomar un descanso' })).toBeEnabled();
  });

  it('con pauseDisabled la pausa se desactiva sin motivo visible', () => {
    render(<TimerControl {...base({ pauseDisabled: true })} />);
    const button = screen.getByRole('button', { name: 'Pausar 15 min' });
    expect(button).toBeDisabled();
    expect(button).not.toHaveAttribute('aria-describedby');
  });

  it('en pausa, Reanudar siempre está activo aunque haya motivo', () => {
    render(<TimerControl {...base({ state: 'paused', pauseDisabledReason: 'Ya usaste el tope.' })} />);
    expect(screen.getByRole('button', { name: 'Reanudar seguimiento' })).toBeEnabled();
    expect(screen.queryByText('Ya usaste el tope.')).not.toBeInTheDocument();
  });
});
