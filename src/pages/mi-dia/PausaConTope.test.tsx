import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { DEFAULT_WORKDAY } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { localDate } from '@/lib/time';
import { MiDiaPage } from './MiDiaPage';

const TODAY = localDate();

/** Puente cuyo día de hoy trae `pausedMinutes` minutos en pausa de privacidad. */
function bridgeWith(pausedMinutes: number) {
  const base = createMockBridge();
  const privacyPause = vi.fn(base.privacyPause);
  const bridge: Bridge = {
    ...base,
    privacyPause,
    dayView: async (date) => {
      const day = await base.dayView(date);
      return { ...day, totals: { ...day.totals, paused: pausedMinutes * 60 } };
    },
  };
  return { bridge, privacyPause };
}

async function signedIn(pauseCapMinutes: number) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  await cloud.setTeamSettings(team, { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive: false, presenceVisibleToMembers: false, pauseCapMinutes });
  return cloud;
}

describe('Mi día: tope de pausa (F5 D-11, AC-21)', () => {
  it('tope 30 y 20 min pausados: ofrece 10 min', async () => {
    const { bridge, privacyPause } = bridgeWith(20);
    renderWithSession(<MiDiaPage bridge={bridge} date={TODAY} />, { bridge, cloud: await signedIn(30) });
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar 10 min' }));
    await waitFor(() => expect(privacyPause).toHaveBeenCalledWith(10));
  });

  it('tope 30 y 30 min pausados: botón desactivado con el motivo', async () => {
    const { bridge, privacyPause } = bridgeWith(30);
    renderWithSession(<MiDiaPage bridge={bridge} date={TODAY} />, { bridge, cloud: await signedIn(30) });
    expect(await screen.findByText('Ya usaste el tope de pausa de hoy (30 min).')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pausar/ })).toBeDisabled();
    expect(privacyPause).not.toHaveBeenCalled();
  });

  it('sin tope: pausa los 15 min de siempre', async () => {
    const { bridge, privacyPause } = bridgeWith(120);
    renderWithSession(<MiDiaPage bridge={bridge} date={TODAY} />, { bridge, cloud: await signedIn(0) });
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar 15 min' }));
    await waitFor(() => expect(privacyPause).toHaveBeenCalledWith(15));
  });

  it('con mucho margen sigue ofreciendo 15 min', async () => {
    const { bridge, privacyPause } = bridgeWith(5);
    renderWithSession(<MiDiaPage bridge={bridge} date={TODAY} />, { bridge, cloud: await signedIn(60) });
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar 15 min' }));
    await waitFor(() => expect(privacyPause).toHaveBeenCalledWith(15));
  });

  it('un día que no es hoy: no ofrece pausa hasta conocer los minutos de hoy', async () => {
    const { bridge, privacyPause } = bridgeWith(0);
    let release!: (v: number) => void;
    const gate = new Promise<number>((r) => (release = r));
    const slow: Bridge = {
      ...bridge,
      dayView: async (date) => {
        const day = await bridge.dayView(date);
        if (date !== TODAY) return day;
        return { ...day, totals: { ...day.totals, paused: await gate } };
      },
    };
    renderWithSession(<MiDiaPage bridge={slow} date="2026-10-01" />, { bridge: slow, cloud: await signedIn(30) });
    const button = await screen.findByRole('button', { name: /^Pausar/ });
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.queryByText(/tope de pausa/)).not.toBeInTheDocument();
    release(20 * 60);
    await userEvent.click(await screen.findByRole('button', { name: 'Pausar 10 min' }));
    await waitFor(() => expect(privacyPause).toHaveBeenCalledWith(10));
  });
});
