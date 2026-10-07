import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { CloudError, type TaskInput } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { MisTareasPage } from '../tareas/MisTareasPage';
import { ProyectoPage } from './ProyectoPage';
import { ProyectosPage } from './ProyectosPage';

const base: TaskInput = {
  title: '',
  description: '',
  type: 'task',
  assigneeId: null,
  assigneeCanManage: false,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
};

/** Ana (owner), Beto (member, colaborador del proyecto) y Caro (member, fuera del proyecto). */
async function setup(as: 'ana' | 'beto' | 'caro' = 'ana') {
  const cloud = createMockCloud();
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
  const caro = cloud.debug.addAccount('caro@pulso.test', 'secreto-123', 'Caro');
  const team = cloud.debug.addTeam('Equipo A', ana);
  cloud.debug.addMember(team, beto, 'member', true);
  cloud.debug.addMember(team, caro, 'member', true);
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  const project = await cloud.createProject(team, 'Sitio web');
  await cloud.setProjectMember(project, beto, 'contributor');
  const portada = await cloud.createTask(project, { ...base, title: 'Portada', assigneeId: beto, estimateMinutes: 120 }, { criteria: ['Funciona en móvil'] });
  const contrato = await cloud.createTask(project, { ...base, title: 'Contrato', assigneeId: ana, dueDate: '2026-10-01' });
  if (as !== 'ana') await cloud.signIn(`${as}@pulso.test`, 'secreto-123');
  return { cloud, team, project, ana, beto, caro, portada, contrato };
}

const openProject = (cloud: Awaited<ReturnType<typeof setup>>['cloud'], project: string, extra: { bridge?: ReturnType<typeof createMockBridge>; task?: string } = {}) =>
  renderWithSession(<ProyectoPage />, {
    path: `/proyectos/${project}${extra.task ? `?tarea=${extra.task}` : ''}`,
    route: '/proyectos/:id',
    cloud,
    bridge: extra.bridge,
  });

describe('Proyectos (F3 v2)', () => {
  it('muestra los proyectos en tarjetas y crear uno lleva a su página (AC-1, AC-32)', async () => {
    const { cloud } = await setup('ana');
    renderWithSession(<ProyectosPage />, { path: '/proyectos', cloud });
    expect(await screen.findByRole('link', { name: /Sitio web/ })).toHaveAttribute('href', expect.stringContaining('#/proyectos/'));
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo proyecto' }));
    await userEvent.type(screen.getByLabelText('Nombre del proyecto'), 'Interno');
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/proyectos\/[0-9a-f-]{36}$/));
  });

  it('un colaborador no ve «Nuevo proyecto»; alguien fuera de los proyectos ve el estado vacío', async () => {
    const { cloud } = await setup('caro');
    renderWithSession(<ProyectosPage />, { path: '/proyectos', cloud });
    expect(await screen.findByText('Todavía no hay proyectos')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nuevo proyecto' })).not.toBeInTheDocument();
  });

  it('crea una tarea asignada a alguien del equipo fuera del proyecto, estimada en días (AC-21, AC-30)', async () => {
    const { cloud, project, team, caro } = await setup('ana');
    openProject(cloud, project);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva tarea' }));
    const form = screen.getByRole('region', { name: 'Nueva tarea' });
    await userEvent.type(within(form).getByLabelText('Título'), 'Migrar base');
    await userEvent.selectOptions(within(form).getByLabelText('Tipo'), 'improvement');
    await waitFor(() => expect(within(form).getByLabelText('Responsable')).toHaveTextContent('Caro'));
    await userEvent.selectOptions(within(form).getByLabelText('Responsable'), 'Caro');
    await userEvent.type(within(form).getByLabelText('Cantidad estimada'), '2');
    await userEvent.selectOptions(within(form).getByLabelText('Unidad de la estimación'), 'd');
    await userEvent.type(within(form).getByLabelText('Criterios de aceptación'), 'Datos migrados{enter}Sin errores');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear tarea' }));
    expect(await screen.findByText('Tarea creada')).toBeInTheDocument();
    const work = await cloud.teamWork(team);
    const created = work.tasks.find((x) => x.title === 'Migrar base')!;
    expect(created).toMatchObject({ type: 'improvement', assigneeId: caro, estimateMinutes: 960 });
    expect(created.criteria.map((c) => c.text)).toEqual(['Datos migrados', 'Sin errores']);
    expect(work.members[project]!.map((m) => m.userId)).toContain(caro);
  });

  it('tablero de cuatro columnas: el colaborador pasa su tarea a «En curso» (AC-10)', async () => {
    const { cloud, project } = await setup('beto');
    openProject(cloud, project);
    const todo = await screen.findByRole('region', { name: 'Por hacer' });
    expect(screen.getByRole('region', { name: 'En revisión' })).toBeInTheDocument();
    expect(within(todo).queryByLabelText('Estado de Contrato')).not.toBeInTheDocument();
    await userEvent.selectOptions(within(todo).getByLabelText('Estado de Portada'), 'doing');
    await waitFor(() => expect(screen.getByRole('region', { name: 'En curso' })).toHaveTextContent('Portada'));
    expect(within(screen.getByRole('region', { name: 'En curso' })).getByLabelText('Estado de Portada')).not.toHaveTextContent('Hecha');
  });

  it('flujo de revisión: enviar con formulario y criterios, pedir cambios y aprobar (AC-24, AC-25, AC-26)', async () => {
    const { cloud, project, portada, team } = await setup('beto');
    const view = openProject(cloud, project, { task: portada });
    const panel = await screen.findByRole('region', { name: 'Tarea: Portada' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Enviar a revisión' }));
    const form = within(panel).getByRole('form', { name: 'Formulario de entrega' });
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar a revisión' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('Falta completar «Qué se hizo»');
    await userEvent.type(within(form).getByLabelText('Qué se hizo *'), 'Portada con el nuevo logo');
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar a revisión' }));
    expect(await within(form).findByRole('alert')).toHaveTextContent('criterios');
    await userEvent.click(within(form).getByLabelText('Funciona en móvil'));
    await userEvent.type(within(form).getByLabelText('Enlaces de evidencia'), 'https://figma.com/portada');
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar a revisión' }));
    expect(await screen.findByText('Tarea enviada a revisión')).toBeInTheDocument();
    expect((await cloud.teamWork(team)).tasks.find((x) => x.id === portada)!.status).toBe('review');
    view.unmount();

    // El owner pide cambios (con comentario) y luego aprueba.
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    const owner = openProject(cloud, project, { task: portada });
    const ownerPanel = await screen.findByRole('region', { name: 'Tarea: Portada' });
    expect(within(ownerPanel).getByText('Portada con el nuevo logo')).toBeInTheDocument();
    expect(within(ownerPanel).getByRole('link', { name: /figma\.com/ })).toBeInTheDocument();
    await userEvent.type(within(ownerPanel).getByLabelText('Comentario de la revisión'), 'Falta la versión oscura');
    await userEvent.click(within(ownerPanel).getByRole('button', { name: 'Pedir cambios' }));
    expect(await screen.findByText('Cambios pedidos: la tarea vuelve a En curso')).toBeInTheDocument();
    expect((await cloud.teamWork(team)).tasks.find((x) => x.id === portada)!.status).toBe('doing');
    owner.unmount();

    await cloud.signIn('beto@pulso.test', 'secreto-123');
    const criterion = (await cloud.teamWork(team)).tasks.find((x) => x.id === portada)!.criteria[0]!.id;
    const review = await cloud.submitForReview({ id: portada, projectId: project }, team, { answers: { summary: 'Con modo oscuro' }, links: [], reviewerId: null, criteriaMet: [criterion], files: [] });
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.reviewTask(review, true, null);
    const done = (await cloud.teamWork(team)).tasks.find((x) => x.id === portada)!;
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    const history = await cloud.taskHistory(portada);
    expect(history.events.map((e) => e.kind)).toEqual(['created', 'status_changed', 'review_submitted', 'changes_requested', 'review_submitted', 'review_approved'].filter((k) => k !== 'status_changed'));
  });

  it('crea una subtarea desde el panel y la lista la muestra debajo de su madre (AC-19)', async () => {
    const { cloud, project, contrato } = await setup('ana');
    openProject(cloud, project, { task: contrato });
    const panel = await screen.findByRole('region', { name: 'Tarea: Contrato' });
    await userEvent.type(within(panel).getByLabelText('Nueva subtarea'), 'Revisar cláusulas');
    await userEvent.click(within(panel).getByRole('button', { name: 'Añadir subtarea' }));
    expect(await within(panel).findByRole('button', { name: 'Revisar cláusulas' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Lista' }));
    const items = within(screen.getByRole('list', { name: 'Tareas' })).getAllByRole('listitem').map((li) => li.textContent ?? '');
    const parentAt = items.findIndex((x) => x.startsWith('Contrato'));
    expect(items[parentAt + 1]).toMatch(/^Revisar cláusulas/);
  });

  it('el temporizador se inicia sobre la tarea; no en una tarea hecha (TA-05, B13)', async () => {
    const { cloud, project, contrato } = await setup('ana');
    const bridge = createMockBridge();
    const start = vi.spyOn(bridge, 'timerStart');
    openProject(cloud, project, { bridge, task: contrato });
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar temporizador en esta tarea' }));
    expect(start).toHaveBeenCalledWith(contrato);
    expect(await screen.findByRole('button', { name: 'Detener temporizador' })).toBeInTheDocument();
  });

  it('archivar pide confirmación (AC-33)', async () => {
    const { cloud, project, team } = await setup('ana');
    openProject(cloud, project);
    await userEvent.click(await screen.findByRole('tab', { name: 'Ajustes del proyecto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Archivar proyecto' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('¿Archivar «Sitio web»?');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect((await cloud.teamWork(team)).projects[0]!.archivedAt).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Archivar proyecto' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Archivar proyecto' }));
    await waitFor(async () => expect((await cloud.teamWork(team)).projects[0]!.archivedAt).not.toBeNull());
  });

  it('sin red se ve la copia guardada, en solo lectura (AC-15)', async () => {
    const { cloud, project } = await setup('beto');
    const bridge = createMockBridge();
    const first = openProject(cloud, project, { bridge });
    expect(await screen.findByRole('region', { name: 'Por hacer' })).toHaveTextContent('Portada');
    await waitFor(async () => expect(await bridge.tasksCacheGet()).not.toBeNull());
    first.unmount();
    vi.spyOn(cloud, 'teamWork').mockRejectedValue(new CloudError('Sin conexión con el servidor.', 'network'));
    openProject(cloud, project, { bridge });
    expect(await screen.findByText(/Sin conexión: solo lectura/)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Por hacer' })).toHaveTextContent('Portada');
    expect(screen.queryByRole('button', { name: 'Nueva tarea' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Estado de Portada')).not.toBeInTheDocument();
  });

  it('volver al proyecto lo muestra a él, aunque haya otro antes por orden alfabético (B1)', async () => {
    const { cloud, project, team } = await setup('ana');
    await cloud.createProject(team, 'Aaa vacío');
    openProject(cloud, project);
    expect(await screen.findByRole('heading', { name: 'Sitio web', level: 1 })).toBeInTheDocument();
  });
});

describe('Mis tareas (ADR-0014)', () => {
  it('muestra lo asignado o apoyado y lo que me toca revisar', async () => {
    const { cloud, project, team, portada } = await setup('beto');
    const criterion = (await cloud.teamWork(team)).tasks.find((x) => x.id === portada)!.criteria[0]!.id;
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    const helped = await cloud.createTask(project, { ...base, title: 'Apoyo de Beto', assigneeId: null }, { collaborators: [(await cloud.teamWork(team)).members[project]!.find((m) => m.displayName === 'Beto')!.userId] });
    expect(helped).toBeTruthy();
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await cloud.submitForReview({ id: portada, projectId: project }, team, { answers: { summary: 'Listo' }, links: [], reviewerId: null, criteriaMet: [criterion], files: [] });
    renderWithSession(<MisTareasPage />, { path: '/tareas', cloud });
    const mine = await screen.findByRole('list', { name: 'Asignadas a mí' });
    expect(mine).toHaveTextContent('Portada');
    expect(mine).toHaveTextContent('Apoyo de Beto');
    expect(mine).not.toHaveTextContent('Contrato');
    expect(within(mine).getByRole('link', { name: 'Portada' })).toHaveAttribute('href', `#/proyectos/${project}?tarea=${portada}`);
  });
});
