import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { CloudError } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { TareasPage } from './TareasPage';

/** Equipo con Ana (owner) y Beto (member). Ana crea «Sitio web» con Beto de colaborador y dos tareas. */
async function setup(as: 'ana' | 'beto' | 'vero' = 'ana') {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
  const vero = cloud.debug.addAccount('vero@pulso.test', 'secreto-123', 'Vero');
  const team = cloud.debug.addTeam('Equipo A', ana);
  cloud.debug.addMember(team, beto, 'member', true);
  cloud.debug.addMember(team, vero, 'viewer', true);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  const project = await cloud.createProject(team, 'Sitio web');
  await cloud.setProjectMember(project, beto, 'contributor');
  const base = { description: '', status: 'todo' as const, dueDate: null, labels: [], estimateMinutes: null };
  const forBeto = await cloud.createTask(project, { ...base, title: 'Portada', assigneeId: beto, labels: ['diseño'], estimateMinutes: 60 });
  const forAna = await cloud.createTask(project, { ...base, title: 'Contrato', assigneeId: ana, dueDate: '2026-10-01' });
  if (as !== 'ana') await cloud.signIn(`${as}@pulso.test`, 'secreto-123');
  return { cloud, team, project, ana, beto, forBeto, forAna };
}

describe('Tareas (F3)', () => {
  it('el owner crea un proyecto y una tarea con todos los campos (AC-1, AC-5)', async () => {
    const { cloud, team } = await setup('ana');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    await userEvent.click(await screen.findByRole('button', { name: 'Nuevo proyecto' }));
    await userEvent.type(screen.getByLabelText('Nombre del proyecto'), 'Interno');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(await screen.findByRole('heading', { name: 'Interno' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nueva tarea' }));
    const form = screen.getByRole('region', { name: 'Nueva tarea' });
    await userEvent.type(within(form).getByLabelText('Título'), 'Plan de pruebas');
    await userEvent.type(within(form).getByLabelText('Descripción'), 'Casos de la puerta G3');
    await userEvent.selectOptions(within(form).getByLabelText('Responsable'), 'Ana');
    await userEvent.selectOptions(within(form).getByLabelText('Estado'), 'doing');
    await userEvent.type(within(form).getByLabelText('Fecha límite'), '2026-10-12');
    await userEvent.type(within(form).getByLabelText('Estimación (minutos)'), '90');
    await userEvent.type(within(form).getByLabelText('Etiquetas'), 'qa, g3');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear tarea' }));

    const list = await screen.findByRole('list', { name: 'Tareas' });
    expect(list).toHaveTextContent('Plan de pruebas');
    const project = (await cloud.myProjects(team)).find((p) => p.name === 'Interno')!;
    expect((await cloud.projectTasks(project.id))[0]).toMatchObject({
      title: 'Plan de pruebas',
      description: 'Casos de la puerta G3',
      status: 'doing',
      dueDate: '2026-10-12',
      estimateMinutes: 90,
      labels: ['g3', 'qa'],
    });
  });

  it('el colaborador ve su tarea en «Mis tareas» y solo cambia el estado de las suyas (AC-6, AC-7)', async () => {
    const { cloud, forBeto } = await setup('beto');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    expect(await screen.findByRole('list', { name: 'Tareas' })).toHaveTextContent('Contrato');
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Responsable'), 'me');
    const list = screen.getByRole('list', { name: 'Tareas' });
    expect(list).toHaveTextContent('Portada');
    expect(list).not.toHaveTextContent('Contrato');
    expect(screen.getByText('1 tarea')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Responsable'), '');
    expect(screen.queryByLabelText('Estado de Contrato')).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado de Portada'), 'doing');
    await waitFor(async () => expect((await cloud.projectTasks((await cloud.myProjects((await cloud.myTeams())[0]!.id))[0]!.id)).find((t) => t.id === forBeto)?.status).toBe('doing'));

    // No edita la tarea: el detalle no ofrece «Editar tarea».
    await userEvent.click(screen.getByRole('button', { name: 'Portada' }));
    expect(screen.getByRole('region', { name: 'Tarea: Portada' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar tarea' })).not.toBeInTheDocument();
  });

  it('en el tablero, cambiar el estado mueve la tarea de columna (AC-10)', async () => {
    const { cloud } = await setup('ana');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    await userEvent.click(await screen.findByRole('tab', { name: 'Tablero' }));
    const todo = screen.getByRole('region', { name: 'Por hacer' });
    expect(todo).toHaveTextContent('Portada');
    await userEvent.selectOptions(within(todo).getByLabelText('Estado de Portada'), 'done');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Hecha' })).toHaveTextContent('Portada'));
    expect(screen.getByRole('region', { name: 'Por hacer' })).not.toHaveTextContent('Portada');
  });

  it('filtra por estado, etiqueta y fecha límite con el conteo (AC-9)', async () => {
    const { cloud } = await setup('ana');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    expect(await screen.findByText('2 tareas')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Etiqueta'), 'diseño');
    expect(screen.getByText('1 tarea')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Etiqueta'), '');
    await userEvent.type(screen.getByLabelText('Vence hasta'), '2026-10-05');
    expect(screen.getByRole('list', { name: 'Tareas' })).toHaveTextContent('Contrato');
    expect(screen.getByText('1 tarea')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'done');
    expect(screen.getByText('0 tareas')).toBeInTheDocument();
  });

  it('el temporizador se inicia sobre la tarea (AC-11, TA-05)', async () => {
    const { cloud, forBeto } = await setup('beto');
    const bridge = createMockBridge();
    const start = vi.spyOn(bridge, 'timerStart');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud, bridge });
    await userEvent.click(await screen.findByRole('button', { name: 'Portada' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar temporizador en esta tarea' }));
    expect(start).toHaveBeenCalledWith(forBeto);
    expect(await screen.findByRole('button', { name: 'Detener temporizador' })).toBeInTheDocument();
  });

  it('sin red se ve la copia guardada, en solo lectura (AC-15)', async () => {
    const { cloud } = await setup('beto');
    const bridge = createMockBridge();
    const first = renderWithSession(<TareasPage />, { path: '/tareas', cloud, bridge });
    expect(await screen.findByRole('list', { name: 'Tareas' })).toHaveTextContent('Portada');
    await waitFor(async () => expect(await bridge.tasksCacheGet()).not.toBeNull());
    first.unmount();

    vi.spyOn(cloud, 'myProjects').mockRejectedValue(new CloudError('Sin conexión con el servidor.', 'network'));
    renderWithSession(<TareasPage />, { path: '/tareas', cloud, bridge });
    expect(await screen.findByText(/Sin conexión: solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Tareas' })).toHaveTextContent('Portada');
    expect(screen.queryByRole('button', { name: 'Nueva tarea' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Estado de Portada')).not.toBeInTheDocument();
  });

  it('el owner ve el avance del proyecto con las cifras de sus tareas (AC-12)', async () => {
    const { cloud } = await setup('ana');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    const progress = await screen.findByRole('region', { name: 'Avance del proyecto' });
    expect(progress).toHaveTextContent('0 de 2 tareas hechas');
    expect(progress).toHaveTextContent('de 1 h estimadas');
  });

  it('un observador no ve proyectos', async () => {
    const { cloud } = await setup('vero');
    renderWithSession(<TareasPage />, { path: '/tareas', cloud });
    expect(await screen.findByText('Los observadores no participan en proyectos')).toBeInTheDocument();
  });
});
