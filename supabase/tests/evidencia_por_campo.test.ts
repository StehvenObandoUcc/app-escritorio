import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Evidencia por campo del formulario de entrega (ADR-0018, AC-49 y AC-50).
 * Equipo A: ana (owner), dani (member, colaborador). Equipo B: eva.
 */
let db: TestDb;
let ana: string, dani: string, eva: string;
let teamA: string, project: string;

const template = [
  { key: 'summary', label: 'Qué se hizo', kind: 'text', required: true },
  { key: 'shots', label: 'Capturas', kind: 'image', required: true },
  { key: 'report', label: 'Informe', kind: 'file', required: false },
  { key: 'link', label: 'Enlace', kind: 'url', required: false },
];

const createTask = (q: Query, title: string, assignee: string | null) =>
  q<{ id: string }>("select create_task(p_project => $1, p_title => $2, p_status => 'doing', p_assignee => $3) as id", [project, title, assignee]).then(
    (r) => r[0]!.id,
  );

/** Sube un archivo a Storage como lo haría la app y lo registra como adjunto sin revisión. */
async function upload(user: string, task: string, name: string, mimetype: string) {
  const path = `${teamA}/${project}/${task}/${name}`;
  await db.as(user, (q) => q(`insert into storage.objects (bucket_id, name, metadata) values ('task-evidence', $1, $2)`, [path, JSON.stringify({ size: 1000, mimetype })]));
  return (await db.as(user, (q) => q<{ id: string }>('select add_task_attachment($1, $2, $3) as id', [task, path, name])))[0]!.id;
}

const submit = (user: string, task: string, answers: object) =>
  db.as(user, (q) => q<{ id: string }>('select submit_for_review($1, $2) as id', [task, JSON.stringify(answers)])).then((r) => r[0]!.id);

beforeAll(async () => {
  db = await createTestDb();
  [ana, dani, eva] = (await Promise.all(['ana', 'dani', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)))) as [string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  await db.as(eva, (q) => q("select create_team('Equipo B')"));
  await db.admin("insert into team_members (team_id, user_id, role, consent_version, consent_at) values ($1, $2, 'member', 'v2', now())", [teamA, dani]);
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  await db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, dani]));
  await db.as(ana, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(template)]));
});

afterAll(() => db.close());

describe('tipos de campo (AC-49)', () => {
  it('el formulario admite imagen y archivo; otro tipo no', async () => {
    const bad = [...template, { key: 'video', label: 'Video', kind: 'video', required: false }];
    expect(await failure(() => db.as(ana, (q) => q('select set_review_template($1, $2)', [project, JSON.stringify(bad)])))).toMatch(/imagen o archivo/);
  });

  it('el formulario por defecto trae un enlace y capturas opcionales', async () => {
    const other = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Por defecto') as id", [teamA])))[0]!.id;
    const [row] = await db.admin<{ t: { key: string; kind: string }[] }>('select review_template($1) as t', [other]);
    expect(row!.t.map((f) => `${f.key}:${f.kind}`)).toEqual(['summary:text', 'evidence:url', 'screenshots:image']);
  });
});

describe('evidencia por campo (AC-50)', () => {
  it('un campo de imagen obligatorio exige una imagen subida por quien envía', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Con capturas', dani));
    expect(await failure(() => submit(dani, task, { summary: 'Listo' }))).toMatch(/Falta completar «Capturas»/);
    const pdf = await upload(dani, task, 'acta.pdf', 'application/pdf');
    expect(await failure(() => submit(dani, task, { summary: 'Listo', shots: pdf }))).toMatch(/solo admite imágenes/);
    expect(await failure(() => submit(dani, task, { summary: 'Listo', shots: 'no-es-un-id' }))).toMatch(/no es válido/);
    const png = await upload(dani, task, 'pantalla.png', 'image/png');
    const review = await submit(dani, task, { summary: 'Listo', shots: png, report: pdf, link: 'https://docs.ejemplo.com' });
    const linked = await db.admin<{ name: string; review_id: string; content_type: string }>('select name, review_id, content_type from task_attachments where task_id = $1 order by name', [task]);
    expect(linked).toEqual([
      { name: 'acta.pdf', review_id: review, content_type: 'application/pdf' },
      { name: 'pantalla.png', review_id: review, content_type: 'image/png' },
    ]);
  });

  it('no se reutiliza el adjunto de otra persona ni uno ya entregado', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Compartida', dani));
    await db.as(ana, (q) => q('select set_task_collaborators($1, $2)', [task, [ana]]));
    const anaImage = await upload(ana, task, 'de-ana.png', 'image/png');
    expect(await failure(() => submit(dani, task, { summary: 'Listo', shots: anaImage }))).toMatch(/no es válido/);
    const mine = await upload(dani, task, 'mia.png', 'image/png');
    await submit(dani, task, { summary: 'Listo', shots: mine });
    await db.as(ana, (q) => q("select review_task((select id from task_reviews where task_id = $1 and status = 'pending'), false, 'Otra vez')", [task]));
    expect(await failure(() => submit(dani, task, { summary: 'Listo', shots: mine }))).toMatch(/no es válido/);
  });

  it('completar directamente también exige la evidencia y la liga a la revisión', async () => {
    const task = await db.as(ana, (q) => createTask(q, 'Directa', null));
    expect(await failure(() => db.as(ana, (q) => q(`select complete_task($1, '{"summary": "Hecho"}')`, [task])))).toMatch(/Capturas/);
    const png = await upload(ana, task, 'final.png', 'image/png');
    await db.as(ana, (q) => q('select complete_task($1, $2)', [task, JSON.stringify({ summary: 'Hecho', shots: png })]));
    const [a] = await db.admin<{ review_id: string | null }>('select review_id from task_attachments where id = $1', [png]);
    expect(a!.review_id).not.toBeNull();
    const work = (await db.as(ana, (q) => q<{ w: { tasks: { id: string; status: string }[] } }>('select team_work($1) as w', [teamA])))[0]!.w;
    expect(work.tasks.find((x) => x.id === task)!.status).toBe('done');
  });
});
