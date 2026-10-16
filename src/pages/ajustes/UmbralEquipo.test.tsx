import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { DEFAULT_WORKDAY } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { AjustesPage } from './AjustesPage';

async function teamWith(idleMinutes: number | null) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  await cloud.setTeamSettings(team, { idleMinutes, workday: DEFAULT_WORKDAY, aiCountsAsProductive: false, presenceVisibleToMembers: false, pauseCapMinutes: 0 });
  return cloud;
}

describe('Umbral del equipo (F5 D-10, AC-20 parte Ajustes)', () => {
  it('con umbral de equipo, llama a settingsSet y desactiva el campo', async () => {
    const bridge = createMockBridge();
    const spy = vi.spyOn(bridge, 'settingsSet');
    renderWithSession(<AjustesPage bridge={bridge} />, { bridge, cloud: await teamWith(8) });
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ idleMinutes: 8 }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await screen.findByLabelText('Minutos de inactividad')).toBeDisabled();
    expect(await screen.findByLabelText('Minutos de inactividad')).toHaveValue(8);
    expect(screen.getByText('Lo define el equipo: 8 min')).toBeInTheDocument();
    await waitFor(async () => expect((await bridge.settingsGet()).idleMinutes).toBe(8));
  });

  it('si ya coincide, no vuelve a escribir', async () => {
    const bridge = createMockBridge();
    await bridge.settingsSet({ idleMinutes: 8 });
    const spy = vi.spyOn(bridge, 'settingsSet');
    renderWithSession(<AjustesPage bridge={bridge} />, { bridge, cloud: await teamWith(8) });
    expect(await screen.findByText('Lo define el equipo: 8 min')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sin valor de equipo, el campo funciona como antes', async () => {
    const bridge = createMockBridge();
    const spy = vi.spyOn(bridge, 'settingsSet');
    renderWithSession(<AjustesPage bridge={bridge} />, { bridge, cloud: await teamWith(null) });
    const field = await screen.findByLabelText('Minutos de inactividad');
    expect(field).toBeEnabled();
    expect(field).toHaveValue(5);
    expect(screen.queryByText(/Lo define el equipo/)).not.toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  });
});
