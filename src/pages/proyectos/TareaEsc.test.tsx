import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithSession } from '@/app/testing';
import type { TaskInput } from '@/cloud/contract';
import { createMockCloud } from '@/cloud/mock';
import { CONSENT_VERSION } from '@/lib/consent';
import { TareaPage } from './TareaPage';

const base: TaskInput = {
  title: 'Portada',
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

describe('Tarea: Esc', () => {
  it('Esc mientras se escribe el comentario de la revisión no sale de la tarea ni borra el texto', async () => {
    const cloud = createMockCloud();
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
    const team = cloud.debug.addTeam('Equipo A', ana);
    cloud.debug.addMember(team, beto, 'member', true);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.giveConsent(team, CONSENT_VERSION);
    const project = await cloud.createProject(team, 'Sitio web');
    await cloud.setProjectMember(project, beto, 'contributor');
    const task = await cloud.createTask(project, { ...base, assigneeId: beto });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await cloud.submitForReview({ id: task, projectId: project }, team, { answers: { summary: 'Logo nuevo' }, reviewerId: null, criteriaMet: [], files: {} });
    await cloud.signIn('ana@pulso.test', 'secreto-123');

    const path = `/proyectos/${project}/tareas/${task}`;
    renderWithSession(<TareaPage />, { path, route: '/proyectos/:id/tareas/:tarea', cloud });
    const review = await screen.findByRole('region', { name: 'Revisión pendiente' });
    const comment = within(review).getByLabelText('Comentario de la revisión');
    await userEvent.type(comment, 'Falta la versión oscura');
    await userEvent.keyboard('{Escape}');

    expect(screen.getByTestId('ruta')).toHaveTextContent(path);
    expect(comment).toHaveValue('Falta la versión oscura');
  }, 20_000);
});
