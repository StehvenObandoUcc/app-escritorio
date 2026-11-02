import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { renderWithSession } from './testing';

describe('equipo activo y política en Rust', () => {
  it('la política del equipo se envía cuando Rust ya tiene el equipo activo (si no, Rust la reinicia)', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    cloud.debug.addTeam('Equipo A', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    const bridge = createMockBridge();
    const order: string[] = [];
    let release!: () => void;
    vi.spyOn(bridge, 'activeTeamSet').mockImplementation(
      () =>
        new Promise<void>((r) => {
          release = () => {
            order.push('activeTeamSet');
            r();
          };
        }),
    );
    vi.spyOn(bridge, 'teamPolicySet').mockImplementation(async () => void order.push('teamPolicySet'));
    renderWithSession(<p>pantalla</p>, { cloud, bridge });
    await screen.findByText('pantalla');
    await waitFor(() => expect(bridge.activeTeamSet).toHaveBeenCalledWith(null, expect.any(String)));
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual([]);

    release();
    await waitFor(() => expect(order).toEqual(['activeTeamSet', 'teamPolicySet']));
  });
});
