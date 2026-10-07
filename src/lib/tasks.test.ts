import { describe, expect, it } from 'vitest';
import type { Task } from '@/cloud/contract';
import { canChangeStatus, filterTasks, formatMinutes, isOverdue, NO_FILTER, parseTasksCache, timeRatio } from './tasks';

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const task = (over: Partial<Task>): Task => ({
  id: crypto.randomUUID(),
  title: 't',
  description: '',
  assigneeId: null,
  status: 'todo',
  dueDate: null,
  labels: [],
  estimateMinutes: null,
  loggedSeconds: 0,
  createdBy: OTHER,
  updatedAt: '2026-10-08T00:00:00Z',
  ...over,
});

describe('filtros (PT-05)', () => {
  const tasks = [
    task({ title: 'mía', assigneeId: ME, status: 'doing', labels: ['ui'], dueDate: '2026-10-10' }),
    task({ title: 'ajena', assigneeId: OTHER, labels: ['api'], dueDate: '2026-10-20' }),
    task({ title: 'libre', status: 'done' }),
  ];
  const titles = (f: Partial<typeof NO_FILTER>) => filterTasks(tasks, { ...NO_FILTER, ...f }, ME).map((t) => t.title);

  it('por responsable', () => {
    expect(titles({ assignee: 'me' })).toEqual(['mía']);
    expect(titles({ assignee: 'none' })).toEqual(['libre']);
    expect(titles({ assignee: OTHER })).toEqual(['ajena']);
    expect(titles({})).toHaveLength(3);
  });

  it('por estado, etiqueta y fecha límite', () => {
    expect(titles({ status: 'done' })).toEqual(['libre']);
    expect(titles({ label: 'api' })).toEqual(['ajena']);
    expect(titles({ dueUntil: '2026-10-15' })).toEqual(['mía']);
    expect(titles({ assignee: 'me', label: 'api' })).toEqual([]);
  });
});

describe('avance (PT-07)', () => {
  it('compara el tiempo registrado con la estimación', () => {
    expect(timeRatio(1800, 60)).toBe(0.5);
    expect(timeRatio(7200, 60)).toBe(2);
    expect(timeRatio(100, null)).toBeNull();
    expect(formatMinutes(45)).toBe('45 min');
    expect(formatMinutes(90)).toBe('1 h 30 min');
    expect(formatMinutes(120)).toBe('2 h');
  });

  it('una tarea hecha nunca está vencida', () => {
    expect(isOverdue({ dueDate: '2026-10-01', status: 'todo' }, '2026-10-08')).toBe(true);
    expect(isOverdue({ dueDate: '2026-10-01', status: 'done' }, '2026-10-08')).toBe(false);
    expect(isOverdue({ dueDate: null, status: 'todo' }, '2026-10-08')).toBe(false);
  });
});

describe('permisos visibles (fila 19)', () => {
  it('el colaborador cambia el estado solo de las suyas; el líder de todas; nadie en un archivado', () => {
    const open = { archivedAt: null };
    expect(canChangeStatus({ ...open, myRole: 'contributor' }, { assigneeId: ME }, ME)).toBe(true);
    expect(canChangeStatus({ ...open, myRole: 'contributor' }, { assigneeId: OTHER }, ME)).toBe(false);
    expect(canChangeStatus({ ...open, myRole: 'lead' }, { assigneeId: OTHER }, ME)).toBe(true);
    expect(canChangeStatus({ archivedAt: '2026-10-01', myRole: 'manager' }, { assigneeId: ME }, ME)).toBe(false);
  });
});

describe('copia local (PT-09)', () => {
  it('una copia dañada o de otra forma cuenta como vacía', () => {
    expect(parseTasksCache(null)).toBeNull();
    expect(parseTasksCache('no json')).toBeNull();
    expect(parseTasksCache('{"projects":1}')).toBeNull();
    expect(parseTasksCache(JSON.stringify({ savedAt: 'x', projects: [], tasks: {}, members: {} }))).not.toBeNull();
  });
});
