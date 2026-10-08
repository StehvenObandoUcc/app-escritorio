import { describe, expect, it } from 'vitest';
import type { Task } from '@/cloud/contract';
import {
  bestUnit,
  canComplete,
  canManagePeople,
  canReview,
  canSubmit,
  canTake,
  formatMinutes,
  isOverdue,
  NO_FILTER,
  parseTasksCache,
  nextSteps,
  taskTree,
  timeRatio,
  toMinutes,
} from './tasks';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const PROJECT = '33333333-3333-4333-8333-333333333333';

export const task = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  projectId: PROJECT,
  parentId: null,
  type: 'task',
  title: 't',
  description: '',
  assigneeId: null,
  assigneeCanManage: false,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
  loggedSeconds: 0,
  startedAt: null,
  completedAt: null,
  createdBy: OTHER,
  updatedAt: '2026-10-08T00:00:00Z',
  collaborators: [],
  criteria: [],
  pendingReview: null,
  ...over,
});

const review = (over: Partial<NonNullable<Task['pendingReview']>> = {}): Task['pendingReview'] => ({
  id: crypto.randomUUID(),
  submittedBy: OTHER,
  reviewerId: null,
  answers: {},
  links: [],
  createdAt: '2026-10-08T00:00:00Z',
  attachments: [],
  ...over,
});

describe('filtros y subtareas (PT-05, AC-19)', () => {
  const parent = task({ title: 'madre', assigneeId: OTHER, labels: ['ui'], dueDate: '2026-10-10' });
  const tasks = [
    parent,
    task({ title: 'hija mía', parentId: parent.id, assigneeId: ME }),
    task({ title: 'hija ajena', parentId: parent.id, assigneeId: OTHER }),
    task({ title: 'apoyo', collaborators: [ME], type: 'bug' }),
    task({ title: 'libre', status: 'done' }),
  ];
  const titles = (f: Partial<typeof NO_FILTER>) =>
    taskTree(tasks, { ...NO_FILTER, ...f }, ME).map((x) => [x.task.title, x.children.map((c) => c.title)]);

  it('sin filtro, cada madre con todas sus hijas', () => {
    expect(titles({})).toEqual([
      ['madre', ['hija mía', 'hija ajena']],
      ['apoyo', []],
      ['libre', []],
    ]);
  });

  it('«Mis tareas» incluye las que apoyo y muestra la madre de una hija mía', () => {
    expect(titles({ assignee: 'me' })).toEqual([
      ['madre', ['hija mía']],
      ['apoyo', []],
    ]);
  });

  it('por tipo, estado, etiqueta y fecha límite', () => {
    expect(titles({ type: 'bug' })).toEqual([['apoyo', []]]);
    expect(titles({ status: 'done' })).toEqual([['libre', []]]);
    expect(titles({ label: 'ui' })).toEqual([['madre', []]]);
    expect(titles({ dueUntil: '2026-10-15' })).toEqual([['madre', []]]);
  });
});

describe('estimación con unidad (AC-30, B3)', () => {
  it('convierte a minutos con días de 8 h y semanas de 5 días', () => {
    expect(toMinutes(2, 'd')).toBe(960);
    expect(toMinutes(3, 'w')).toBe(7200);
    expect(toMinutes(1.5, 'h')).toBe(90);
  });

  it('muestra los minutos de forma legible', () => {
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(4000)).toBe('8 d 2 h');
    expect(formatMinutes(7200)).toBe('15 d');
  });

  it('elige la unidad más grande al editar', () => {
    expect(bestUnit(960)).toEqual({ value: 2, unit: 'd' });
    expect(bestUnit(2400)).toEqual({ value: 1, unit: 'w' });
    expect(bestUnit(90)).toEqual({ value: 1.5, unit: 'h' });
    expect(bestUnit(45)).toEqual({ value: 45, unit: 'min' });
  });
});

describe('avance (PT-07)', () => {
  it('compara el tiempo registrado con la estimación y una hecha nunca está vencida', () => {
    expect(timeRatio(1800, 60)).toBe(0.5);
    expect(timeRatio(100, null)).toBeNull();
    expect(isOverdue({ dueDate: '2026-10-01', status: 'todo' }, '2026-10-08')).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-01', status: 'done' }, '2026-10-08')).toBe(false);
  });
});

describe('permisos visibles (filas 19 y 27 a 29)', () => {
  const open = { archivedAt: null };
  const contributor = { ...open, myRole: 'contributor' as const };
  const lead = { ...open, myRole: 'lead' as const };



  it('enviar a revisión: responsable o apoyo con la tarea por hacer o en curso', () => {
    expect(canSubmit(contributor, task({ assigneeId: ME, status: 'doing' }), ME)).toBe(true);
    expect(canSubmit(lead, task({ assigneeId: OTHER }), ME)).toBe(false);
    expect(canSubmit(contributor, task({ assigneeId: ME, status: 'review' }), ME)).toBe(false);
  });

  it('decidir: revisor pedido o quien gestiona; nadie se aprueba a sí mismo salvo quien gestiona', () => {
    expect(canReview(contributor, task({ pendingReview: review({ reviewerId: ME }) }), ME)).toBe(true);
    expect(canReview(contributor, task({ pendingReview: review({ reviewerId: OTHER }) }), ME)).toBe(false);
    expect(canReview(contributor, task({ pendingReview: review({ reviewerId: ME, submittedBy: ME }) }), ME)).toBe(false);
    expect(canReview(lead, task({ pendingReview: review({ submittedBy: ME }) }), ME)).toBe(true);
    expect(canReview(lead, task({}), ME)).toBe(false);
  });

  it('apoyos: quien gestiona, o el responsable si la tarea lo permite', () => {
    expect(canManagePeople(contributor, task({ assigneeId: ME, assigneeCanManage: true }), ME)).toBe(true);
    expect(canManagePeople(contributor, task({ assigneeId: ME }), ME)).toBe(false);
    expect(canManagePeople(lead, task({}), ME)).toBe(true);
  });
});

describe('completar, tomar y el selector de estado (AC-36, AC-37, AC-45)', () => {
  const open = { archivedAt: null };
  const contributor = { ...open, myRole: 'contributor' as const };
  const lead = { ...open, myRole: 'lead' as const };

  it('quien gestiona completa; un colaborador no', () => {
    expect(canComplete(lead, task({}))).toBe(true);
    expect(canComplete(lead, task({ status: 'done' }))).toBe(false);
    expect(canComplete(contributor, task({ assigneeId: ME }))).toBe(false);
  });

  it('se toma una tarea sin responsable, por hacer o en curso, siendo del proyecto', () => {
    expect(canTake(contributor, task({}), true)).toBe(true);
    expect(canTake(contributor, task({ assigneeId: OTHER }), true)).toBe(false);
    expect(canTake(contributor, task({ status: 'review' }), true)).toBe(false);
    expect(canTake(contributor, task({}), false)).toBe(false);
  });

  it('el siguiente paso depende del estado y de quién mira (AC-45 v4)', () => {
    const steps = (p: Parameters<typeof nextSteps>[0], over: Partial<Task>, member = true) => nextSteps(p, task(over), ME, member);
    expect(steps(contributor, { assigneeId: ME })).toEqual({ primary: 'start', secondary: ['submit'] });
    expect(steps(contributor, { assigneeId: ME, status: 'doing' })).toEqual({ primary: 'submit', secondary: [] });
    expect(steps(contributor, {})).toEqual({ primary: 'take', secondary: [] });
    expect(steps(contributor, {}, false)).toEqual({ primary: null, secondary: [] });
    expect(steps(contributor, { assigneeId: OTHER })).toEqual({ primary: null, secondary: [] });
    expect(steps(lead, { assigneeId: OTHER })).toEqual({ primary: 'complete', secondary: ['start'] });
    expect(steps(lead, {})).toEqual({ primary: 'take', secondary: ['start', 'complete'] });
    expect(steps(lead, { assigneeId: ME, status: 'doing' })).toEqual({ primary: 'submit', secondary: ['complete'] });
    expect(steps(lead, { status: 'review', pendingReview: review({}) })).toEqual({ primary: 'review', secondary: [] });
    expect(steps(contributor, { status: 'review', pendingReview: review({ reviewerId: ME }) })).toEqual({ primary: 'review', secondary: [] });
    expect(steps(lead, { status: 'done' })).toEqual({ primary: 'reopen', secondary: [] });
    expect(steps(contributor, { assigneeId: ME, status: 'done' })).toEqual({ primary: null, secondary: [] });
    expect(steps({ archivedAt: 'x', myRole: 'manager' }, {})).toEqual({ primary: null, secondary: [] });
  });

});

describe('copia local (PT-09)', () => {
  it('una copia dañada o de otra forma cuenta como vacía', () => {
    expect(parseTasksCache(null)).toBeNull();
    expect(parseTasksCache('no json')).toBeNull();
    expect(parseTasksCache('{"projects":1}')).toBeNull();
    expect(parseTasksCache(JSON.stringify({ savedAt: 'x', projects: [], tasks: [], members: {} }))).not.toBeNull();
  });
});
