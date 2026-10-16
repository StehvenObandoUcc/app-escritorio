import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Evidencia requerida por tarea (ADR-0020, AC-53 y AC-54).
 * Equipo A: ana (owner), dani (member, colaborador), fede (member del proyecto, sin relación con la tarea).
 */
let db: TestDb;
let ana: string, dani: string, fede: string;
let teamA: string, project: string;

const createTask = (q: Query, title: string, assignee: string | null) =>
  q<{ id: string }>("select create_task(p_project => $1, p_title => $2, p_status => 'doing', p_assignee => $3) as id", [project, title, assignee]).then(
    (r) => r[0]!.id,
  );

async function upload(user: string, task: string, name: string, mimetype: string) {
  const path = `${teamA}/${project}/${task}/${name}`;
  await db.as(user, (q) => q(`insert into storage.objects (bucket_id, name, metadata) values ('task-evidence', $1, $2)`, [path, JSON.stringify({ size: 1000, mimetype })]));
  return (await db.as(user, (q) => q<{ id: string }>('select add_task_attachment($1, $2, $3) as id', [task, path, name])))[0]!.id;
}

const submit = (user: string, task: string, answers: object) =>
  db.as(user, (q) => q<{ id: string }>('select submit_for_review($1, $2) as id', [task, JSON.stringify(answers)])).then((r) => r[0]!.id);

beforeAll(async () => {
  db = await createTestDb();
  [ana, dani, fede] = (await Promise.all(['ana', 'dani', 'fede'].map((n) => db.createUser(`${n}@pulso.test`)))) as [string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  await db.admin(
    "insert into team_members (team_id, user_id, role, consent_version, consent_at) values ($1, $2, 'member', 'v2', now()), ($1, $3, 'member', 'v2', now())",
    [teamA, dani, fede],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, fede]));
});

afterAll(() => db.close());

describe('elegir la evidencia de una tarea (AC-53)', () => {
  it('quien gestiona o quien la creó la elige del catálogo; otro colaborador no', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Informe', dani));
    await db.as(ana, (q) => q("select set_task_evidence($1, array['spreadsheet', 'code', 'spreadsheet'])", [task]));
    const [row] = await db.admin<{ evidence: string[] }>('select evidence from tasks where id = $1', [task]);
    expect(row!.evidence).toEqual(['code', 'spreadsheet']);
    expect(await failure(() => db.as(ana, (q) => q("select set_task_evidence($1, array['hologram'])", [task])))).toMatch(/desconocido/);
    expect(await failure(() => db.as(fede, (q) => q("select set_task_evidence($1, array['link'])", [task])))).toMatch(/No permitido/);
    const own = await db.as(dani, (q) => createTask(q, 'Mía', dani));
    await db.as(dani, (q) => q("select set_task_evidence($1, array['screenshot'])", [own]));
    const work = (await db.as(dani, (q) => q<{ w: { tasks: { id: string; evidence: string[] }[] } }>('select team_work($1) as w', [teamA])))[0]!.w;
    expect(work.tasks.find((x) => x.id === own)!.evidence).toEqual(['screenshot']);
  });
});

describe('entregar con la evidencia exigida (AC-54)', () => {
  it('cada evidencia es obligatoria y solo admite sus formatos', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Cierre de mes', dani));
    await db.as(ana, (q) => q("select set_task_evidence($1, array['spreadsheet', 'code'])", [task]));
    expect(await failure(() => submit(dani, task, { summary: 'Listo' }))).toMatch(/Falta completar «Pull request o commit»/);
    const pdf = await upload(dani, task, 'cierre.pdf', 'application/pdf');
    expect(await failure(() => submit(dani, task, { summary: 'Listo', ev_spreadsheet: pdf, ev_code: 'https://github.com/x/pull/1' }))).toMatch(/no admite ese tipo/);
    const xlsx = await upload(dani, task, 'cierre.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(await failure(() => submit(dani, task, { summary: 'Listo', ev_spreadsheet: xlsx, ev_code: 'no-es-enlace' }))).toMatch(/debe ser un enlace/);
    const review = await submit(dani, task, { summary: 'Listo', ev_spreadsheet: xlsx, ev_code: 'https://github.com/x/pull/1' });
    const [a] = await db.admin<{ review_id: string }>('select review_id from task_attachments where id = $1', [xlsx]);
    expect(a!.review_id).toBe(review);
  });

  it('un video de hasta 50 MB entra en la evidencia', async () => {
    const [bucket] = await db.admin<{ file_size_limit: string; allowed_mime_types: string[] }>("select file_size_limit, allowed_mime_types from storage.buckets where id = 'task-evidence'");
    expect(Number(bucket!.file_size_limit)).toBe(52428800);
    expect(bucket!.allowed_mime_types).toEqual(expect.arrayContaining(['video/mp4', 'application/msword', 'application/vnd.ms-excel']));
  });
});
