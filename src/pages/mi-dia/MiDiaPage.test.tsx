import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { MiDiaPage } from './MiDiaPage';
import { REFRESH_MS } from './useDay';

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

  it('con el sensor real desaparece la etiqueta «Datos de ejemplo» (AC-16)', async () => {
    const real: Bridge = { ...createMockBridge(), source: 'tauri' };
    render(<MiDiaPage bridge={real} date={DATE} />);
    expect(await screen.findByText(/Jornada de 08:12/)).toBeInTheDocument();
    expect(screen.queryByText('Datos de ejemplo')).not.toBeInTheDocument();
  });

  describe('registro de tiempo', () => {
    const fill = (label: string, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });

    it('añade una entrada manual y la lista', async () => {
      render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
      expect(await screen.findByText('Sin entradas de tiempo')).toBeInTheDocument();
      fill('Inicio', '09:00');
      fill('Fin', '10:30');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar entrada' }));
      const list = await screen.findByRole('list', { name: 'Entradas de tiempo' });
      expect(within(list).getByText('09:00–10:30')).toBeInTheDocument();
      expect(within(list).getByText('Manual')).toBeInTheDocument();
    });

    it('explica el error si el fin es anterior al inicio', async () => {
      render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
      await screen.findByText('Sin entradas de tiempo');
      fill('Inicio', '10:00');
      fill('Fin', '09:00');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar entrada' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('El fin debe ser posterior al inicio.');
    });

    it('pide completar los campos antes de guardar', async () => {
      render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
      await screen.findByText('Sin entradas de tiempo');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar entrada' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Completa el día, el inicio y el fin.',
      );
    });

    it('edita una entrada', async () => {
      render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
      await screen.findByText('Sin entradas de tiempo');
      fill('Inicio', '09:00');
      fill('Fin', '10:00');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar entrada' }));
      await userEvent.click(
        await screen.findByRole('button', { name: /Editar entrada de 09:00–10:00/ }),
      );
      const list = screen.getByRole('list', { name: 'Entradas de tiempo' });
      fireEvent.change(within(list).getByLabelText('Fin'), { target: { value: '11:15' } });
      await userEvent.click(within(list).getByRole('button', { name: 'Guardar cambios' }));
      expect(await within(list).findByText('09:00–11:15')).toBeInTheDocument();
    });

    it('elimina una entrada tras confirmar', async () => {
      render(<MiDiaPage bridge={createMockBridge()} date={DATE} />);
      await screen.findByText('Sin entradas de tiempo');
      fill('Inicio', '09:00');
      fill('Fin', '10:00');
      await userEvent.click(screen.getByRole('button', { name: 'Guardar entrada' }));
      await userEvent.click(
        await screen.findByRole('button', { name: /Eliminar entrada de 09:00–10:00/ }),
      );
      expect(screen.getByText('¿Eliminar esta entrada?')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }));
      expect(await screen.findByText('Sin entradas de tiempo')).toBeInTheDocument();
    });

    it('el temporizador aparece como entrada «en curso» sin acciones', async () => {
      render(<MiDiaPage bridge={createMockBridge()} />);
      await userEvent.click(await screen.findByRole('button', { name: 'Iniciar temporizador' }));
      expect(await screen.findByText(/en curso/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Editar entrada/ })).not.toBeInTheDocument();
    });
  });

  describe('actualización automática (AC-17)', () => {
    afterEach(() => vi.useRealTimers());

    it('vuelve a leer el día cada 30 s mientras la ventana está visible', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const base = createMockBridge();
      const dayView = vi.fn(base.dayView);
      render(<MiDiaPage bridge={{ ...base, dayView }} date={DATE} />);
      await screen.findByText(/Jornada de 08:12/);
      expect(dayView).toHaveBeenCalledTimes(1);
      await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS + 100));
      expect(dayView).toHaveBeenCalledTimes(2);
      await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS));
      expect(dayView).toHaveBeenCalledTimes(3);
    });

    it('no actualiza mientras la ventana está oculta', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const base = createMockBridge();
      const dayView = vi.fn(base.dayView);
      render(<MiDiaPage bridge={{ ...base, dayView }} date={DATE} />);
      await screen.findByText(/Jornada de 08:12/);
      const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
      await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS * 2));
      expect(dayView).toHaveBeenCalledTimes(1);
      hidden.mockRestore();
    });

    it('un fallo al actualizar no borra lo que ya se mostraba', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const base = createMockBridge();
      let fail = false;
      const dayView = vi.fn((d: string) =>
        fail ? Promise.reject(new Error('sin respuesta')) : base.dayView(d),
      );
      render(<MiDiaPage bridge={{ ...base, dayView }} date={DATE} />);
      await screen.findByText(/Jornada de 08:12/);
      fail = true;
      await act(() => vi.advanceTimersByTimeAsync(REFRESH_MS + 100));
      expect(screen.getByText(/Jornada de 08:12/)).toBeInTheDocument();
      expect(screen.queryByText('No se pudo leer tu actividad')).not.toBeInTheDocument();
    });
  });
});
