import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Completar, tomar y borrar (ADR-0016) contra docs/ROLES.md filas 31 a 34 y la spec F3 v3 (AC-36 a AC-41).
 * Equipo A: ana (owner), beto (admin), caro (member, lead), dani (member, colaborador), vero (viewer). Equipo B: eva.
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, vero: string, eva: string;
let teamA: string, project: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const createTask = (q: Query, proj: string, title: string, assignee: string | null = null, parent: string | null = null) =>
  q<{ id: string }>("select create_task(p_project => $1, p_title => $2, p_status => 'todo', p_assignee => $3, p_parent => $4) as id", [
    proj,
    title,
    assignee,
    parent,
  ]).then((r) => r[0]!.id);
const statusOf = (task: string) => db.admin<{ status: string; assignee_id: string | null; completed_at: Date | null }>('select status, assignee_id, completed_at from tasks where id = $1', [task]).then((r) => r[0]);
const complete = (user: string, task: string, answers: object = { summary: 'Hecho' }) =>
  db.as(user, (q) => q('select complete_task($1, $2) as id', [task, JSON.stringify(answers)]));

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani, vero, eva] = (await Promise.all(
    ['ana', 'beto', 'caro', 'dani', 'vero', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  await db.as(eva, (q) => q("select create_team('Equipo B')"));
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'admin', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'member', 'v2', now()), ($1, $5, 'viewer', 'v2', now())`,
    [teamA, beto, caro, dani, vero],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'lead')", [project, caro]));
  await db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
});

afterAll(() => db.close());

describe('completar directamente (fila 32, AC-36)', () => {
  it('quien gestiona completa una tarea sin responsable con el formulario', async () => {
    const id = await db.as(ana, (q) => createTask(q, project, 'Sin responsable'));
    expect(await failure(() => complete(ana, id, {}))).toMatch(/Falta completar «Qué se hizo»/);
    await complete(ana, id, { summary: 'Cerrada por la propietaria' });
    const task = await statusOf(id);
    expect(task!.status).toBe('done');
    expect(task!.completed_at).not.toBeNull();
    const [review] = await db.admin<{ status: string; decided_by: string }>('select status, decided_by from task_reviews where task_id = $1', [id]);
    expect(review).toEqual({ status: 'approved', decided_by: ana });
    const kinds = (await db.admin<{ kind: string }>('select kind from task_events where task_id = $1 order by id', [id])).map((e) => e.kind);
    expect(kinds).toEqual(['created', 'review_submitted', 'review_approved']);
    expect(await failure(() => complete(ana, id))).toMatch(/ya está hecha/);
  });

  it('aprueba la revisión pendiente en lugar de crear otra', async () => {
    const id = await db.as(caro, (q) => createTask(q, project, 'Con revisión', dani));
    await db.as(dani, (q) => q(`select submit_for_review($1, '{"summary": "Listo"}')`, [id]));
    await complete(caro, id, { summary: 'Revisado y aprobado' });
    const reviews = await db.admin<{ status: string }>('select status from task_reviews where task_id = $1', [id]);
    expect(reviews).toEqual([{ status: 'approved' }]);
  });

  it('un colaborador, un viewer o alguien de fuera no completan directamente', async () => {
    const id = await db.as(caro, (q) => createTask(q, project, 'Ajena', dani));
    for (const user of [dani, vero, eva]) {
      expect(await failure(() => complete(user, id))).toMatch(/No permitido/);
    }
  });
});

describe('tomar una tarea (fila 31, AC-37)', () => {
  it('un miembro del proyecto toma una tarea sin responsable; no la de otra persona', async () => {
    const free = await db.as(caro, (q) => createTask(q, project, 'Libre'));
    await db.as(dani, (q) => q('select take_task($1)', [free]));
    expect((await statusOf(free))!.assignee_id).toBe(dani);
    expect(await failure(() => db.as(caro, (q) => q('select take_task($1)', [free])))).toMatch(/ya tiene responsable/);
    const other = await db.as(caro, (q) => createTask(q, project, 'Otra libre'));
    for (const user of [vero, eva]) {
      expect(await failure(() => db.as(user, (q) => q('select take_task($1)', [other])))).toMatch(/No permitido/);
    }
  });
});

describe('formulario de entrega fijo (AC-38)', () => {
  it('«Qué se hizo» no se puede quitar ni volver enlace', async () => {
    const broken = [{ key: 'summary', label: 'Qué se hizo', kind: 'url', required: true }];
    expect(await failure(() => db.as(caro, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(broken)])))).toMatch(/texto obligatorio/);
    const without = [{ key: 'evidence', label: 'Evidencia', kind: 'url', required: true }];
    expect(await failure(() => db.as(caro, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(without)])))).toMatch(/texto obligatorio/);
  });
});

describe('borrar (filas 33 y 34, AC-39, AC-40)', () => {
  it('quien gestiona borra una tarea con sus subtareas; el tiempo se conserva y queda en la auditoría', async () => {
    const parent = await db.as(caro, (q) => createTask(q, project, 'Madre', dani));
    const child = await db.as(caro, (q) => createTask(q, project, 'Hija', dani, parent));
    const entry = randomUUID();
    await db.as(dani, (q) =>
      q(`insert into time_entries (id, team_id, user_id, started_at, ended_at, task_id, source) values ($1, $2, $3, $4, $5, $6, 'timer')`, [
        entry, teamA, dani, minsAgo(30), minsAgo(10), child,
      ]),
    );
    expect(await failure(() => db.as(dani, (q) => q('select delete_task($1)', [parent])))).toMatch(/No permitido/);
    await db.as(caro, (q) => q('select delete_task($1)', [parent]));
    expect(await db.admin('select id from tasks where id in ($1, $2)', [parent, child])).toEqual([]);
    expect((await db.admin<{ task_id: string | null }>('select task_id from time_entries where id = $1', [entry]))[0]!.task_id).toBeNull();
    const audit = await db.admin<{ details: { title: string } }>("select details from audit_log where action = 'task_deleted'");
    expect(audit.map((a) => a.details.title)).toContain('Madre');
  });

  it('solo owner y admin borran un proyecto, escribiendo su nombre exacto', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Temporal') as id", [teamA])))[0]!.id;
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'lead')", [id, caro]));
    await db.as(ana, (q) => createTask(q, id, 'Algo'));
    expect(await failure(() => db.as(caro, (q) => q("select delete_project($1, 'Temporal')", [id])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(beto, (q) => q("select delete_project($1, 'temporal')", [id])))).toMatch(/nombre exacto/);
    await db.as(beto, (q) => q("select delete_project($1, ' Temporal ')", [id]));
    expect(await db.admin('select id from projects where id = $1', [id])).toEqual([]);
    const audit = await db.admin<{ details: { name: string; tasks: number } }>("select details from audit_log where action = 'project_deleted'");
    expect(audit[0]!.details).toMatchObject({ name: 'Temporal', tasks: 1 });
  });
});

describe('evidencia segura (AC-41)', () => {
  it('el tamaño sale de Storage; sin archivo subido no se registra', async () => {
    const id = await db.as(caro, (q) => createTask(q, project, 'Con archivo', dani));
    const path = `${teamA}/${project}/${id}/acta.pdf`;
    expect(await failure(() => db.as(dani, (q) => q("select add_task_attachment($1, $2, 'acta.pdf')", [id, path])))).toMatch(/no se subió/);
    await db.as(dani, (q) => q(`insert into storage.objects (bucket_id, name, metadata) values ('task-evidence', $1, '{"size": 4096}')`, [path]));
    await db.as(dani, (q) => q("select add_task_attachment($1, $2, 'acta.pdf')", [id, path]));
    expect((await db.admin<{ size: number }>('select size from task_attachments where task_id = $1', [id]))[0]!.size).toBe(4096);
    const [bucket] = await db.admin<{ allowed_mime_types: string[] }>("select allowed_mime_types from storage.buckets where id = 'task-evidence'");
    expect(bucket!.allowed_mime_types).toContain('application/pdf');
    expect(bucket!.allowed_mime_types).not.toContain('application/x-msdownload');
  });
});
