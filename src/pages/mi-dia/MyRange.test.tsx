import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import type { Bridge, Category, RangeView } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { CloudError, DEFAULT_WORKDAY, type TimeByTask } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { startOfDayIso, systemTimezone } from '@/lib/time';
import { MiDiaPage } from './MiDiaPage';

const LONG = 20_000;
/** El perfil de la prueba toma la zona del sistema al crearse (`ensureProfile`). */
const iso = (date: string) => startOfDayIso(date, systemTimezone());
const ZERO: Record<Category, number> = { productive: 0, neutral: 0, distraction: 0, ai: 0, break: 0, idle: 0, paused: 0 };

/** Un puente cuyo `rangeView` devuelve 1 h productiva, 30 min de IA y 10 min neutros el primer día del rango. */
function bridgeWithRange() {
  const base = createMockBridge();
  const rangeView = vi.fn(async (from: string, to: string): Promise<RangeView> => ({
    from,
    to,
    days: [{ date: from, totals: { ...ZERO, productive: 3600, ai: 1800, neutral: 600 } }],
  }));
  const bridge: Bridge = { ...base, rangeView };
  return { bridge, rangeView };
}

/** Ana (owner) con consentimiento en el Equipo A. */
async function signedIn(aiCountsAsProductive = false) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  await cloud.setTeamSettings(team, { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive, presenceVisibleToMembers: false, pauseCapMinutes: 0 });
  return { cloud, team };
}

const open = (name: 'Semana' | 'Mes') => userEvent.click(screen.getByRole('radio', { name }));

// Solo se finge la fecha: los temporizadores y las promesas siguen reales.
beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }));
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Mi día: Día · Semana · Mes (AC-18)', () => {
  it('ofrece los tres periodos y «Día» es la vista de siempre', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud: (await signedIn()).cloud });
    const tabs = within(screen.getByRole('radiogroup', { name: 'Periodo' })).getAllByRole('radio');
    expect(tabs.map((t) => t.textContent)).toEqual(['Día', 'Semana', 'Mes']);
    expect(tabs[0]).toHaveAttribute('aria-checked', 'true');
    expect(await screen.findByRole('heading', { name: 'Registro de tiempo' })).toBeInTheDocument();
  }, LONG);

  it('Semana pide de lunes a domingo; si hoy es domingo, la semana que termina hoy', async () => {
    vi.setSystemTime(new Date('2026-10-11T10:00:00')); // domingo
    const { bridge, rangeView } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud: (await signedIn()).cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2026-10-05', '2026-10-11');
    // El gráfico tiene una barra por día de la semana.
    const rows = within(screen.getByRole('table')).getAllByRole('row');
    expect(rows).toHaveLength(8);
    // El lunes 5 trae 1 h productiva, 30 min de IA y 10 min neutros (total 1 h 40 min); el martes, nada.
    expect(within(rows[1]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['1 h 00 min', '30 min', '10 min', '0 min', '1 h 40 min']);
    expect(within(rows[2]!).getAllByRole('cell').map((c) => c.textContent)).toEqual(['0 min', '0 min', '0 min', '0 min', '0 min']);
  }, LONG);

  it('Mes pide del día 1 al último, con febrero bisiesto', async () => {
    vi.setSystemTime(new Date('2028-02-15T10:00:00'));
    const { bridge, rangeView } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud: (await signedIn()).cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Mes');
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2028-02-01', '2028-02-29');
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(30);
  }, LONG);

  it('las flechas cambian el periodo y no pasan del actual', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { bridge, rangeView } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud: (await signedIn()).cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    await screen.findByRole('table');
    const next = screen.getByRole('button', { name: 'Semana siguiente' });
    expect(next).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2026-09-28', '2026-10-04');
    expect(screen.getByRole('button', { name: 'Semana siguiente' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Semana siguiente' }));
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2026-10-05', '2026-10-11');

    await open('Mes');
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2026-10-01', '2026-10-31');
    expect(screen.getByRole('button', { name: 'Mes siguiente' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Mes anterior' }));
    await screen.findByRole('table');
    expect(rangeView).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
  }, LONG);

  it('«Productivas» suma la IA solo si el equipo lo decide (D-7)', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    for (const [aiCounts, productive] of [[false, '1 h 00 min'], [true, '1 h 30 min']] as const) {
      const { bridge } = bridgeWithRange();
      const view = renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud: (await signedIn(aiCounts)).cloud });
      await screen.findByRole('heading', { name: 'Registro de tiempo' });
      await open('Semana');
      await screen.findByText('Productivas');
      // Las horas de IA aparecen igual en los dos casos y las activas no cambian.
      expect(screen.getByText('Productivas').parentElement).toHaveTextContent(productive);
      expect(screen.getByText('IA').parentElement).toHaveTextContent('30 min');
      expect(screen.getByText('Horas activas').parentElement).toHaveTextContent('1 h 40 min');
      view.unmount();
    }
  }, LONG);

  it('sin actividad en el periodo muestra un estado vacío, y un fallo del sensor dice qué pasó', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const base = createMockBridge();
    const empty: Bridge = { ...base, rangeView: async (from, to) => ({ from, to, days: [] }) };
    const view = renderWithSession(<MiDiaPage bridge={empty} />, { bridge: empty, cloud: (await signedIn()).cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    expect(await screen.findByText('Sin actividad en este periodo')).toBeInTheDocument();
    view.unmount();

    const broken: Bridge = { ...base, rangeView: () => Promise.reject(new Error('sensor no disponible')) };
    renderWithSession(<MiDiaPage bridge={broken} />, { bridge: broken, cloud: (await signedIn()).cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    expect(await screen.findByText('No se pudo leer tu actividad del periodo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  }, LONG);
});

describe('Mi semana y Mi mes: tiempo por proyecto y tarea (AC-19)', () => {
  const rows: TimeByTask[] = [
    { projectId: '00000000-0000-4000-8000-000000000a01', projectName: 'Pulso', taskId: '00000000-0000-4000-8000-000000000b01', taskTitle: 'Gráficas', seconds: 5400 },
    { projectId: '00000000-0000-4000-8000-000000000a01', projectName: 'Pulso', taskId: '00000000-0000-4000-8000-000000000b02', taskTitle: 'Pruebas', seconds: 1800 },
    { projectId: null, projectName: null, taskId: null, taskTitle: null, seconds: 900 },
  ];

  it('con conexión lista proyecto, tareas y «Sin tarea», con el periodo exclusivo en hora local', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { cloud, team } = await signedIn();
    const spy = vi.spyOn(cloud, 'myTimeByTask').mockResolvedValue(rows);
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');

    const list = await screen.findByRole('list', { name: 'Tiempo por proyecto y tarea' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pulso2 h 00 min',
      'Gráficas1 h 30 min',
      'Pruebas30 min',
      'Sin tarea15 min',
    ]);
    expect(spy).toHaveBeenLastCalledWith(team, iso('2026-10-05'), iso('2026-10-12'));
  }, LONG);

  it('sin conexión dice «Sin conexión» solo en esa sección y el gráfico sigue visible', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { cloud } = await signedIn();
    vi.spyOn(cloud, 'myTimeByTask').mockRejectedValue(new CloudError('Sin conexión con el servidor. Tus datos siguen guardados en este equipo.', 'network'));
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Mes');

    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Tiempo por proyecto y tarea' })).not.toBeInTheDocument();
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Productivas')).toBeInTheDocument();
  }, LONG);

  it('otro error de la nube se dice como error, no como falta de conexión', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { cloud } = await signedIn();
    vi.spyOn(cloud, 'myTimeByTask').mockRejectedValue(new CloudError('No tienes permiso para esta acción.', 'forbidden'));
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    expect(await screen.findByText('No se pudo cargar el tiempo por proyecto')).toBeInTheDocument();
    expect(screen.queryByText('Sin conexión')).not.toBeInTheDocument();
  }, LONG);

  it('el observador ve que su rol no registra tiempo y no se consulta la nube', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { cloud, team } = await signedIn();
    const vera = cloud.debug.addAccount('vera@pulso.test', 'secreto-123', 'Vera');
    cloud.debug.addMember(team, vera, 'viewer', true);
    await cloud.signIn('vera@pulso.test', 'secreto-123');
    const spy = vi.spyOn(cloud, 'myTimeByTask');
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    expect(await screen.findByText('Con el rol de observador no se registra tiempo por proyecto.')).toBeInTheDocument();
    expect(screen.queryByText(/Elige un equipo/)).not.toBeInTheDocument();
    expect(screen.getByText('Productivas')).toBeInTheDocument();
    expect(spy).not.toHaveBeenCalled();
  }, LONG);

  it('sin entradas en proyectos dice que no hay tiempo registrado', async () => {
    vi.setSystemTime(new Date('2026-10-07T10:00:00'));
    const { cloud } = await signedIn();
    vi.spyOn(cloud, 'myTimeByTask').mockResolvedValue([]);
    const { bridge } = bridgeWithRange();
    renderWithSession(<MiDiaPage bridge={bridge} />, { bridge, cloud });
    await screen.findByRole('heading', { name: 'Registro de tiempo' });
    await open('Semana');
    expect(await screen.findByText('Sin tiempo registrado en proyectos')).toBeInTheDocument();
  }, LONG);
});
