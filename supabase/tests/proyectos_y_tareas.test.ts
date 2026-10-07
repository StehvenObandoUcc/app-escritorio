import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Pruebas de proyectos y tareas (F3) contra docs/ROLES.md filas 13 («P»), 16 a 19
 * y docs/specs/F3-proyectos-y-tareas.md.
 * Equipo A: ana (owner), beto (admin), caro (member, lead del proyecto), dani (member, contributor),
 * fede (member, fuera del proyecto), vero (viewer). Equipo B: eva (owner).
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, fede: string, vero: string, eva: string;
let teamA: string, teamB: string, project: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

const createTask = (q: Query, proj: string, title: string, assignee: string | null = null, estimate: number | null = null) =>
  q<{ id: string }>(
    "select create_task($1, $2, 'todo', 'descripción', $3, '2026-10-20', array['diseño', ' ui ', 'ui'], $4) as id",
    [proj, title, assignee, estimate],
  ).then((r) => r[0]!.id);

const addEntry = (q: Query, team: string, user: string, task: string | null, from: number, to: number | null) =>
  q(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, task_id, source)
     values ($1, $2, $3, $4, $5, $6, 'timer')`,
    [randomUUID(), team, user, minsAgo(from), to === null ? null : minsAgo(to), task],
  );

const visibleProjects = (user: string) =>
  db.as(user, (q) => q<{ name: string }>('select name from my_projects($1)', [teamA])).then((r) => r.map((p) => p.name));

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani, fede, vero, eva] = (await Promise.all(
    ['ana', 'beto', 'caro', 'dani', 'fede', 'vero', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'admin', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'member', 'v2', now()),
       ($1, $5, 'member', 'v2', now()), ($1, $6, 'viewer', 'v2', now())`,
    [teamA, beto, caro, dani, fede, vero],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  await db.as(eva, (q) => q("select give_consent($1, 'v2')", [teamB]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Sitio web') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'lead')", [project, caro]));
  await db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
});

afterAll(() => db.close());

describe('proyectos (filas 16 y 17)', () => {
  it('owner y admin crean proyectos y quedan como lead (AC-1)', async () => {
    const id = (await db.as(beto, (q) => q<{ id: string }>("select create_project($1, 'Interno') as id", [teamA])))[0]!.id;
    const members = await db.as(beto, (q) => q<{ user_id: string; role: string }>('select user_id, role from project_member_list($1)', [id]));
    expect(members).toEqual([{ user_id: beto, role: 'lead' }]);
  });

  it('member, viewer y gente de fuera no crean proyectos (AC-1)', async () => {
    for (const user of [caro, vero, eva]) {
      expect(await failure(() => db.as(user, (q) => q("select create_project($1, 'Otro')", [teamA])))).toMatch(/No permitido/);
    }
  });

  it('un member ve solo sus proyectos; viewer y gente de fuera no ven nada (AC-4)', async () => {
    expect(await visibleProjects(ana)).toEqual(expect.arrayContaining(['Sitio web', 'Interno']));
    expect(await visibleProjects(dani)).toEqual(['Sitio web']);
    expect(await visibleProjects(fede)).toEqual([]);
    expect(await visibleProjects(vero)).toEqual([]);
    expect(await visibleProjects(eva)).toEqual([]);
    expect(await db.as(fede, (q) => q('select id from tasks'))).toEqual([]);
    expect(await failure(() => db.as(eva, (q) => q('select * from project_tasks($1)', [project])))).toMatch(/No permitido/);
  });

  it('lead, owner y admin gestionan miembros; un contributor no; un viewer no entra (AC-3)', async () => {
    await db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, fede]));
    expect(await visibleProjects(fede)).toEqual(['Sitio web']);
    await db.as(beto, (q) => q('select remove_project_member($1, $2)', [project, fede]));
    expect(await visibleProjects(fede)).toEqual([]);
    expect(await failure(() => db.as(dani, (q) => q("select set_project_member($1, $2, 'contributor')", [project, fede])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, vero])))).toMatch(/viewer/);
    expect(await failure(() => db.as(caro, (q) => q("select set_project_member($1, $2, 'contributor')", [project, eva])))).toMatch(/viewer/);
  });

  it('solo owner y admin archivan; archivado no admite cambios hasta desarchivar (AC-2)', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Viejo') as id", [teamA])))[0]!.id;
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'lead')", [id, caro]));
    expect(await failure(() => db.as(caro, (q) => q('select set_project_archived($1, true)', [id])))).toMatch(/No permitido/);
    await db.as(beto, (q) => q('select set_project_archived($1, true)', [id]));
    expect(await failure(() => db.as(caro, (q) => createTask(q, id, 'Nueva')))).toMatch(/archivado/);
    const row = await db.as(caro, (q) => q<{ archived_at: string | null }>('select archived_at from my_projects($1) where id = $2', [teamA, id]));
    expect(row[0]!.archived_at).not.toBeNull();
    await db.as(ana, (q) => q('select set_project_archived($1, false)', [id]));
    await db.as(caro, (q) => createTask(q, id, 'Nueva'));
  });

  it('nadie escribe las tablas directamente', async () => {
    expect(await failure(() => db.as(ana, (q) => q("insert into projects (team_id, name, created_by) values ($1, 'X', $2)", [teamA, ana])))).toMatch(/permission denied/);
    expect(await failure(() => db.as(caro, (q) => q("update tasks set title = 'x'")))).toMatch(/permission denied/);
  });
});

describe('tareas (filas 18 y 19)', () => {
  it('un lead crea una tarea con todos los campos (AC-5)', async () => {
    const id = await db.as(caro, (q) => createTask(q, project, 'Portada', dani, 120));
    const [task] = await db.as(dani, (q) => q('select * from project_tasks($1) where id = $2', [project, id]));
    expect(task).toMatchObject({
      title: 'Portada',
      description: 'descripción',
      assignee_id: dani,
      status: 'todo',
      labels: ['diseño', 'ui'],
      estimate_minutes: 120,
      logged_seconds: 0,
    });
    expect(String(task!.due_date)).toContain('2026');
  });

  it('la tarea asignada aparece entre las de esa persona (AC-6)', async () => {
    const mine = await db.as(dani, (q) => q<{ title: string }>('select title from project_tasks($1) where assignee_id = $2', [project, dani]));
    expect(mine.map((t) => t.title)).toContain('Portada');
  });

  it('un contributor crea tareas para sí o sin responsable, no para otros (AC-7)', async () => {
    await db.as(dani, (q) => createTask(q, project, 'Mía', dani));
    await db.as(dani, (q) => createTask(q, project, 'Sin responsable'));
    expect(await failure(() => db.as(dani, (q) => createTask(q, project, 'Para Caro', caro)))).toMatch(/solo puedes crear tareas para ti/);
  });

  it('un contributor cambia el estado de las suyas, no de las ajenas ni sus campos; un lead sí (AC-7)', async () => {
    const own = await db.as(caro, (q) => createTask(q, project, 'De Dani', dani));
    const other = await db.as(caro, (q) => createTask(q, project, 'De Caro', caro));
    await db.as(dani, (q) => q("select set_task_status($1, 'doing')", [own]));
    expect(await failure(() => db.as(dani, (q) => q("select set_task_status($1, 'done')", [other])))).toMatch(/No permitido/);
    expect(
      await failure(() => db.as(dani, (q) => q("select update_task($1, 'Cambio', 'todo', '', $2)", [own, dani]))),
    ).toMatch(/No permitido/);
    await db.as(caro, (q) => q("select set_task_status($1, 'done')", [other]));
    await db.as(caro, (q) => q("select update_task($1, 'Cambio', 'doing', 'x', $2, null, '{}', 30)", [own, caro]));
    const [row] = await db.as(ana, (q) => q('select title, assignee_id, status from tasks where id = $1', [own]));
    expect(row).toEqual({ title: 'Cambio', assignee_id: caro, status: 'doing' });
  });

  it('un member fuera del proyecto y un viewer no crean tareas', async () => {
    for (const user of [fede, vero, eva]) {
      expect(await failure(() => db.as(user, (q) => createTask(q, project, 'X')))).toMatch(/No permitido/);
    }
  });

  it('solo un miembro del proyecto puede ser responsable (AC-8)', async () => {
    expect(await failure(() => db.as(caro, (q) => createTask(q, project, 'X', fede)))).toMatch(/miembro del proyecto/);
    expect(await failure(() => db.as(ana, (q) => createTask(q, project, 'X', eva)))).toMatch(/miembro del proyecto/);
  });

  it('gana la última modificación y updated_at lo pone el servidor (AC-16, SY-04)', async () => {
    const id = await db.as(caro, (q) => createTask(q, project, 'Conflicto'));
    const before = (await db.admin<{ updated_at: Date }>('select updated_at from tasks where id = $1', [id]))[0]!.updated_at;
    await db.as(caro, (q) => q("select update_task($1, 'Versión A', 'todo')", [id]));
    await db.as(ana, (q) => q("select update_task($1, 'Versión B', 'doing')", [id]));
    const [row] = await db.admin<{ title: string; status: string; updated_at: Date }>('select title, status, updated_at from tasks where id = $1', [id]);
    expect(row).toMatchObject({ title: 'Versión B', status: 'doing' });
    expect(row!.updated_at.getTime()).toBeGreaterThanOrEqual(before.getTime());
  });
});

describe('avance y tiempo (PT-07, PT-08, fila 13 «P»)', () => {
  let estimated: string;

  it('el tiempo sobre una tarea suma a la tarea y al proyecto (AC-11, AC-12)', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Medido') as id", [teamA])))[0]!.id;
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [id, dani]));
    estimated = await db.as(ana, (q) => createTask(q, id, 'Con estimación', dani, 60));
    const done = await db.as(ana, (q) => createTask(q, id, 'Hecha', null, 30));
    await db.as(ana, (q) => q("select set_task_status($1, 'done')", [done]));
    await db.as(dani, (q) => addEntry(q, teamA, dani, estimated, 50, 30));
    await db.as(ana, (q) => addEntry(q, teamA, ana, estimated, 20, 10));
    await db.as(ana, (q) => addEntry(q, teamA, ana, done, 9, 4));

    const tasks = await db.as(dani, (q) => q<{ title: string; logged_seconds: bigint }>('select title, logged_seconds from project_tasks($1)', [id]));
    const byTitle = Object.fromEntries(tasks.map((t) => [t.title, Number(t.logged_seconds)]));
    expect(byTitle['Con estimación']).toBeCloseTo(30 * 60, -1);
    expect(byTitle['Hecha']).toBeCloseTo(5 * 60, -1);

    const [proj] = await db.as(dani, (q) =>
      q<{ tasks_total: bigint; tasks_done: bigint; logged_seconds: bigint; estimate_minutes: bigint }>(
        'select tasks_total, tasks_done, logged_seconds, estimate_minutes from my_projects($1) where id = $2',
        [teamA, id],
      ),
    );
    expect(Number(proj!.tasks_total)).toBe(2);
    expect(Number(proj!.tasks_done)).toBe(1);
    expect(Number(proj!.estimate_minutes)).toBe(90);
    expect(Number(proj!.logged_seconds)).toBe((byTitle['Con estimación'] ?? 0) + (byTitle['Hecha'] ?? 0));

    // Fila 13 «P»: por persona, solo owner, admin y lead.
    const summary = await db.as(ana, (q) =>
      q<{ user_id: string; seconds: bigint }>('select user_id, seconds from project_time_summary($1, $2, now())', [id, minsAgo(120)]),
    );
    expect(Object.fromEntries(summary.map((s) => [s.user_id, Math.round(Number(s.seconds) / 60)]))).toEqual({ [dani]: 20, [ana]: 15 });
    expect(await failure(() => db.as(dani, (q) => q('select * from project_time_summary($1, $2, now())', [id, minsAgo(120)])))).toMatch(/No permitido/);
  });

  it('una entrada no puede apuntar a una tarea de otro equipo (AC-13)', async () => {
    const otherProject = (await db.as(eva, (q) => q<{ id: string }>("select create_project($1, 'De B') as id", [teamB])))[0]!.id;
    const foreign = await db.as(eva, (q) => createTask(q, otherProject, 'Ajena'));
    expect(await failure(() => db.as(dani, (q) => addEntry(q, teamA, dani, foreign, 10, 5)))).toMatch(/no es de este equipo/);
    expect(await failure(() => db.as(dani, (q) => addEntry(q, teamA, dani, randomUUID(), 10, 5)))).toMatch(/no es de este equipo/);
  });

  it('una entrada hecha sin conexión sube aunque la persona ya no vea la tarea', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Temporal') as id", [teamA])))[0]!.id;
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [id, fede]));
    const task = await db.as(ana, (q) => createTask(q, id, 'Breve', fede));
    await db.as(ana, (q) => q('select remove_project_member($1, $2)', [id, fede]));
    await db.as(fede, (q) => addEntry(q, teamA, fede, task, 10, 5));
  });
});

describe('salida del equipo o paso a viewer (AC-18)', () => {
  it('deja los proyectos y sus tareas quedan sin responsable; su tiempo se conserva', async () => {
    const id = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Salida') as id", [teamA])))[0]!.id;
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [id, fede]));
    const task = await db.as(ana, (q) => createTask(q, id, 'De Fede', fede));
    await db.as(fede, (q) => addEntry(q, teamA, fede, task, 30, 20));

    await db.as(ana, (q) => q("select set_member_role($1, $2, 'viewer')", [teamA, fede]));
    expect(await db.admin('select 1 from project_members where project_id = $1 and user_id = $2', [id, fede])).toEqual([]);
    expect((await db.admin<{ assignee_id: string | null }>('select assignee_id from tasks where id = $1', [task]))[0]!.assignee_id).toBeNull();

    await db.as(ana, (q) => q("select set_member_role($1, $2, 'member')", [teamA, fede]));
    await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [id, fede]));
    await db.as(fede, (q) => q('select leave_team($1)', [teamA]));
    expect(await db.admin('select 1 from project_members where user_id = $1', [fede])).toEqual([]);
    const [row] = await db.admin<{ logged_seconds: bigint }>('select task_seconds($1) as logged_seconds', [task]);
    expect(Number(row!.logged_seconds)).toBeGreaterThan(0);
  });
});
