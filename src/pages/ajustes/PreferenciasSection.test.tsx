import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { HelpContext } from '@/app/keyboard';
import { renderWithSession } from '@/app/testing';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { PreferenciasSection } from './PreferenciasSection';

describe('Ajustes: Tema, atajos y sincronización (F-09)', () => {
  it('reúne equipo activo, sincronización, tema y atajos, que en ventanas estrechas no están en el menú', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const a = cloud.debug.addTeam('Equipo A', ana);
    cloud.debug.addTeam('Equipo B', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(a, CONSENT_VERSION);
    const openHelp = vi.fn();
    renderWithSession(
      <HelpContext.Provider value={openHelp}>
        <PreferenciasSection />
      </HelpContext.Provider>,
      { cloud },
    );
    const card = screen.getByRole('region', { name: 'Tema, atajos y sincronización' });
    const team = await within(card).findByRole('combobox', { name: 'Equipo activo' });
    expect(within(team).getAllByRole('option').map((o) => o.textContent)).toEqual(['Equipo A', 'Equipo B']);
    expect(within(card).getByRole('status')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /Tema/ })).toBeInTheDocument();
    await userEvent.click(within(card).getByRole('button', { name: 'Atajos' }));
    expect(openHelp).toHaveBeenCalledOnce();
  });
});
