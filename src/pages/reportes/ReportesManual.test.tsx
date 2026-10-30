import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { CloudError } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { toCloudError } from '@/cloud/supabase';
import { CONSENT_VERSION } from '@/lib/consent';
import { ReportesPage } from './ReportesPage';

const LONG = 20_000;

/** Ana (owner) en el Equipo A, con el consentimiento dado. */
async function setup() {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  return { cloud };
}

const choose = async (label: string, option: string) => userEvent.selectOptions(screen.getByLabelText(label), screen.getByRole('option', { name: option }));
const period = () => screen.getByLabelText('Periodo');

afterEach(() => vi.restoreAllMocks());

describe('Reportes · modo Manual (F6-6)', () => {
  it('en Manual el periodo por defecto es «Ayer», que no cambia mientras se va al chat', async () => {
    const { cloud } = await setup();
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    expect(period()).toHaveValue('today');
    await choose('Modo', 'Manual (copiar y pegar)');
    expect(period()).toHaveValue('yesterday');
  }, LONG);

  it('si la persona eligió un periodo, Manual lo respeta (antes o después de elegir el modo)', async () => {
    const { cloud } = await setup();
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await choose('Periodo', 'Hoy');
    await choose('Modo', 'Manual (copiar y pegar)');
    expect(period()).toHaveValue('today');
    await choose('Periodo', 'Esta semana');
    await choose('Modo', 'Gratis');
    await choose('Modo', 'Manual (copiar y pegar)');
    expect(period()).toHaveValue('this_week');
  }, LONG);

  it('si los datos cambiaron al guardar (PT409), Manual lo explica en vez del error crudo', async () => {
    const user = userEvent.setup();
    const { cloud } = await setup();
    vi.spyOn(cloud, 'saveReport').mockRejectedValue(toCloudError({ message: 'Los datos cambiaron mientras se generaba el reporte: vuelve a generarlo', code: 'PT409' }));
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await choose('Modo', 'Manual (copiar y pegar)');
    await user.click(screen.getByRole('button', { name: 'Generar' }));
    await user.click(await screen.findByLabelText('Respuesta de la IA'));
    await user.paste('{"summary":"Día tranquilo.","insights":[],"recommendations":[],"insufficient_data":false}');
    await user.click(screen.getByRole('button', { name: 'Validar y guardar' }));
    const alert = await within(screen.getByRole('region', { name: 'Modo manual' })).findByRole('alert');
    expect(alert).toHaveTextContent('Los datos cambiaron desde que copiaste el prompt');
    expect(alert).not.toHaveTextContent('No se pudo');
  }, LONG);

  it('el código PT409 de Supabase llega como un CloudError «changed»', () => {
    const error = toCloudError({ message: 'Los datos cambiaron mientras se generaba el reporte: vuelve a generarlo', code: 'PT409' });
    expect(error).toBeInstanceOf(CloudError);
    expect(error.kind).toBe('changed');
  });
});
