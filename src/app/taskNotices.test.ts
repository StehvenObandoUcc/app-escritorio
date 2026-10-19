import { describe, expect, it } from 'vitest';
import type { Task, TeamWork } from '@/cloud/contract';
import { snapshotOf, taskNotices } from './taskNotices';

const ME = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const P = '00000000-0000-4000-8000-0000000000aa';
const T = '00000000-0000-4000-8000-0000000000bb';
const R = '00000000-0000-4000-8000-0000000000cc';

const review = (submittedBy: string, reviewerId: string | null) => ({ id: R, submittedBy, reviewerId, answers: {}, links: [], createdAt: '', attachments: [] });
const work = (status: Task['status'], pendingReview: Task['pendingReview'], myRole: 'manager' | 'lead' | 'contributor' = 'contributor'): TeamWork => ({
  projects: [{ id: P, name: 'P', archivedAt: null, myRole, reviewTemplate: [], tasksTotal: 1, tasksDone: 0, pendingReviews: 0, loggedSeconds: 0, estimateMinutes: 0 }],
  tasks: [{ id: T, projectId: P, title: 'Informe', status, pendingReview } as Task],
  members: {},
});

describe('taskNotices (F6-3)', () => {
  it('avisa a quien revisa cuando le envían una tarea', () => {
    expect(taskNotices(snapshotOf(work('doing', null)), work('review', review(OTHER, ME)), ME)).toMatchObject([{ kind: 'toReview', title: 'Informe' }]);
  });
  it('sin revisor elegido avisa a quien gestiona, no a un colaborador', () => {
    const prev = snapshotOf(work('doing', null));
    expect(taskNotices(prev, work('review', review(OTHER, null), 'manager'), ME)).toHaveLength(1);
    expect(taskNotices(prev, work('review', review(OTHER, null)), ME)).toEqual([]);
  });
  it('avisa a quien envió si se la devuelven o la aprueban', () => {
    const prev = snapshotOf(work('review', review(ME, OTHER)));
    expect(taskNotices(prev, work('doing', null), ME)).toMatchObject([{ kind: 'returned' }]);
    expect(taskNotices(prev, work('done', null), ME)).toMatchObject([{ kind: 'approved' }]);
    expect(taskNotices(prev, work('doing', null), OTHER)).toEqual([]);
  });
  it('no repite el aviso si nada cambió', () => {
    const now = work('review', review(OTHER, ME));
    expect(taskNotices(snapshotOf(now), now, ME)).toEqual([]);
  });
});
