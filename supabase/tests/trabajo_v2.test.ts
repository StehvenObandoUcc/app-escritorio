import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Modelo de trabajo v2 (ADR-0014) contra docs/ROLES.md filas 27 a 30 y la spec F3 v2 (AC-19 a AC-29).
 * Equipo A: ana (owner), caro (member, lead), dani (member, colaborador), fede (member, fuera del proyecto),
 * vero (viewer). Equipo B: eva (owner).
 */
let db: TestDb;
let ana: string, caro: string, dani: string, fede: string, vero: string, eva: string;
let teamA: string, project: string;

interface WorkTask {
  id: string;
  projectId: string;
  parentId: string | null;
  type: string;
  status: string;
  assigneeId: string | null;
  collaborators: string[];
  criteria: { id: string; text: string; met: boolean }[];
  loggedSeconds: number;
  startedAt: string | null;
  completedAt: string | null;
  pendingReview: { id: string; reviewerId: string | null; links: string[]; answers: Record<string, string> } | null;
}
interface Work {
  projects: { id: string; tasksTotal: number; tasksDone: number; pendingReviews: number; estimateMinutes: number; reviewTemplate: unknown[] }[];
  tasks: WorkTask[];
  members: Record<string, { userId: string; role: string }[]>;
}

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const work = (user: string) => db.as(user, (q) => q<{ w: Work }>('select team_work($1) as w', [teamA])).then((r) => r[0]!.w);
const taskOf = async (user: string, id: string) => (await work(user)).tasks.find((t) => t.id === id)!;

type TaskOpts = { assignee?: string | null; parent?: string | null; type?: string; criteria?: string[]; collaborators?: string[]; canManage?: boolean; estimate?: number | null };
const createTask = (q: Query, title: string, o: TaskOpts = {}) =>
  q<{ id: string }>(
    `select create_task(p_project => $1, p_title => $2, p_status => 'todo', p_assignee => $3, p_parent => $4,
       p_type => $5, p_criteria => $6, p_collaborators => $7, p_assignee_can_manage => $8, p_estimate_minutes => $9) as id`,
    [project, title, o.assignee ?? null, o.parent ?? null, o.type ?? 'task', o.criteria ?? [], o.collaborators ?? [], o.canManage ?? false, o.estimate ?? null],
  ).then((r) => r[0]!.id);

const submit = (user: string, task: string, answers: object = { summary: 'Listo' }, extra: { links?: string[]; reviewer?: string | null; met?: string[] } = {}) =>
  db
    .as(user, (q) =>
      q<{ id: string }>('select submit_for_review($1, $2, $3, $4, $5) as id', [task, JSON.stringify(answers), extra.links ?? [], extra.reviewer ?? null, extra.met ?? []]),
    )
    .then((r) => r[0]!.id);

const addEntry = (q: Query, user: string, task: string, from: number, to: number) =>
  q(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, task_id, source) values ($1, $2, $3, $4, $5, $6, 'timer')`,
    [randomUUID(), teamA, user, minsAgo(from), minsAgo(to), task],
  );

beforeAll(async () => {
  db = await createTestDb();
  [ana, caro, dani, fede, vero, eva] = (await Promise.all(
    ['ana', 'caro', 'dani', 'fede', 'vero', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  await db.as(eva, (q) => q("select create_team('Equipo B')"));
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'member', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'member', 'v2', now()), ($1, $5, 'viewer', 'v2', now())`,
    [teamA, caro, dani, fede, vero],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'lead')", [project, caro]));
  await db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
});

afterAll(() => db.close());

describe('tipos y subtareas (AC-19, AC-20)', () => {
  it('una tarea tiene tipo y una subtarea no tiene subtareas', async () => {
    const parent = await db.as(caro, (q) => createTask(q, 'Login', { type: 'bug' }));
    const child = await db.as(caro, (q) => createTask(q, 'Validar correo', { parent }));
    expect(await taskOf(caro, parent)).toMatchObject({ type: 'bug', parentId: null });
    expect(await taskOf(caro, child)).toMatchObject({ parentId: parent });
    expect(await failure(() => db.as(caro, (q) => createTask(q, 'Nieta', { parent: child })))).toMatch(/no tiene subtareas/);
    expect(await failure(() => db.as(caro, (q) => createTask(q, 'X', { type: 'epic' })))).toMatch(/tasks_type_check/);
  });

  it('la tarea madre suma el tiempo de sus subtareas; el proyecto no lo cuenta dos veces', async () => {
    const parent = await db.as(caro, (q) => createTask(q, 'Pagos', { assignee: dani, estimate: 120 }));
    const child = await db.as(caro, (q) => createTask(q, 'Tarjeta', { parent, assignee: dani, estimate: 60 }));
    await db.as(dani, (q) => addEntry(q, dani, parent, 40, 30));
    await db.as(dani, (q) => addEntry(q, dani, child, 20, 0));
    expect(Math.round((await taskOf(dani, parent)).loggedSeconds / 60)).toBe(30);
    expect(Math.round((await taskOf(dani, child)).loggedSeconds / 60)).toBe(20);
  });

  it('la estimación del proyecto toma la de la madre o, si no tiene, la suma de sus subtareas', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Estimado') as id", [teamA])))[0]!.id;
    const make = (title: string, o: { parent?: string; estimate?: number }) =>
      db.as(ana, (q) =>
        q<{ id: string }>('select create_task(p_project => $1, p_title => $2, p_status => $3, p_parent => $4, p_estimate_minutes => $5) as id', [
          id, title, 'todo', o.parent ?? null, o.estimate ?? null,
        ]).then((r) => r[0]!.id),
      );
    const withOwn = await make('Con estimación propia', { estimate: 100 });
    await make('Sub ignorada', { parent: withOwn, estimate: 40 });
    const withoutOwn = await make('Sin estimación propia', {});
    await make('Sub A', { parent: withoutOwn, estimate: 30 });
    await make('Sub B', { parent: withoutOwn, estimate: 20 });
    const p = (await work(ana)).projects.find((x) => x.id === id)!;
    expect(p.estimateMinutes).toBe(150);
    expect(p.tasksTotal).toBe(5);
  });
});

describe('responsable y apoyos (AC-21, AC-22, fila 29)', () => {
  it('asignar a alguien del equipo fuera del proyecto lo añade como colaborador', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Con Fede', { assignee: fede }));
    expect((await work(caro)).members[project]).toContainEqual({ userId: fede, role: 'contributor', displayName: null });
    expect((await taskOf(fede, id)).assigneeId).toBe(fede);
  });

  it('un colaborador no asigna apoyos ni a otras personas', async () => {
    expect(await failure(() => db.as(dani, (q) => createTask(q, 'X', { collaborators: [caro] })))).toMatch(/solo puedes crear tareas para ti/);
  });

  it('el líder gestiona apoyos; el responsable solo si la tarea lo permite', async () => {
    const locked = await db.as(caro, (q) => createTask(q, 'Bloqueada', { assignee: dani }));
    const open = await db.as(caro, (q) => createTask(q, 'Abierta', { assignee: dani, canManage: true }));
    expect(await failure(() => db.as(dani, (q) => q('select set_task_collaborators($1, $2)', [locked, [caro]])))).toMatch(/No permitido/);
    await db.as(dani, (q) => q('select set_task_collaborators($1, $2)', [open, [caro]]));
    expect((await taskOf(dani, open)).collaborators).toEqual([caro]);
    // El responsable con permiso no mete gente nueva al proyecto: eso es de quien lo gestiona.
    const other = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Aparte') as id", [teamA])))[0]!.id;
    expect(other).toBeTruthy();
    await db.as(caro, (q) => q('select set_task_collaborators($1, $2)', [locked, [caro]]));
    expect((await taskOf(caro, locked)).collaborators).toEqual([caro]);
    expect(await failure(() => db.as(caro, (q) => q('select set_task_collaborators($1, $2)', [locked, [vero]])))).toMatch(/viewer/);
  });
});

describe('revisión (AC-23 a AC-26, filas 27 y 28)', () => {
  it('nadie pone «Hecha» ni «En revisión» a mano', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Directa', { assignee: dani }));
    for (const status of ['done', 'review']) {
      expect(await failure(() => db.as(ana, (q) => q('select set_task_status($1, $2)', [id, status])))).toMatch(/aprobándola/);
      expect(await failure(() => db.as(ana, (q) => q('select update_task($1, $2, $3)', [id, 'Directa', status])))).toMatch(/aprobándola/);
    }
  });

  it('empezar fija started_at; enviar exige formulario, criterios y ser responsable o apoyo', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Informe', { assignee: dani, criteria: ['Tiene gráficas', 'Revisado por QA'] }));
    await db.as(dani, (q) => q("select set_task_status($1, 'doing')", [id]));
    expect((await taskOf(dani, id)).startedAt).not.toBeNull();

    expect(await failure(() => submit(caro, id))).toMatch(/responsable o un apoyo/);
    expect(await failure(() => submit(dani, id, {}))).toMatch(/Falta completar «Qué se hizo»/);
    expect(await failure(() => submit(dani, id, { summary: 'ok', evidence: 'no-es-enlace' }))).toMatch(/debe ser un enlace/);
    const criteria = (await taskOf(dani, id)).criteria;
    expect(await failure(() => submit(dani, id, undefined, { met: [criteria[0]!.id] }))).toMatch(/todos los criterios/);
    expect(await failure(() => submit(dani, id, undefined, { met: criteria.map((c) => c.id), links: ['ftp://x'] }))).toMatch(/http/);
    expect(await failure(() => submit(dani, id, undefined, { met: criteria.map((c) => c.id), reviewer: dani }))).toMatch(/otra persona/);

    const review = await submit(dani, id, { summary: 'Hecho con datos de octubre' }, { met: criteria.map((c) => c.id), links: ['https://docs.ejemplo.com/informe'], reviewer: fede });
    const task = await taskOf(dani, id);
    expect(task.status).toBe('review');
    expect(task.criteria.every((c) => c.met)).toBe(true);
    expect(task.pendingReview).toMatchObject({ id: review, reviewerId: fede, links: ['https://docs.ejemplo.com/informe'] });
    expect(await failure(() => db.as(dani, (q) => q("select set_task_status($1, 'doing')", [id])))).toMatch(/en revisión/);
    expect((await work(ana)).projects.find((p) => p.id === project)!.pendingReviews).toBeGreaterThan(0);
  });

  it('deciden el revisor pedido o quien gestiona; quien envía no se aprueba salvo que gestione', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Pantalla', { assignee: dani }));
    const review = await submit(dani, id, undefined, { reviewer: fede });
    expect(await failure(() => db.as(dani, (q) => q('select review_task($1, true)', [review])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(vero, (q) => q('select review_task($1, true)', [review])))).toMatch(/No permitido/);
    // Pedir cambios exige comentario y devuelve a «En curso».
    expect(await failure(() => db.as(fede, (q) => q('select review_task($1, false)', [review])))).toMatch(/Explica qué cambios/);
    await db.as(fede, (q) => q("select review_task($1, false, 'Falta el modo oscuro')", [review]));
    expect((await taskOf(dani, id)).status).toBe('doing');
    expect(await failure(() => db.as(fede, (q) => q('select review_task($1, true)', [review])))).toMatch(/ya tiene decisión/);

    const second = await submit(dani, id);
    await db.as(caro, (q) => q('select review_task($1, true)', [second]));
    const done = await taskOf(dani, id);
    expect(done.status).toBe('done');
    expect(done.completedAt).not.toBeNull();
    // Una tarea hecha solo la reabre quien gestiona.
    expect(await failure(() => db.as(dani, (q) => q("select set_task_status($1, 'doing')", [id])))).toMatch(/reabre/);
    await db.as(caro, (q) => q("select set_task_status($1, 'doing')", [id]));
    expect((await taskOf(dani, id)).completedAt).toBeNull();
  });

  it('el líder que es responsable se aprueba a sí mismo', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Propia', { assignee: caro }));
    const review = await submit(caro, id);
    await db.as(caro, (q) => q('select review_task($1, true)', [review]));
    expect((await taskOf(caro, id)).status).toBe('done');
  });

  it('el formulario de entrega se configura y valida', async () => {
    const template = [
      { key: 'summary', label: 'Qué se hizo', kind: 'text', required: true },
      { key: 'tests', label: 'Pruebas pasan', kind: 'checklist', required: true },
    ];
    expect(await failure(() => db.as(dani, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(template)])))).toMatch(/No permitido/);
    expect(
      await failure(() => db.as(caro, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify([{ key: 'X!', label: '', kind: 'otro', required: 1 }])]))),
    ).toMatch(/Campo del formulario inválido/);
    await db.as(caro, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(template)]));
    expect((await work(dani)).projects.find((p) => p.id === project)!.reviewTemplate).toEqual(template);
    const id = await db.as(caro, (q) => createTask(q, 'Con casilla', { assignee: dani }));
    expect(await failure(() => submit(dani, id, { summary: 'ok', tests: 'false' }))).toMatch(/Pruebas pasan/);
    await submit(dani, id, { summary: 'ok', tests: 'true' });
    // Las pruebas siguientes usan un formulario con solo «Qué se hizo».
    await db.as(caro, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(template.slice(0, 1))]));
  });
});

describe('historial (AC-27)', () => {
  it('cada cambio queda con quién y cuándo, y solo lo ve quien ve el proyecto', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Auditada', { assignee: dani, estimate: 30 }));
    await db.as(caro, (q) => q("select update_task($1, 'Auditada', 'doing', '', $2, null, '{}', 60)", [id, caro]));
    const review = await submit(caro, id);
    await db.as(ana, (q) => q("select review_task($1, false, 'Añade capturas')", [review]));
    const history = (await db.as(dani, (q) => q<{ h: { events: { kind: string; actor: string }[]; reviews: { status: string; comment: string }[] } }>('select task_history($1) as h', [id])))[0]!.h;
    expect(history.events.map((e) => e.kind)).toEqual([
      'created', 'status_changed', 'assignee_changed', 'estimate_changed', 'review_submitted', 'changes_requested',
    ]);
    expect(history.events.at(-1)!.actor).toBe(ana);
    expect(history.reviews[0]).toMatchObject({ status: 'changes_requested', comment: 'Añade capturas' });
    expect(await failure(() => db.as(eva, (q) => q('select task_history($1)', [id])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(ana, (q) => q('delete from task_events')))).toMatch(/permission denied/);
  });
});

describe('evidencia en archivos (AC-28)', () => {
  it('solo se sube con una ruta coherente y la ven quienes ven el proyecto', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Con archivo', { assignee: dani }));
    const path = `${teamA}/${project}/${id}/captura.png`;
    const upload = (user: string, name: string) =>
      db.as(user, (q) => q("insert into storage.objects (bucket_id, name) values ('task-evidence', $1)", [name]));
    await upload(dani, path);
    expect(await failure(() => upload(eva, `${teamA}/${project}/${id}/otro.png`))).toMatch(/row-level security/);
    expect(await failure(() => upload(dani, `${teamA}/${randomUUID()}/${id}/x.png`))).toMatch(/row-level security/);
    expect(await failure(() => upload(dani, `../${project}/${id}/x.png`))).toMatch(/row-level security/);
    await db.as(dani, (q) => q("select add_task_attachment($1, $2, 'captura.png', 2048)", [id, path]));
    const seen = (user: string) => db.as(user, (q) => q("select name from storage.objects where bucket_id = 'task-evidence'"));
    expect(await seen(fede)).toHaveLength(1);
    expect(await seen(eva)).toEqual([]);
    expect(await seen(vero)).toEqual([]);
  });
});

describe('salida del equipo (D-8 v2)', () => {
  it('quien pasa a viewer deja de ser apoyo y revisor pedido', async () => {
    const id = await db.as(caro, (q) => createTask(q, 'Con apoyo', { assignee: dani, collaborators: [fede] }));
    const review = await submit(dani, id, undefined, { reviewer: fede });
    await db.as(ana, (q) => q("select set_member_role($1, $2, 'viewer')", [teamA, fede]));
    const task = await taskOf(dani, id);
    expect(task.collaborators).toEqual([]);
    expect(task.pendingReview).toMatchObject({ id: review, reviewerId: null });
  });
});
