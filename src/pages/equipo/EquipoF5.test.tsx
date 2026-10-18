import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { IDLE_MINUTES_MAX, IDLE_MINUTES_MIN } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { en } from '@/i18n/en';
import { es } from '@/i18n/es';
import { CONSENT_VERSION } from '@/lib/consent';
import { EquipoPage } from './EquipoPage';

type Role = 'owner' | 'admin' | 'member' | 'viewer';

/** Un equipo con una persona del rol pedido (sesión iniciada) y, si no es owner, a Ana como owner. */
async function teamWith(role: Role) {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const team = cloud.debug.addTeam('Equipo A', ana);
  let me = ana;
  if (role !== 'owner') {
    me = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
    cloud.debug.addMember(team, me, role, true);
    await cloud.signIn('beto@pulso.test', 'secreto-123');
  } else {
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
  }
  return { cloud, team, me, ana };
}

const openTab = async (name: string) => userEvent.click(await screen.findByRole('tab', { name }));

describe('Pestañas de Equipo (D-12, D-13)', () => {
  it('owner y admin ven «Reglas y políticas» y «Auditoría»; ya no existe «Sitios y políticas»', async () => {
    for (const role of ['owner', 'admin'] as const) {
      const { cloud } = await teamWith(role);
      const view = renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
      expect(await screen.findByRole('tab', { name: 'Reglas y políticas' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Auditoría' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Sitios y políticas' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('member y viewer no ven esas pestañas', async () => {
    for (const role of ['member', 'viewer'] as const) {
      const { cloud } = await teamWith(role);
      const view = renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
      expect(await screen.findByRole('tab', { name: 'General' })).toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Auditoría' })).not.toBeInTheDocument();
      expect(screen.queryByRole('tab', { name: 'Reglas y políticas' })).not.toBeInTheDocument();
      view.unmount();
    }
  });
});

describe('Ajustes del equipo (EQ-09, AC-20 parte Equipo)', () => {
  it('el owner guarda los valores exactos y los equipos se vuelven a leer', async () => {
    const { cloud, team } = await teamWith('owner');
    const save = vi.spyOn(cloud, 'setTeamSettings');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('General');
    const section = await screen.findByRole('region', { name: 'Ajustes del equipo' });

    // Opciones del umbral: «Sin valor de equipo» más el rango del contrato.
    const idleOptions = within(within(section).getByLabelText('Umbral de inactividad')).getAllByRole('option').map((o) => o.getAttribute('value'));
    expect(idleOptions).toEqual(['', ...Array.from({ length: IDLE_MINUTES_MAX - IDLE_MINUTES_MIN + 1 }, (_, i) => String(IDLE_MINUTES_MIN + i))]);

    // Valores iniciales del equipo
    expect(within(section).getByLabelText('Umbral de inactividad')).toHaveValue('');
    expect(within(section).getByLabelText('Lun')).toBeChecked();
    expect(within(section).getByLabelText('Sáb')).not.toBeChecked();
    expect(within(section).getByLabelText('Inicio de la jornada')).toHaveValue('08:00');

    await userEvent.selectOptions(within(section).getByLabelText('Umbral de inactividad'), '10');
    await userEvent.click(within(section).getByLabelText('Sáb'));
    await userEvent.click(within(section).getByLabelText('Vie'));
    fireEvent.change(within(section).getByLabelText('Inicio de la jornada'), { target: { value: '07:30' } });
    fireEvent.change(within(section).getByLabelText('Fin de la jornada'), { target: { value: '17:00' } });
    await userEvent.click(within(section).getByRole('checkbox', { name: /La IA cuenta como tiempo productivo/ }));
    await userEvent.click(within(section).getByRole('checkbox', { name: /Los miembros pueden ver quién está activo/ }));
    await userEvent.selectOptions(within(section).getByLabelText('Tope diario de pausa'), '30');
    await userEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(team, {
        idleMinutes: 10,
        workday: { days: [1, 2, 3, 4, 6], start: '07:30', end: '17:00' },
        aiCountsAsProductive: true,
        presenceVisibleToMembers: true,
        pauseCapMinutes: 30,
      }),
    );
    expect(await within(section).findByRole('status')).toHaveTextContent('Ajustes del equipo guardados.');
    // activeTeam trae los valores nuevos: el formulario sigue mostrándolos tras releer los equipos.
    const mine = (await cloud.myTeams())[0]!;
    expect(mine).toMatchObject({ idleMinutes: 10, aiCountsAsProductive: true, presenceVisibleToMembers: true, pauseCapMinutes: 30 });
    expect(within(section).getByLabelText('Umbral de inactividad')).toHaveValue('10');
  });

  it('el admin guarda «Sin valor de equipo» como idleMinutes null', async () => {
    const { cloud, team } = await teamWith('admin');
    const save = vi.spyOn(cloud, 'setTeamSettings');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('General');
    const section = await screen.findByRole('region', { name: 'Ajustes del equipo' });
    await userEvent.selectOptions(within(section).getByLabelText('Umbral de inactividad'), '5');
    await userEvent.selectOptions(within(section).getByLabelText('Umbral de inactividad'), 'Sin valor de equipo');
    await userEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(team, {
        idleMinutes: null,
        workday: { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' },
        aiCountsAsProductive: false,
        presenceVisibleToMembers: false,
        pauseCapMinutes: 0,
      }),
    );
    expect(within(section).getByRole('option', { name: 'Sin tope' })).toBeInTheDocument();
  });

  it('member y viewer no ven la sección', async () => {
    for (const role of ['member', 'viewer'] as const) {
      const { cloud } = await teamWith(role);
      const view = renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
      await openTab('General');
      expect(await screen.findByRole('region', { name: 'Salir del equipo' })).toBeInTheDocument();
      expect(screen.queryByRole('region', { name: 'Ajustes del equipo' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('sin días o con inicio igual o posterior al fin se muestra el error y no se llama a la nube', async () => {
    const { cloud } = await teamWith('owner');
    const save = vi.spyOn(cloud, 'setTeamSettings');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('General');
    const section = await screen.findByRole('region', { name: 'Ajustes del equipo' });
    const submit = () => userEvent.click(within(section).getByRole('button', { name: 'Guardar cambios' }));

    for (const day of ['Lun', 'Mar', 'Mié', 'Jue', 'Vie']) await userEvent.click(within(section).getByLabelText(day));
    await submit();
    const daysError = await within(section).findByText('Elige al menos un día de la jornada.');
    expect(daysError).toHaveAttribute('role', 'alert');
    for (const day of ['Lun', 'Dom']) {
      const box = within(section).getByLabelText(day);
      expect(box).toHaveAttribute('aria-invalid', 'true');
      expect(box).toHaveAccessibleDescription('Elige al menos un día de la jornada.');
    }

    await userEvent.click(within(section).getByLabelText('Lun'));
    fireEvent.change(within(section).getByLabelText('Inicio de la jornada'), { target: { value: '18:00' } });
    await submit();
    expect(await within(section).findByText('El fin debe ser posterior al inicio.')).toBeInTheDocument();
    expect(within(section).queryByText('Elige al menos un día de la jornada.')).not.toBeInTheDocument();
    expect(within(section).getByLabelText('Fin de la jornada')).toHaveAttribute('aria-invalid', 'true');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('Auditoría (EQ-10, AC-22)', () => {
  const ROWS = 120;
  const seed = async () => {
    const ctx = await teamWith('owner');
    const stranger = crypto.randomUUID();
    const carla = ctx.cloud.debug.addAccount('carla@pulso.test', 'secreto-123', 'Carla');
    ctx.cloud.debug.addMember(ctx.team, carla, 'member', true);
    for (let id = 1; id <= ROWS; id += 1) {
      ctx.cloud.debug.audit.push({
        teamId: ctx.team,
        id,
        action: id % 10 === 0 ? 'settings_changed' : 'invitation_sent',
        actorId: id === ROWS ? stranger : id === ROWS - 1 ? null : ctx.ana,
        targetUserId: id === ROWS - 2 ? carla : null,
        details: {},
        createdAt: new Date(Date.UTC(2026, 9, 1, 8, 0, id)).toISOString(),
      });
    }
    return ctx;
  };

  it('muestra 50 filas, «Cargar más» pide con beforeId y añade las siguientes', async () => {
    const { cloud, team } = await seed();
    const log = vi.spyOn(cloud, 'auditLog');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    const list = await screen.findByRole('list', { name: 'Registro de auditoría' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(AUDIT_PAGE_SIZE);
    expect(log).toHaveBeenLastCalledWith(team, { beforeId: undefined, action: undefined });

    // La más nueva primero; actor ausente = «Exmiembro»; sin actor = «Sistema»; a quién afectó.
    const rows = within(list).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Exmiembro');
    expect(rows[1]).toHaveTextContent('Sistema');
    expect(rows[2]).toHaveTextContent('Ana');
    expect(rows[2]).toHaveTextContent('Afectó a Carla');
    expect(rows[3]).toHaveTextContent('Ana · Envió una invitación');

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2 * AUDIT_PAGE_SIZE));
    // Última fila de la primera página: id 71.
    expect(log).toHaveBeenLastCalledWith(team, { beforeId: ROWS - AUDIT_PAGE_SIZE + 1, action: undefined });

    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(ROWS));
    // La última página trae menos de 50 filas: ya no hay más.
    expect(screen.queryByRole('button', { name: 'Cargar más' })).not.toBeInTheDocument();
  });

  it('el filtro por acción pide solo esa acción', async () => {
    const { cloud, team } = await seed();
    const log = vi.spyOn(cloud, 'auditLog');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    await screen.findByRole('list', { name: 'Registro de auditoría' });
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por acción'), 'settings_changed');
    await waitFor(() => expect(log).toHaveBeenLastCalledWith(team, { beforeId: undefined, action: 'settings_changed' }));
    const list = await screen.findByRole('list', { name: 'Registro de auditoría' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(ROWS / 10));
    for (const row of within(list).getAllByRole('listitem')) expect(row).toHaveTextContent('Cambió los ajustes del equipo');
  });

  it('si falla la carga inicial, muestra el error traducido en lugar de la lista', async () => {
    const { cloud } = await teamWith('admin');
    vi.spyOn(cloud, 'auditLog').mockRejectedValueOnce(new Error('No permitido'));
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo leer la auditoría');
  });

  it('si falla «Cargar más», conserva las filas y ofrece Reintentar que vuelve a pedir la siguiente página', async () => {
    const { cloud, team } = await seed();
    const log = vi.spyOn(cloud, 'auditLog');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    const list = await screen.findByRole('list', { name: 'Registro de auditoría' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(AUDIT_PAGE_SIZE);

    log.mockRejectedValueOnce(new Error('No permitido'));
    await userEvent.click(screen.getByRole('button', { name: 'Cargar más' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar más movimientos');
    expect(within(screen.getByRole('list', { name: 'Registro de auditoría' })).getAllByRole('listitem')).toHaveLength(AUDIT_PAGE_SIZE);

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Registro de auditoría' })).getAllByRole('listitem')).toHaveLength(2 * AUDIT_PAGE_SIZE));
    expect(log).toHaveBeenLastCalledWith(team, { beforeId: ROWS - AUDIT_PAGE_SIZE + 1, action: undefined });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('si falla la lista de miembros, la auditoría se muestra con un nombre de respaldo y un aviso', async () => {
    const { cloud } = await seed();
    vi.spyOn(cloud, 'members').mockRejectedValue(new Error('sin red'));
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    const list = await screen.findByRole('list', { name: 'Registro de auditoría' });
    expect(screen.getByText(/No se pudo leer la lista de miembros/)).toBeInTheDocument();
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(AUDIT_PAGE_SIZE);
    expect(rows[0]).toHaveTextContent('Persona del equipo');
    expect(rows[1]).toHaveTextContent('Sistema');
    expect(list).not.toHaveTextContent('Exmiembro');
  });

  it('un equipo sin movimientos muestra el estado vacío', async () => {
    const { cloud } = await teamWith('owner');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Auditoría');
    expect(await screen.findByText('No hay movimientos con este filtro.')).toBeInTheDocument();
  });

  it('cada valor de AUDIT_ACTIONS tiene texto en español y en inglés', () => {
    const textOf = (dict: typeof es, action: string) => (dict.audit.actions as Record<string, string>)[action];
    for (const action of AUDIT_ACTIONS) {
      expect(textOf(es, action), `es: ${action}`).toBeTruthy();
      expect(textOf(en as typeof es, action), `en: ${action}`).toBeTruthy();
    }
    expect(Object.keys(es.audit.actions).sort()).toEqual([...AUDIT_ACTIONS].sort());
    expect(Object.keys(en.audit.actions).sort()).toEqual([...AUDIT_ACTIONS].sort());
  });
});

describe('Reglas por app (TA-11, AC-23)', () => {
  it('añade «  Code.exe » como «code» con la categoría elegida, lo muestra y reenvía las reglas a Rust', async () => {
    const { cloud, team } = await teamWith('owner');
    const bridge = createMockBridge();
    const rulesSet = vi.spyOn(bridge, 'rulesSet');
    const teamRules = vi.spyOn(cloud, 'teamRules');
    const add = vi.spyOn(cloud, 'addProcessRule');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await openTab('Reglas y políticas');
    const section = await screen.findByRole('region', { name: 'Apps' });
    await waitFor(() => expect(teamRules).toHaveBeenCalled());
    const before = teamRules.mock.calls.length;

    await userEvent.type(within(section).getByLabelText('Nombre del proceso'), '  Code.exe ');
    expect(within(section).getByText('Se guardará como «code»')).toBeInTheDocument();
    await userEvent.selectOptions(within(section).getByLabelText('Categoría'), 'productive');
    await userEvent.click(within(section).getByRole('button', { name: 'Añadir regla' }));

    await waitFor(() => expect(add).toHaveBeenCalledWith(team, '  Code.exe ', 'productive'));
    expect(await cloud.processRules(team)).toEqual([expect.objectContaining({ pattern: 'code', category: 'productive' })]);
    const list = await within(section).findByRole('list', { name: 'Reglas por app' });
    expect(list).toHaveTextContent('code');
    expect(list).toHaveTextContent('Productivo');
    // Se invalidó ['team-rules', …]: session.tsx volvió a leer y Rust recibió la regla nueva.
    await waitFor(() => expect(teamRules.mock.calls.length).toBeGreaterThan(before));
    await waitFor(() =>
      expect(rulesSet).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ match: 'process', pattern: 'code', category: 'productive' })])),
    );
    expect(within(section).getByLabelText('Nombre del proceso')).toHaveValue('');
  });

  it('la lista de apps sale de installedApps() y elegir una rellena el nombre del proceso', async () => {
    const { cloud } = await teamWith('admin');
    const bridge = createMockBridge();
    const installed = vi.spyOn(bridge, 'installedApps');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await openTab('Reglas y políticas');
    const section = await screen.findByRole('region', { name: 'Apps' });
    const picker = await within(section).findByLabelText('App instalada');
    expect(installed).toHaveBeenCalled();
    const labels = (await bridge.installedApps()).map((a) => a.label);
    for (const label of labels) expect(within(picker).getByRole('option', { name: label })).toBeInTheDocument();
    await userEvent.selectOptions(picker, 'slack');
    expect(within(section).getByLabelText('Nombre del proceso')).toHaveValue('slack');
  });

  it('si installedApps() repite un proceso (abierta e instalada), se ofrece una sola vez', async () => {
    const { cloud } = await teamWith('owner');
    const bridge = createMockBridge();
    vi.spyOn(bridge, 'installedApps').mockResolvedValue([
      { process: 'slack', label: 'Slack', source: 'open' },
      { process: 'slack', label: 'Slack', source: 'installed' },
      { process: 'figma', label: 'Figma', source: 'installed' },
    ]);
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await openTab('Reglas y políticas');
    const picker = await screen.findByLabelText('App instalada');
    expect(within(picker).getAllByRole('option').map((o) => o.getAttribute('value'))).toEqual(['', 'slack', 'figma']);
  });

  it('si installedApps() falla, queda solo el texto libre', async () => {
    const { cloud, team } = await teamWith('owner');
    const bridge = createMockBridge();
    vi.spyOn(bridge, 'installedApps').mockRejectedValue(new Error('sin permiso'));
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud, bridge });
    await openTab('Reglas y políticas');
    const section = await screen.findByRole('region', { name: 'Apps' });
    expect(await within(section).findByText(/No se pudo leer la lista de apps/)).toBeInTheDocument();
    expect(within(section).queryByLabelText('App instalada')).not.toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText('Nombre del proceso'), 'Figma');
    await userEvent.click(within(section).getByRole('button', { name: 'Añadir regla' }));
    await waitFor(async () => expect(await cloud.processRules(team)).toEqual([expect.objectContaining({ pattern: 'figma', category: 'distraction' })]));
  });

  it('un nombre vacío muestra el error y no llama a la nube', async () => {
    const { cloud } = await teamWith('owner');
    const add = vi.spyOn(cloud, 'addProcessRule');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Reglas y políticas');
    const section = await screen.findByRole('region', { name: 'Apps' });
    await userEvent.type(within(section).getByLabelText('Nombre del proceso'), ' .exe ');
    await userEvent.click(within(section).getByRole('button', { name: 'Añadir regla' }));
    expect(await within(section).findByText('Escribe el nombre del proceso, por ejemplo code.')).toBeInTheDocument();
    expect(add).not.toHaveBeenCalled();
  });

  it('borrar pide confirmación y llama a removeDomainRule con el id', async () => {
    const { cloud, team } = await teamWith('owner');
    await cloud.addProcessRule(team, 'Slack.exe', 'distraction');
    const [rule] = await cloud.processRules(team);
    const remove = vi.spyOn(cloud, 'removeDomainRule');
    renderWithSession(<EquipoPage />, { path: '/equipo', cloud });
    await openTab('Reglas y políticas');
    const section = await screen.findByRole('region', { name: 'Apps' });
    const list = await within(section).findByRole('list', { name: 'Reglas por app' });
    expect(list).toHaveTextContent('slack');
    await userEvent.click(within(list).getByRole('button', { name: 'Quitar' }));
    expect(remove).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, quitar' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(rule!.id));
    await waitFor(async () => expect(await cloud.processRules(team)).toEqual([]));
    expect(await within(section).findByText('Aún no hay reglas por app.')).toBeInTheDocument();
  });
});
