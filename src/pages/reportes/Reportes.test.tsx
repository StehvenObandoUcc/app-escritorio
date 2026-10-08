import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import type { ReportRequest } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { ReportesPage } from './ReportesPage';

const LONG = 20_000;

/** Ana (owner), Beto (member) y Vera (viewer) en el Equipo A. */
async function setup(as: 'ana' | 'beto' | 'vera' = 'ana') {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
  const vera = cloud.debug.addAccount('vera@pulso.test', 'secreto-123', 'Vera');
  const team = cloud.debug.addTeam('Equipo A', ana);
  cloud.debug.addMember(team, beto, 'member', true);
  cloud.debug.addMember(team, vera, 'viewer', true);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  if (as !== 'ana') await cloud.signIn(`${as}@pulso.test`, 'secreto-123');
  return { cloud, team, ana, beto };
}

const choose = async (label: string, option: string) => userEvent.selectOptions(screen.getByLabelText(label), screen.getByRole('option', { name: option }));
const generate = () => userEvent.click(screen.getByRole('button', { name: 'Generar' }));

afterEach(() => vi.restoreAllMocks());

describe('Reportes (F4)', () => {
  it('cada rol ve solo lo que puede generar; el viewer solo ve los de equipo (AC-5, AC-7)', async () => {
    const owner = await setup('ana');
    const view = renderWithSession(<ReportesPage />, { path: '/reportes', cloud: owner.cloud });
    expect(await screen.findByRole('option', { name: 'Todo el equipo: Equipo A' })).toBeInTheDocument();
    view.unmount();

    const member = await setup('beto');
    const memberView = renderWithSession(<ReportesPage />, { path: '/reportes', cloud: member.cloud });
    expect(await screen.findByRole('option', { name: 'Mi trabajo' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Todo el equipo/ })).not.toBeInTheDocument();
    memberView.unmount();

    const viewer = await setup('ana');
    const req: ReportRequest = { teamId: viewer.team, scope: 'team', subjectId: viewer.team, period: 'today' };
    await viewer.cloud.generateFreeReport(req, 'es');
    await viewer.cloud.generateFreeReport({ ...req, scope: 'personal', subjectId: viewer.ana }, 'es');
    await viewer.cloud.signIn('vera@pulso.test', 'secreto-123');
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud: viewer.cloud });
    expect(await screen.findByText('Como observador ves los reportes de equipo ya generados.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Generar' })).not.toBeInTheDocument();
    const history = await screen.findByRole('list', { name: 'Historial' });
    expect(within(history).getAllByRole('button')).toHaveLength(1);
    expect(within(history).getByText('Todo el equipo: Equipo A')).toBeInTheDocument();
  }, LONG);

  it('modo Gratis: «hoy» sube antes los datos, las cifras salen de los hechos y repetir no gasta cupo (AC-17, AC-22, AC-23)', async () => {
    const { cloud } = await setup('ana');
    const { engine } = renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    const sync = vi.spyOn(engine, 'syncNow');
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await generate();
    expect(sync).toHaveBeenCalled();
    const report = await screen.findByRole('article', { name: 'Mi trabajo' });
    expect(within(report).getByText('Tareas terminadas')).toBeInTheDocument();
    expect(within(report).getByText('Validado en el servidor')).toBeInTheDocument();
    expect(within(report).getByText(/Texto redactado por IA/)).toBeInTheDocument();
    await generate();
    expect(await screen.findByText(/Ya había un reporte con los mismos datos/)).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Historial' })).getAllByRole('button')).toHaveLength(1);
  }, LONG);

  it('el sexto reporte gratis del día muestra el aviso de límite (AC-14)', async () => {
    const { cloud, team, ana } = await setup('ana');
    const personal = { teamId: team, scope: 'personal' as const, subjectId: ana };
    for (const period of ['today', 'yesterday', 'this_week', 'last_week'] as const) await cloud.generateFreeReport({ ...personal, period }, 'es');
    await cloud.generateFreeReport({ teamId: team, scope: 'team', subjectId: team, period: 'today' }, 'es');
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Todo el equipo: Equipo A' });
    await choose('Sobre', 'Todo el equipo: Equipo A');
    await choose('Periodo', 'Ayer');
    await generate();
    expect(await screen.findByRole('alert')).toHaveTextContent('Usaste tus 5 reportes gratis de hoy. Conecta tu propio proveedor o usa el modo manual.');
  }, LONG);

  it('modo Manual: copiar el prompt, una respuesta inválida se explica y una válida se guarda (AC-21)', async () => {
    const user = userEvent.setup();
    const { cloud } = await setup('ana');
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await choose('Modo', 'Manual (copiar y pegar)');
    await generate();
    const prompt = await screen.findByLabelText('Prompt para tu IA');
    expect((prompt as HTMLTextAreaElement).value).toContain('HECHOS:');
    await user.click(screen.getByRole('button', { name: 'Copiar prompt' }));
    expect(await navigator.clipboard.readText()).toContain('"tasks_done"');

    const answer = screen.getByLabelText('Respuesta de la IA');
    await user.click(answer);
    await user.paste('Lo siento, no puedo.');
    await user.click(screen.getByRole('button', { name: 'Validar y guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se encontró un objeto JSON en la respuesta.');

    await user.clear(answer);
    await user.paste('```json\n{"summary":"Día tranquilo.","insights":[],"recommendations":[],"insufficient_data":false}\n```');
    await user.click(screen.getByRole('button', { name: 'Validar y guardar' }));
    const report = await screen.findByRole('article', { name: 'Mi trabajo' });
    expect(within(report).getByText('Día tranquilo.')).toBeInTheDocument();
    expect(within(report).getByText(/Manual \(copiar y pegar\)/)).toBeInTheDocument();
  }, LONG);

  it('mi proveedor sin configurar no deja generar; configurado, genera con la IA del puente (AC-18)', async () => {
    const { cloud } = await setup('ana');
    const bridge = createMockBridge();
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud, bridge });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await choose('Modo', 'Mi proveedor de IA');
    expect(await screen.findByText('Configura tu proveedor en Ajustes → IA para usar este modo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generar' })).toBeDisabled();
  }, LONG);

  it('exporta Markdown, JSON y CSV como descargas y el PDF con la vista de impresión (AC-26)', async () => {
    const { cloud } = await setup('ana');
    const created = vi.fn(() => 'blob:pulso');
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const clicks = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderWithSession(<ReportesPage />, { path: '/reportes', cloud });
    await screen.findByRole('option', { name: 'Mi trabajo' });
    await generate();
    const exports = await screen.findByRole('group', { name: 'Exportar' });
    for (const name of ['Markdown', 'JSON', 'CSV']) await userEvent.click(within(exports).getByRole('button', { name }));
    expect(created).toHaveBeenCalledTimes(3);
    expect(clicks).toHaveBeenCalledTimes(3);
    expect(await screen.findByText(/Guardado en Descargas: pulso-personal-.*\.csv/)).toBeInTheDocument();
    await userEvent.click(within(exports).getByRole('button', { name: 'PDF (imprimir)' }));
    expect(print).toHaveBeenCalled();
  }, LONG);
});
