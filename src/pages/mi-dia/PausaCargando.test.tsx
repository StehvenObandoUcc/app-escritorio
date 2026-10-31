import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import type { MyTeam } from '@/cloud/contract';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { localDate } from '@/lib/time';
import { MiDiaPage } from './MiDiaPage';

const TODAY = localDate();

describe('Mi día: pausa mientras cargan los equipos (F5 D-11)', () => {
  it('no ofrece la pausa hasta saber el tope del equipo', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    cloud.debug.addTeam('Equipo A', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    let release!: (teams: MyTeam[]) => void;
    const real = cloud.myTeams.bind(cloud);
    vi.spyOn(cloud, 'myTeams').mockImplementation(() => new Promise((r) => (release = r)));
    const bridge = createMockBridge();
    const privacyPause = vi.spyOn(bridge, 'privacyPause');
    renderWithSession(<MiDiaPage bridge={bridge} date={TODAY} />, { bridge, cloud });

    const button = await screen.findByRole('button', { name: /^Pausar/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(privacyPause).not.toHaveBeenCalled();

    release(await real());
    await waitFor(() => expect(screen.getByRole('button', { name: /^Pausar/ })).toBeEnabled());
  });
});
