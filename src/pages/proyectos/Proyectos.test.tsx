import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockBridge } from '@/bridge/mock';
import { CloudError, type TaskInput } from '@/cloud/contract';
import { createMockCloud, type MockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { MisTareasPage } from '../tareas/MisTareasPage';
import { ProyectoPage } from './ProyectoPage';
import { ProyectosPage } from './ProyectosPage';
import { TareaPage } from './TareaPage';

const LONG = 20_000;
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
  evidence: [],
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
  const libre = await cloud.createTask(project, { ...base, title: 'Libre' });
  if (as !== 'ana') await cloud.signIn(`${as}@pulso.test`, 'secreto-123');
  return { cloud, team, project, ana, beto, caro, portada, contrato, libre };
}

const taskOf = async (cloud: MockCloud, team: string, id: string) => (await cloud.teamWork(team)).tasks.find((x) => x.id === id);
const openProject = (cloud: MockCloud, project: string, bridge = createMockBridge()) =>
  renderWithSession(<ProyectoPage />, { path: `/proyectos/${project}`, route: '/proyectos/:id', cloud, bridge });
const openTask = (cloud: MockCloud, project: string, task: string, bridge = createMockBridge(), query = '') =>
  renderWithSession(<TareaPage />, { path: `/proyectos/${project}/tareas/${task}${query}`, route: '/proyectos/:id/tareas/:tarea', cloud, bridge });

describe('Proyectos (F3)', () => {
  it('muestra los proyectos en tarjetas y crear uno lleva a su página (AC-1, AC-32)', async () => {
    const { cloud } = await setup('ana');
    renderWithSession(<ProyectosPage />, { path: '/proyectos', cloud });
    expect(await screen.findByRole('link', { name: /Sitio web/ })).toHaveAttribute('href', expect.stringContaining('#/proyectos/'));
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo proyecto' }));
    await userEvent.click(screen.getByRole('button', { name: 'Crear proyecto' }));
    expect(screen.getByLabelText('Nombre del proyecto')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(screen.getByLabelText('Nombre del proyecto'), 'Interno{Enter}');
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(/^\/proyectos\/[0-9a-f-]{36}$/));
  }, LONG);

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
    await userEvent.click(within(form).getByRole('button', { name: 'Crear tarea' }));
    expect(within(form).getByLabelText('Título *')).toHaveFocus();
    await userEvent.type(within(form).getByLabelText('Título *'), 'Migrar base');
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
  }, LONG);

  it('tablero de cuatro columnas con el siguiente paso de cada tarea (AC-10, AC-45 v4)', async () => {
    const { cloud, project, team, contrato, portada } = await setup('ana');
    openProject(cloud, project);
    const todo = await screen.findByRole('region', { name: 'Por hacer' });
    expect(screen.getByRole('region', { name: 'En revisión' })).toBeInTheDocument();
    expect(within(todo).queryByRole('combobox')).not.toBeInTheDocument();
    const card = (title: string) => within(screen.getByRole('button', { name: title }).closest('li')!);
    expect(card('Libre').getByRole('button', { name: 'Tomar tarea' })).toBeInTheDocument();
    await userEvent.click(card('Contrato').getByRole('button', { name: 'Empezar' }));
    await waitFor(() => expect(screen.getByRole('region', { name: 'En curso' })).toHaveTextContent('Contrato'));
    expect((await taskOf(cloud, team, contrato))!.status).toBe('doing');
    await userEvent.click(card('Portada').getByRole('button', { name: 'Completar tarea' }));
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(`/proyectos/${project}/tareas/${portada}?accion=completar`));
  }, LONG);

  it('pestañas y tablero se recorren con las flechas (AC-44)', async () => {
    const { cloud, project } = await setup('ana');
    openProject(cloud, project);
    const board = await screen.findByRole('tab', { name: 'Tablero' });
    board.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Lista' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Lista' })).toHaveAttribute('aria-selected', 'true');
    // Fuera de las pestañas, las flechas mueven el foco por la pantalla (en jsdom, en orden del documento).
    screen.getByRole('button', { name: 'Portada' }).focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Portada' })).not.toHaveFocus();
  }, LONG);

  it('archivar pide confirmación; borrar exige escribir el nombre (AC-33, AC-39)', async () => {
    const { cloud, project, team } = await setup('ana');
    openProject(cloud, project);
    await userEvent.click(await screen.findByRole('button', { name: 'Archivar proyecto' }));
    const archive = await screen.findByRole('dialog', { name: '¿Archivar «Sitio web»?' });
    await userEvent.click(within(archive).getByRole('button', { name: 'Cancelar' }));
    expect((await cloud.teamWork(team)).projects[0]!.archivedAt).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Borrar proyecto' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Borrar «Sitio web»?' });
    const confirm = within(dialog).getByRole('button', { name: 'Borrar proyecto' });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText('Escribe «Sitio web» para confirmar'), 'Sitio web');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent('/proyectos'));
    expect((await cloud.teamWork(team)).projects).toEqual([]);
  }, LONG);

  it('sin red se ve la copia guardada, en solo lectura (AC-15)', async () => {
    const { cloud, project } = await setup('beto');
    const bridge = createMockBridge();
    const first = openProject(cloud, project, bridge);
    expect(await screen.findByRole('region', { name: 'Por hacer' })).toHaveTextContent('Portada');
    await waitFor(async () => expect(await bridge.tasksCacheGet()).not.toBeNull());
    first.unmount();
    vi.spyOn(cloud, 'teamWork').mockRejectedValue(new CloudError('Sin conexión con el servidor.', 'network'));
    openProject(cloud, project, bridge);
    expect(await screen.findByText(/Sin conexión: solo lectura/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nueva tarea' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Estado de Portada')).not.toBeInTheDocument();
  }, LONG);

  it('volver al proyecto lo muestra a él, aunque haya otro antes por orden alfabético (B1)', async () => {
    const { cloud, project, team } = await setup('ana');
    await cloud.createProject(team, 'Aaa vacío');
    openProject(cloud, project);
    expect(await screen.findByRole('heading', { name: 'Sitio web', level: 1 })).toBeInTheDocument();
  });
});

describe('Pantalla de tarea (F3 v3)', () => {
  it('quien gestiona completa directamente una tarea sin responsable (C1, AC-36)', async () => {
    const { cloud, project, team, libre } = await setup('ana');
    openTask(cloud, project, libre);
    await userEvent.click(await screen.findByRole('button', { name: 'Completar tarea' }));
    const form = screen.getByRole('form', { name: 'Completar la tarea' });
    await userEvent.click(within(form).getByRole('button', { name: 'Completar tarea' }));
    const summary = within(form).getByLabelText('Qué se hizo *');
    expect(summary).toHaveFocus();
    expect(summary).toHaveAccessibleDescription('Falta completar «Qué se hizo».');
    await userEvent.type(summary, 'Resuelta en la reunión del lunes');
    await userEvent.click(within(form).getByRole('button', { name: 'Completar tarea' }));
    expect(await screen.findByText('Tarea completada')).toBeInTheDocument();
    expect((await taskOf(cloud, team, libre))!.status).toBe('done');
  }, LONG);

  it('un colaborador toma una tarea sin responsable y la envía con texto, enlace e imagen (C1, AC-37, AC-50)', async () => {
    const { cloud, project, team, libre, beto } = await setup('beto');
    openTask(cloud, project, libre);
    const flow = await screen.findByRole('region', { name: 'Avance de la tarea' });
    expect(within(flow).queryByRole('button', { name: 'Completar tarea' })).not.toBeInTheDocument();
    await userEvent.click(within(flow).getByRole('button', { name: 'Tomar tarea' }));
    expect(await screen.findByText('Ahora eres responsable de la tarea')).toBeInTheDocument();
    expect((await taskOf(cloud, team, libre))!.assigneeId).toBe(beto);
    await userEvent.click(within(screen.getByRole('region', { name: 'Avance de la tarea' })).getByRole('button', { name: 'Enviar a revisión' }));
    const form = screen.getByRole('form', { name: 'Formulario de entrega' });
    await userEvent.type(within(form).getByLabelText('Qué se hizo *'), 'Hecho con texto, no con un enlace');
    await userEvent.type(within(form).getByLabelText('Enlace de evidencia'), 'ftp://no-vale');
    await userEvent.upload(within(form).getByLabelText('Capturas'), new File(['png'], 'pantalla.png', { type: 'image/png' }));
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar a revisión' }));
    expect(within(form).getByLabelText('Enlace de evidencia')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.clear(within(form).getByLabelText('Enlace de evidencia'));
    await userEvent.type(within(form).getByLabelText('Enlace de evidencia'), 'https://figma.com/portada');
    await userEvent.click(within(form).getByRole('button', { name: 'Enviar a revisión' }));
    expect(await screen.findByText('Tarea enviada a revisión')).toBeInTheDocument();
    const sent = (await taskOf(cloud, team, libre))!;
    expect(sent.status).toBe('review');
    expect(sent.pendingReview!.attachments.map((x) => [x.name, x.contentType])).toEqual([['pantalla.png', 'image/png']]);
    expect(sent.pendingReview!.answers.screenshots).toBe(sent.pendingReview!.attachments[0]!.id);
  }, LONG);

  it('el owner pide cambios (comentario obligatorio) y los enlaces se abren con el navegador (AC-25, AC-47)', async () => {
    const { cloud, project, team, portada } = await setup('beto');
    const criterion = (await taskOf(cloud, team, portada))!.criteria[0]!.id;
    await cloud.submitForReview({ id: portada, projectId: project }, team, { answers: { summary: 'Logo nuevo', evidence: 'https://figma.com/portada' }, reviewerId: null, criteriaMet: [criterion], files: {} });
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    const bridge = createMockBridge();
    const open = vi.spyOn(bridge, 'openExternal').mockResolvedValue();
    openTask(cloud, project, portada, bridge);
    const review = await screen.findByRole('region', { name: 'Revisión pendiente' });
    expect(review).toHaveTextContent('Logo nuevo');
    await userEvent.click(within(review).getByRole('button', { name: /figma\.com/ }));
    expect(open).toHaveBeenCalledWith('https://figma.com/portada');
    await userEvent.click(within(review).getByRole('button', { name: 'Pedir cambios' }));
    expect(await within(review).findByRole('alert')).toHaveTextContent('Explica qué cambios hacen falta.');
    await userEvent.type(within(review).getByLabelText('Comentario de la revisión'), 'Falta la versión oscura');
    await userEvent.click(within(review).getByRole('button', { name: 'Pedir cambios' }));
    expect(await screen.findByText('Cambios pedidos: la tarea vuelve a En curso')).toBeInTheDocument();
    expect((await taskOf(cloud, team, portada))!.status).toBe('doing');
  }, LONG);

  it('al crear la tarea se elige la evidencia y la entrega la exige con sus formatos (AC-53, AC-54)', async () => {
    const { cloud, project, team, beto } = await setup('ana');
    const first = openProject(cloud, project);
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva tarea' }));
    const form = screen.getByRole('region', { name: 'Nueva tarea' });
    await userEvent.type(within(form).getByLabelText('Título *'), 'Cierre de mes');
    await waitFor(() => expect(within(form).getByLabelText('Responsable')).toHaveTextContent('Beto'));
    await userEvent.selectOptions(within(form).getByLabelText('Responsable'), 'Beto');
    const evidence = within(form).getByRole('group', { name: 'Evidencia requerida' });
    await userEvent.click(within(evidence).getByLabelText('Hoja de cálculo (Excel o CSV)'));
    await userEvent.click(within(evidence).getByLabelText('Pull request o commit'));
    await userEvent.click(within(form).getByRole('button', { name: 'Crear tarea' }));
    expect(await screen.findByText('Tarea creada')).toBeInTheDocument();
    const created = (await cloud.teamWork(team)).tasks.find((x) => x.title === 'Cierre de mes')!;
    expect([...created.evidence].sort()).toEqual(['code', 'spreadsheet']);
    expect(created.assigneeId).toBe(beto);
    first.unmount();

    await cloud.signIn('beto@pulso.test', 'secreto-123');
    openTask(cloud, project, created.id, createMockBridge(), '?accion=enviar');
    const delivery = await screen.findByRole('form', { name: 'Formulario de entrega' });
    await userEvent.type(within(delivery).getByLabelText('Qué se hizo *'), 'Conciliación lista');
    await userEvent.upload(within(delivery).getByLabelText('Hoja de cálculo (Excel o CSV) *'), new File(['x'], 'cierre.pdf', { type: 'application/pdf' }), { applyAccept: false });
    await userEvent.click(within(delivery).getByRole('button', { name: 'Enviar a revisión' }));
    expect(within(delivery).getByLabelText('Hoja de cálculo (Excel o CSV) *')).toHaveAccessibleDescription(expect.stringContaining('no admite ese tipo'));
    expect(within(delivery).getByLabelText('Pull request o commit *')).toBeInTheDocument();
    await userEvent.upload(
      within(delivery).getByLabelText('Hoja de cálculo (Excel o CSV) *'),
      new File(['x'], 'cierre.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    );
    await userEvent.type(within(delivery).getByLabelText('Pull request o commit *'), 'https://github.com/pulso/pull/7');
    await userEvent.click(within(delivery).getByRole('button', { name: 'Enviar a revisión' }));
    expect(await screen.findByText('Tarea enviada a revisión')).toBeInTheDocument();
    const sent = (await cloud.teamWork(team)).tasks.find((x) => x.id === created.id)!;
    expect(sent.pendingReview!.answers.ev_code).toBe('https://github.com/pulso/pull/7');
    expect(sent.pendingReview!.attachments.map((a) => a.name)).toEqual(['cierre.xlsx']);
  }, LONG);

  it('una subtarea se crea con el mismo formulario completo (C6, AC-19)', async () => {
    const { cloud, project, team, contrato } = await setup('ana');
    openTask(cloud, project, contrato);
    await userEvent.click(await screen.findByRole('button', { name: 'Añadir subtarea' }));
    const form = screen.getByRole('region', { name: 'Nueva subtarea de «Contrato»' });
    expect(form).toHaveTextContent('Subtarea de Contrato');
    expect(within(form).getByLabelText('Descripción')).toBeInTheDocument();
    expect(within(form).getByLabelText('Cantidad estimada')).toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText('Título *'), 'Revisar cláusulas');
    await userEvent.type(within(form).getByLabelText('Etiquetas'), 'legal');
    await userEvent.click(within(form).getByRole('button', { name: 'Crear tarea' }));
    expect(await screen.findByRole('button', { name: 'Revisar cláusulas' })).toBeInTheDocument();
    const sub = (await cloud.teamWork(team)).tasks.find((x) => x.title === 'Revisar cláusulas')!;
    expect(sub).toMatchObject({ parentId: contrato, labels: ['legal'] });
  }, LONG);

  it('editar abre el formulario completo en la pantalla de la tarea; Esc cancela (C7, AC-43)', async () => {
    const { cloud, project, team, contrato } = await setup('ana');
    openTask(cloud, project, contrato);
    await userEvent.click(await screen.findByRole('button', { name: 'Editar tarea' }));
    const title = screen.getByLabelText('Título *');
    expect(title).toHaveValue('Contrato');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByLabelText('Título *')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Editar tarea' }));
    await userEvent.clear(screen.getByLabelText('Título *'));
    await userEvent.type(screen.getByLabelText('Título *'), 'Contrato firmado');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText('Cambios guardados')).toBeInTheDocument();
    expect((await taskOf(cloud, team, contrato))!.title).toBe('Contrato firmado');
  }, LONG);

  it('borrar una tarea pide confirmación y vuelve al proyecto (AC-40)', async () => {
    const { cloud, project, team, libre } = await setup('ana');
    openTask(cloud, project, libre);
    await userEvent.click(await screen.findByRole('button', { name: 'Borrar tarea' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Borrar «Libre»?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Borrar tarea' }));
    await waitFor(() => expect(screen.getByTestId('ruta')).toHaveTextContent(`/proyectos/${project}`));
    expect(await taskOf(cloud, team, libre)).toBeUndefined();
  }, LONG);

  it('el temporizador se inicia sobre la tarea (TA-05)', async () => {
    const { cloud, project, contrato } = await setup('ana');
    const bridge = createMockBridge();
    const start = vi.spyOn(bridge, 'timerStart');
    openTask(cloud, project, contrato, bridge);
    await userEvent.click(await screen.findByRole('button', { name: 'Iniciar temporizador en esta tarea' }));
    expect(start).toHaveBeenCalledWith(contrato);
    expect(await screen.findByRole('button', { name: 'Detener temporizador' })).toBeInTheDocument();
  }, LONG);

  it('?accion=enviar abre directamente el formulario de entrega', async () => {
    const { cloud, project, portada } = await setup('beto');
    openTask(cloud, project, portada, createMockBridge(), '?accion=enviar');
    expect(await screen.findByRole('form', { name: 'Formulario de entrega' })).toBeInTheDocument();
  });
});

describe('Mis tareas (ADR-0014)', () => {
  it('muestra lo asignado y enlaza a la pantalla de la tarea', async () => {
    const { cloud, project, portada } = await setup('beto');
    renderWithSession(<MisTareasPage />, { path: '/tareas', cloud });
    const mine = await screen.findByRole('list', { name: 'Asignadas a mí' });
    expect(mine).toHaveTextContent('Portada');
    expect(mine).not.toHaveTextContent('Contrato');
    expect(within(mine).getByRole('link', { name: 'Portada' })).toHaveAttribute('href', `#/proyectos/${project}/tareas/${portada}`);
  });
});
