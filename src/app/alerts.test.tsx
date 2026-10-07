import { act, render, renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Bridge, NotAllowedAlert } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { AlertBanner } from '@/ui/organisms';
import { useNotAllowedAlerts } from './alerts';

/** Puente cuyo aviso de Rust se dispara a mano. */
function bridgeWithAlerts() {
  let emit: (alert: NotAllowedAlert) => void = () => {};
  const off = vi.fn();
  const bridge: Bridge = {
    ...createMockBridge(),
    onNotAllowedAlert: (listener) => {
      emit = listener;
      return off;
    },
  };
  return { bridge, emit: (a: NotAllowedAlert) => act(() => emit(a)), off };
}

const alert = (domain: string, at = '2026-10-07T01:21:13Z'): NotAllowedAlert => ({ domain, at });

describe('avisos de sitio no permitido dentro de la app (ADR-0012)', () => {
  it('el aviso queda hasta que se cierra y un mismo sitio no se duplica', () => {
    const { bridge, emit } = bridgeWithAlerts();
    const { result } = renderHook(() => useNotAllowedAlerts(bridge));
    emit(alert('youtube.com'));
    emit(alert('youtube.com', '2026-10-07T01:31:13Z'));
    emit(alert('netflix.com'));
    expect(result.current.alerts.map((a) => a.domain)).toEqual(['netflix.com', 'youtube.com']);
    expect(result.current.alerts[1]!.at).toBe('2026-10-07T01:31:13Z');
    act(() => result.current.dismiss('youtube.com'));
    expect(result.current.alerts.map((a) => a.domain)).toEqual(['netflix.com']);
  });

  it('muestra como mucho los 3 avisos más recientes y deja de escuchar al salir', () => {
    const { bridge, emit, off } = bridgeWithAlerts();
    const { result, unmount } = renderHook(() => useNotAllowedAlerts(bridge));
    for (const d of ['a.com', 'b.com', 'c.com', 'd.com']) emit(alert(d));
    expect(result.current.alerts.map((a) => a.domain)).toEqual(['d.com', 'c.com', 'b.com']);
    unmount();
    expect(off).toHaveBeenCalled();
  });

  it('el aviso se ve en cualquier pantalla, dice el sitio y se puede cerrar', async () => {
    const onDismiss = vi.fn();
    render(<AlertBanner alerts={[alert('youtube.com')]} onDismiss={onDismiss} />);
    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('Sitio no permitido: youtube.com');
    expect(banner).toHaveTextContent('no lo bloquea');
    await userEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(onDismiss).toHaveBeenCalledWith('youtube.com');
  });

  it('sin avisos no pinta nada', () => {
    const { container } = render(<AlertBanner alerts={[]} onDismiss={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
