import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { ConsentNotice } from './App';
import { renderWithSession } from './testing';

async function cloudWithConsent(version: string) {
  const cloud = createMockCloud();
  await cloud.signUp('ana@pulso.test', 'secreto-123', 'Ana');
  const team = await cloud.createTeam('Estudio Norte');
  await cloud.giveConsent(team, version);
  return cloud;
}

describe('aviso de consentimiento nuevo', () => {
  it('con un consentimiento de una versión anterior, avisa y enlaza a Equipo', async () => {
    renderWithSession(<ConsentNotice />, { cloud: await cloudWithConsent('0-anterior') });
    expect(await screen.findByRole('link', { name: 'Revisar en Equipo' })).toHaveAttribute('href', '#/equipo');
  });

  it('con el consentimiento vigente no avisa', async () => {
    renderWithSession(<ConsentNotice />, { cloud: await cloudWithConsent(CONSENT_VERSION) });
    await screen.findByTestId('ruta');
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('link', { name: 'Revisar en Equipo' })).not.toBeInTheDocument();
  });
});
