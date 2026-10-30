import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { ReportesPage } from './ReportesPage';

afterEach(() => vi.restoreAllMocks());

describe('Reportes · un solo aviso de error (F7)', () => {
  it('un fallo al guardar en Manual se muestra una vez, en el panel Manual', async () => {
    const user = userEvent.setup();
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const team = cloud.debug.addTeam('Equipo A', ana);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
    vi.spyOn(cloud, 'saveReport').mockRejectedValue(new Error('Sin conexión con el servidor'));
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await user.selectOptions(screen.getByLabelText('Modo'), screen.getByRole('option', { name: 'Manual (copiar y pegar)' }));
    await user.click(screen.getByRole('button', { name: 'Generar' }));
    await user.click(await screen.findByLabelText('Respuesta de la IA'));
    await user.paste('{"summary":"Día tranquilo.","insights":[],"recommendations":[],"insufficient_data":false}');
    await user.click(screen.getByRole('button', { name: 'Validar y guardar' }));

    const inManual = await within(screen.getByRole('region', { name: 'Modo manual' })).findByRole('alert');
    expect(inManual).toHaveTextContent('Sin conexión con el servidor');
    const all = screen.getAllByRole('alert').filter((a) => a.textContent?.includes('Sin conexión con el servidor'));
    expect(all).toHaveLength(1);
  }, 20_000);
});
