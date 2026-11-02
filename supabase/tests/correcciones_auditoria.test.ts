import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Correcciones de la auditoría de base de datos (migración 20261101000001).
 * Equipo A: ana (owner), beto (admin), caro (member, colaboradora), dani (member, colaborador).
 * Proyecto «Plataforma»: caro y dani son colaboradores; ana lo gestiona por ser owner.
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string;
let teamA: string, project: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const inMins = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const createTask = (q: Query, title: string, assignee: string | null = null) =>
  q<{ id: string }>(
    `select create_task(p_project => $1, p_title => $2, p_status => 'todo', p_assignee => $3) as id`,
    [project, title, assignee],
  ).then((r) => r[0]!.id);

const taskSeconds = (task: string) =>
  db.admin<{ s: number }>('select task_seconds($1)::int as s', [task]).then((r) => r[0]!.s);

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani] = (await Promise.all(
    ['ana', 'beto', 'caro', 'dani'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'admin', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'member', 'v2', now())`,
    [teamA, beto, caro, dani],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, caro]));
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
});

afterAll(() => db.close());

describe('1. review_task sin revisor pedido', () => {
  it('un colaborador cualquiera no decide; quien gestiona el proyecto sí', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Login', dani));
    const review = (await db.as(dani, (q) =>
      q<{ id: string }>('select submit_for_review($1, $2, $3, $4, $5) as id', [task, JSON.stringify({ summary: 'Listo' }), [], null, []]),
    ))[0]!.id;
    expect(await failure(() => db.as(caro, (q) => q('select review_task($1, true)', [review])))).toMatch(
      /No permitido: decide el revisor pedido/,
    );
    await db.as(ana, (q) => q('select review_task($1, true)', [review]));
    expect((await db.admin<{ status: string }>('select status from task_reviews where id = $1', [review]))[0]!.status).toBe('approved');
  });
});

describe('3. set_task_evidence con created_by nulo', () => {
  it('un colaborador no la elige; quien gestiona el proyecto sí', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Huérfana'));
    await db.admin('update tasks set created_by = null where id = $1', [task]);
    expect(await failure(() => db.as(caro, (q) => q("select set_task_evidence($1, '{}')", [task])))).toMatch(/No permitido/);
    await db.as(ana, (q) => q("select set_task_evidence($1, '{}')", [task]));
  });
});

describe('4. códigos de invitación de owner y admin', () => {
  it('un admin no ve las invitaciones de owner o admin; el owner sí; el admin ve las de member', async () => {
    await db.as(ana, (q) => q("select * from invite_member($1, 'jefa@pulso.test', 'owner')", [teamA]));
    await db.as(ana, (q) => q("select * from invite_member($1, 'adm@pulso.test', 'admin')", [teamA]));
    await db.as(beto, (q) => q("select * from invite_member($1, 'miembro@pulso.test', 'member')", [teamA]));
    const seen = (user: string) =>
      db.as(user, (q) => q<{ email: string }>('select email, code from invitations where team_id = $1 order by email', [teamA]))
        .then((r) => r.map((x) => x.email));
    expect(await seen(beto)).toEqual(['miembro@pulso.test']);
    expect(await seen(ana)).toEqual(['adm@pulso.test', 'jefa@pulso.test', 'miembro@pulso.test']);
  });
});

describe('5. tiempo por tarea: reloj adelantado y temporizador olvidado', () => {
  it('una entrada que empieza 2 min en el futuro suma 0, no negativo', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Futuro', caro));
    await db.as(caro, (q) =>
      q(`insert into time_entries (id, team_id, user_id, started_at, task_id, source) values ($1, $2, $3, $4, $5, 'timer')`, [
        randomUUID(), teamA, caro, inMins(2), task,
      ]),
    );
    expect(await taskSeconds(task)).toBe(0);
  });

  it('un temporizador abierto hace 72 h cuenta 24 h en task_seconds y team_time_summary', async () => {
    const solo = await db.createUser('solo@pulso.test');
    const teamS = (await db.as(solo, (q) => q<{ id: string }>("select create_team('Solo') as id")))[0]!.id;
    await db.as(solo, (q) => q("select give_consent($1, 'v2')", [teamS]));
    const projectS = (await db.as(solo, (q) => q<{ id: string }>("select create_project($1, 'Proyecto solo') as id", [teamS])))[0]!.id;
    const task = (await db.as(solo, (q) =>
      q<{ id: string }>(`select create_task(p_project => $1, p_title => 'Olvidada', p_status => 'todo') as id`, [projectS]),
    ))[0]!.id;
    await db.as(solo, (q) =>
      q(`insert into time_entries (id, team_id, user_id, started_at, task_id, source) values ($1, $2, $3, $4, $5, 'timer')`, [
        randomUUID(), teamS, solo, minsAgo(72 * 60), task,
      ]),
    );
    expect(await taskSeconds(task)).toBe(86_400);
    const [sum] = await db.as(solo, (q) =>
      q<{ seconds: number }>('select seconds::int as seconds from team_time_summary($1, $2, $3)', [teamS, minsAgo(100 * 60), inMins(10)]),
    );
    expect(sum!.seconds).toBe(86_400);
  });
});

describe('6. reporte personal con sujeto nulo', () => {
  it('se rechaza en vez de devolver las cifras del equipo', async () => {
    expect(
      await failure(() => db.as(dani, (q) => q("select get_report_facts($1, 'personal', null, 'yesterday')", [teamA]))),
    ).toMatch(/No permitido: el reporte personal es solo sobre ti/);
  });
});
