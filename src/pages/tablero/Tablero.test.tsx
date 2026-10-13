import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { CloudError, type Presence, type TeamDashboard, type TeamRole } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { AppNav } from '@/ui/organisms';
import { AppShell } from '@/ui/templates';
import { KeyboardHelp } from '@/ui/molecules';
import { nav, ROUTES } from '@/app/App';
import { TableroPage } from './TableroPage';
import { dashboardPeriod, periodRange } from './period';

const LONG = 20_000;
const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cats = (productive: number, ai: number, neutral: number, distraction: number) => ({ productive, ai, neutral, distraction });
const task = (n: number, title: string, projectName: string) => ({ id: ID(900 + n), title, projectId: ID(800 + n), projectName });

/** Tablero de ejemplo con cifras fáciles de reconocer en pantalla. */
const dash = (over: Partial<TeamDashboard> = {}): TeamDashboard => ({
  role: 'owner',
  isLead: false,
  totals: {
    members: 3,
    hoursActive: 12.5,
    hoursProductive: 7.5,
    hoursCategory: cats(7.5, 2, 2, 1),
    aiHours: 2,
    aiSessions: 4,
    aiTool: { claude: 1.5, chatgpt: 0.5 },
    aiUsage: { code: 1, writing: 0.5, analysis: 0, other: 0, untagged: 0.5 },
    tasksDoing: 3,
    tasksDone: 9,
  },
  perDay: [
    { day: '2026-10-12', hoursCategory: cats(4, 1, 1, 0) },
    { day: '2026-10-13', hoursCategory: cats(3.5, 1, 1, 1) },
  ],
  members: [
    {
      userId: ID(1),
      name: 'Ana Gómez',
      shareAppNames: true,
      hoursActive: 6.5,
      hoursProductive: 4,
      hoursCategory: cats(4, 1, 1, 0.5),
      aiHours: 1,
      aiSessions: 2,
      capacityHours: 20,
      capacityShare: 33,
      tasksDoing: [task(1, 'Tablero del equipo', 'Pulso')],
    },
    {
      userId: ID(2),
      name: 'Beto Ruiz',
      shareAppNames: false,
      hoursActive: 4,
      hoursProductive: 2.5,
      hoursCategory: cats(2.5, 1, 0.5, 0),
      aiHours: 1,
      aiSessions: 2,
      capacityHours: 0,
      capacityShare: null,
      tasksDoing: [],
    },
    {
      userId: ID(3),
      name: null,
      shareAppNames: true,
      hoursActive: 2,
      hoursProductive: 1,
      hoursCategory: cats(1, 0, 1, 0),
      aiHours: 0,
      aiSessions: 0,
      capacityHours: 20,
      capacityShare: 10,
      tasksDoing: [],
    },
  ],
  leadMembers: [],
  topApps: [
    { appName: 'Visual Studio Code', hours: 6 },
    { appName: 'Google Chrome', hours: 3.5 },
  ],
  ...over,
});

/** Lo que recibe un member o un viewer: totales y gráficas, sin nombres. */
const anonymous = (role: TeamRole): TeamDashboard => dash({ role, members: [], topApps: [] });

const PRESENCE: Presence[] = [
  { userId: ID(1), name: 'Ana Gómez', state: 'active', since: '2026-10-13T08:05:00-05:00' },
  { userId: ID(2), name: 'Beto Ruiz', state: 'break', since: '2026-10-13T09:40:00-05:00' },
  { userId: ID(3), name: null, state: 'offline', since: null },
];

/** Ana (owner), Beto (member) y Vera (viewer) en el Equipo A; `as` elige quién tiene la sesión. */
async function setup(as: 'ana' | 'beto' | 'vera', { presenceVisible = false }: { presenceVisible?: boolean } = {}) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
  const vera = cloud.debug.addAccount('vera@pulso.test', 'secreto-123', 'Vera');
  const team = cloud.debug.addTeam('Equipo A', ana);
  cloud.debug.addMember(team, beto, 'member', true);
  cloud.debug.addMember(team, vera, 'viewer', true);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  if (presenceVisible) {
    await cloud.setTeamSettings(team, { idleMinutes: null, workday: { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' }, aiCountsAsProductive: false, presenceVisibleToMembers: true, pauseCapMinutes: 0 });
  }
  if (as !== 'ana') {
    await cloud.signIn(`${as}@pulso.test`, 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
  }
  const dashboard = vi.spyOn(cloud, 'teamDashboard');
  const presence = vi.spyOn(cloud, 'teamPresence');
  return { cloud, team, dashboard, presence };
}

const section = (name: string) => screen.findByRole('region', { name });
const absent = (name: string) => expect(screen.queryByRole('region', { name })).not.toBeInTheDocument();

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Periodos del tablero (D-1)', () => {
  it('los límites son las 00:00 locales y `to` es exclusivo', () => {
    // 2026-10-14 es miércoles.
    expect(periodRange('today', '2026-10-14')).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(periodRange('this_week', '2026-10-14')).toEqual({ from: '2026-10-12', to: '2026-10-18' });
    expect(periodRange('this_month', '2026-10-14')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(periodRange('last_week', '2026-10-14')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(periodRange('last_month', '2026-10-14')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(periodRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    // Las 00:00 son las de la zona del perfil, no las de la máquina.
    expect(dashboardPeriod('today', '2026-10-14', 'America/Bogota')).toEqual({ from: '2026-10-14T05:00:00.000Z', to: '2026-10-15T05:00:00.000Z' });
  });
});

describe('Tablero (F5)', () => {
  it('el owner ve totales, gráfica, IA, presencia, Personas y Apps; cambiar el periodo vuelve a pedir (AC-14)', async () => {
    const { cloud, team, dashboard } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    await section('Horas por día');
    await section('Uso de IA del equipo');
    await section('Presencia');
    const people = await section('Personas');
    await section('Apps más usadas');
    absent('Tus proyectos');
    expect(dashboard).toHaveBeenCalledTimes(1);
    expect(dashboard.mock.calls[0]![0]).toBe(team);

    // Sin nombre y «Solo categorías» (PS-05).
    expect(within(people).getByText('Sin nombre')).toBeInTheDocument();
    const beto = within(people).getByRole('row', { name: /Beto Ruiz/ });
    expect(within(beto).getByText('Solo categorías')).toBeInTheDocument();
    expect(within(people).getAllByText('Solo categorías')).toHaveLength(1);

    await userEvent.selectOptions(screen.getByLabelText('Periodo'), screen.getByRole('option', { name: 'Mes pasado' }));
    await waitFor(() => expect(dashboard).toHaveBeenCalledTimes(2));
    const [, from, to] = dashboard.mock.calls[1]!;
    expect(new Date(from).getDate()).toBe(1);
    expect(new Date(to).getDate()).toBe(1);
    expect(Date.parse(to)).toBeGreaterThan(Date.parse(from));
  }, LONG);

  it('el lead ve su tabla con la explicación y no ve Personas ni Apps (AC-14, D-5)', async () => {
    const { cloud, dashboard } = await setup('beto');
    dashboard.mockResolvedValue(
      dash({
        role: 'member',
        isLead: true,
        members: [],
        topApps: [],
        leadMembers: [{ userId: ID(1), name: 'Ana Gómez', projectHours: 3.5, aiHoursInProjects: 0.5, tasksDoing: [task(1, 'Tablero del equipo', 'Pulso')] }],
      }),
    );
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    const lead = await section('Tus proyectos');
    expect(within(lead).getByText(/Solo cuenta el tiempo y la IA dentro de los proyectos que lideras/)).toBeInTheDocument();
    const row = within(lead).getByRole('row', { name: /Ana Gómez/ });
    expect(within(row).getByText('3 h 30 min')).toBeInTheDocument();
    expect(within(row).getByText('30 min')).toBeInTheDocument();
    expect(within(row).getByText('Tablero del equipo (Pulso)')).toBeInTheDocument();
    absent('Personas');
    absent('Apps más usadas');
    await section('Totales del equipo');
    // El lead ve la presencia de sus proyectos aunque el equipo no la abra a todos los miembros.
    await section('Presencia');
  }, LONG);

  it.each(['member', 'viewer'] as const)('%s ve solo totales y gráficas, sin nombres (AC-14)', async (role) => {
    const { cloud, dashboard } = await setup(role === 'member' ? 'beto' : 'vera');
    dashboard.mockResolvedValue(anonymous(role));
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    await section('Horas por día');
    await section('Uso de IA del equipo');
    for (const name of ['Personas', 'Apps más usadas', 'Tus proyectos', 'Presencia']) absent(name);
    expect(screen.queryByText('Ana Gómez')).not.toBeInTheDocument();
  }, LONG);

  it('un viewer cuyo JSON trae por error `members` y `leadMembers` no ve ningún nombre', async () => {
    const { cloud, dashboard } = await setup('vera');
    const wrong = dash({ role: 'viewer', isLead: false });
    dashboard.mockResolvedValue({ ...wrong, leadMembers: [{ userId: ID(1), name: 'Ana Gómez', projectHours: 1, aiHoursInProjects: 0, tasksDoing: [] }] });
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    for (const name of ['Personas', 'Apps más usadas', 'Tus proyectos']) absent(name);
    expect(screen.queryByText('Ana Gómez')).not.toBeInTheDocument();
    expect(screen.queryByText('Visual Studio Code')).not.toBeInTheDocument();
  }, LONG);

  it('con `totals: null` dice que hacen falta al menos 2 miembros (D-3)', async () => {
    const { cloud, dashboard } = await setup('vera');
    dashboard.mockResolvedValue(dash({ role: 'viewer', totals: null, perDay: [], members: [], topApps: [] }));
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    expect(await screen.findByText('Hacen falta al menos 2 miembros')).toBeInTheDocument();
    absent('Totales del equipo');
    absent('Horas por día');
  }, LONG);

  it('sin datos en el periodo muestra el estado vacío (UI-07)', async () => {
    const { cloud, dashboard } = await setup('ana');
    const base = dash();
    dashboard.mockResolvedValue(
      dash({
        totals: { ...base.totals!, hoursActive: 0, hoursProductive: 0, aiHours: 0, aiSessions: 0, tasksDoing: 0, tasksDone: 0, aiTool: {}, hoursCategory: cats(0, 0, 0, 0) },
        perDay: [],
        members: [],
        topApps: [],
      }),
    );
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue([]);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    expect(await screen.findByText('Sin datos en este periodo')).toBeInTheDocument();
    absent('Totales del equipo');
  }, LONG);

  it('un error muestra un mensaje traducido y «Reintentar» vuelve a pedir (UI-07)', async () => {
    const { cloud, dashboard } = await setup('ana');
    dashboard.mockRejectedValueOnce(new CloudError('No permitido', 'forbidden')).mockResolvedValue(dash());
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No se pudo cargar el tablero');
    expect(alert).toHaveTextContent('No permitido');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await section('Totales del equipo');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  }, LONG);

  it('las cifras mostradas son las del JSON, solo con formato (AC-16)', async () => {
    const { cloud, dashboard } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue([]);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    const totals = await section('Totales del equipo');
    const stat = (label: string) => within(totals).getByText(label).closest('div')!;
    expect(stat('Horas activas')).toHaveTextContent('12 h 30 min');
    expect(stat('Productivas')).toHaveTextContent('7 h 30 min');
    expect(stat('IA')).toHaveTextContent('2 h 00 min');
    expect(stat('IA')).toHaveTextContent('4 sesiones');
    expect(stat('Tareas en curso')).toHaveTextContent('3');
    expect(stat('Tareas hechas')).toHaveTextContent('9');
    expect(stat('Miembros')).toHaveTextContent('3');

    // Cada gráfica trae su tabla equivalente con las mismas cifras.
    const chart = within(await section('Horas por día'));
    const row = chart.getByRole('row', { name: /13/ });
    expect(within(row).getAllByRole('cell').map((c) => c.textContent)).toEqual(['3 h 30 min', '1 h 00 min', '1 h 00 min', '1 h 00 min', '6 h 30 min']);

    // IA y Apps: la propia lista de barras ES el equivalente en texto (cada fila dice nombre y valor); no llevan tabla aparte.
    const ai = await section('Uso de IA del equipo');
    const tools = within(within(ai).getByRole('list', { name: 'Por herramienta' }));
    expect(tools.getByText('Claude').closest('li')).toHaveTextContent('1 h 30 min');
    expect(tools.getByText('ChatGPT').closest('li')).toHaveTextContent('30 min');
    const usage = within(within(ai).getByRole('list', { name: 'Por tipo de uso' }));
    expect(usage.getByText('Código').closest('li')).toHaveTextContent('1 h 00 min');
    expect(usage.getByText('Redacción').closest('li')).toHaveTextContent('30 min');
    expect(usage.getByText('Sin etiquetar').closest('li')).toHaveTextContent('30 min');
    expect(usage.queryByText('Análisis')).not.toBeInTheDocument();

    const people = within(await section('Personas'));
    const ana = people.getByRole('row', { name: /Ana Gómez/ });
    expect(ana).toHaveTextContent('6 h 30 min');
    expect(ana).toHaveTextContent('4 h 00 min');
    expect(ana).toHaveTextContent('1 h 00 min');
    expect(ana).toHaveTextContent('2 sesiones');
    expect(ana).toHaveTextContent('33 %');
    expect(ana).toHaveTextContent('Tablero del equipo (Pulso)');
    // Capacidad sin jornada: «—», no un número inventado.
    const beto = people.getByRole('row', { name: /Beto Ruiz/ });
    expect(within(beto).getAllByRole('cell')[3]).toHaveTextContent('—');
    expect(within(beto).getAllByRole('cell')[4]).toHaveTextContent('Ninguna');

    const apps = within(await section('Apps más usadas'));
    expect(apps.getByText('Visual Studio Code').closest('li')).toHaveTextContent('6 h 00 min');
    expect(apps.getByText('Google Chrome').closest('li')).toHaveTextContent('3 h 30 min');
  }, LONG);
});

describe('Presencia (DR-01)', () => {
  it('se pide cada 60 s y cada estado se ve con texto (AC-15)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cloud, dashboard } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    const presence = vi.spyOn(cloud, 'teamPresence').mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    const box = await section('Presencia');
    expect(presence).toHaveBeenCalledTimes(1);
    const states = within(box);
    const ana = states.getByText('Ana Gómez').closest('li')!;
    expect(ana).toHaveTextContent('Activo');
    expect(ana).toHaveTextContent(/desde las \d{2}:\d{2}/);
    expect(states.getByText('Beto Ruiz').closest('li')).toHaveTextContent('En descanso');
    // «Activo» usa el tono de éxito; los demás estados, neutro (siempre con texto).
    expect(states.getByText('Activo').className).toContain('text-cat-productive');
    expect(states.getByText('En descanso').className).not.toContain('text-cat-productive');
    expect(states.getByText('Desconectado').className).not.toContain('text-cat-productive');
    const offline = states.getByText('Sin nombre').closest('li')!;
    expect(offline).toHaveTextContent('Desconectado');
    expect(offline).not.toHaveTextContent('desde');

    presence.mockResolvedValue([{ ...PRESENCE[0]!, state: 'paused' }, { ...PRESENCE[1]!, state: 'idle' }]);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    await waitFor(() => expect(presence).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('En pausa')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  }, LONG);

  it('el viewer no la pide (AC-15)', async () => {
    const { cloud, dashboard, presence } = await setup('vera');
    dashboard.mockResolvedValue(anonymous('viewer'));
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    expect(presence).not.toHaveBeenCalled();
    absent('Presencia');
  }, LONG);

  it('el member no la ve si el equipo no la abre, y sí si la abre (AC-15)', async () => {
    const closed = await setup('beto');
    closed.dashboard.mockResolvedValue(anonymous('member'));
    const view = renderWithSession(<TableroPage />, { path: '/tablero', cloud: closed.cloud });
    await section('Totales del equipo');
    expect(closed.presence).not.toHaveBeenCalled();
    absent('Presencia');
    view.unmount();

    const open = await setup('beto', { presenceVisible: true });
    open.dashboard.mockResolvedValue(anonymous('member'));
    open.presence.mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud: open.cloud });
    await section('Presencia');
    expect(open.presence).toHaveBeenCalledTimes(1);
  }, LONG);

  it('si la presencia falla por otra causa, avisa dentro de la sección y «Reintentar» vuelve a pedirla (UI-07)', async () => {
    const { cloud, dashboard, presence } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    presence.mockRejectedValueOnce(new CloudError('Sin conexión', 'network')).mockResolvedValue(PRESENCE);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    const box = await section('Presencia');
    expect(within(box).getByRole('alert')).toHaveTextContent('No se pudo cargar la presencia');
    await section('Totales del equipo');
    await userEvent.click(within(box).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(presence).toHaveBeenCalledTimes(2));
    expect(await within(await section('Presencia')).findByText('Activo')).toBeInTheDocument();
    expect(screen.queryByText('No se pudo cargar la presencia', { exact: false })).not.toBeInTheDocument();
  }, LONG);

  it('si la nube responde 42501, la sección no aparece, no hay error y se deja de preguntar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const { cloud, dashboard, presence } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    presence.mockRejectedValue(new CloudError('No permitido', 'forbidden'));
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    await waitFor(() => expect(presence).toHaveBeenCalledTimes(1));
    absent('Presencia');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(180_000);
    });
    expect(presence).toHaveBeenCalledTimes(1);
  }, LONG);

});

describe('Imprimir / PDF y navegación (AC-17)', () => {
  it('el botón llama a window.print y los controles tienen print:hidden', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const { cloud, dashboard } = await setup('ana');
    dashboard.mockResolvedValue(dash());
    vi.spyOn(cloud, 'teamPresence').mockResolvedValue([]);
    renderWithSession(<TableroPage />, { path: '/tablero', cloud });
    await section('Totales del equipo');
    const button = screen.getByRole('button', { name: 'Imprimir / PDF' });
    expect(button.closest('.print\\:hidden')).not.toBeNull();
    expect(screen.getByLabelText('Periodo').closest('.print\\:hidden')).not.toBeNull();
    await userEvent.click(button);
    expect(print).toHaveBeenCalledTimes(1);
  }, LONG);

  it('la navegación real de la app va dentro de un contenedor print:hidden y «Tablero» lleva a /tablero', () => {
    render(
      <MemoryRouter>
        <AppShell nav={<AppNav items={nav()} />}>
          <p>contenido</p>
        </AppShell>
      </MemoryRouter>,
    );
    const navEl = screen.getByRole('navigation', { name: 'Principal' });
    expect(navEl.closest('.print\\:hidden')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/tablero');
    // Los atajos Alt+n siguen la misma lista que la navegación, y la ayuda dice cuántos hay.
    expect(nav().map((i) => i.to)).toEqual(ROUTES);
    expect(ROUTES).toContain('/tablero');
    render(<KeyboardHelp open onClose={() => {}} sectionCount={ROUTES.length} />);
    expect(screen.getByText(`Alt+1 … Alt+${ROUTES.length}`)).toBeInTheDocument();
  });
});
