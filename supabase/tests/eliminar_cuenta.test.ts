import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type TestDb } from './harness';

/**
 * CU-08, spec F7 (AC-1 a AC-3): `delete_my_account_data` y el borrado de la cuenta de acceso.
 * - «Compartido»: ana (única owner) y beto (member) → ana no puede eliminar su cuenta.
 * - «Solo de Dani»: dani sola → se borra con su cuenta.
 * - «Con Eva»: eva (owner) y dani (admin), con proyecto, tarea, regla, actividad, tiempo y evidencia de dani.
 * - «Dos dueñas»: lo creó dani y lo comparte como owner con fran → dani puede irse.
 */
let db: TestDb;
let ana: string, beto: string, dani: string, eva: string, fran: string;
let shared: string, solo: string, withEva: string, twoOwners: string;
let project: string, task: string;

const createTeam = async (user: string, name: string) =>
  (await db.as(user, (q) => q<{ id: string }>('select create_team($1) as id', [name])))[0]!.id;
const deleteMyData = (user: string | null) => db.service((q) => q('select delete_my_account_data($1)', [user]));

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, dani, eva, fran] = (await Promise.all(
    ['ana', 'beto', 'dani', 'eva', 'fran'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string];

  shared = await createTeam(ana, 'Compartido');
  await db.admin("insert into team_members (team_id, user_id, role) values ($1, $2, 'member')", [shared, beto]);

  solo = await createTeam(dani, 'Solo de Dani');

  withEva = await createTeam(eva, 'Con Eva');
  await db.admin("insert into team_members (team_id, user_id, role) values ($1, $2, 'admin')", [withEva, dani]);
  project = (await db.as(dani, (q) => q<{ id: string }>("select create_project($1, 'Sitio') as id", [withEva])))[0]!.id;
  task = (await db.admin<{ id: string }>(
    "insert into tasks (project_id, team_id, title, created_by) values ($1, $2, 'Portada', $3) returning id",
    [project, withEva, dani],
  ))[0]!.id;
  await db.admin(
    "insert into classification_rules (team_id, priority, match_type, pattern, category, created_by) values ($1, 0, 'process', 'figma', 'productive', $2)",
    [withEva, dani],
  );
  await db.admin(
    `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category)
     values (gen_random_uuid(), $1, $2, now() - interval '1 hour', now(), 'code', 'productive')`,
    [withEva, dani],
  );
  await db.admin(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, task_id, source)
     values (gen_random_uuid(), $1, $2, now() - interval '1 hour', now(), $3, 'timer')`,
    [withEva, dani, task],
  );
  await db.admin(
    "insert into storage.objects (bucket_id, name, owner, owner_id) values ('task-evidence', $1, $2, $3)",
    [`${withEva}/${project}/${task}/captura.png`, dani, dani],
  );

  twoOwners = await createTeam(dani, 'Dos dueñas');
  await db.admin("insert into team_members (team_id, user_id, role) values ($1, $2, 'owner')", [twoOwners, fran]);
});
afterAll(() => db.close());

describe('eliminar mi cuenta (CU-08)', () => {
  it('sin persona no hace nada', async () => {
    expect(await failure(() => deleteMyData(null))).toBe('Debes iniciar sesión');
  });

  it('una sesión no puede llamarla: solo la Edge Function con la clave de servicio', async () => {
    expect(await failure(() => db.as(dani, (q) => q('select delete_my_account_data($1)', [dani])))).toMatch(/permission denied/);
  });

  it('AC-1: la única propietaria de un equipo con más personas no puede eliminarla y no se borra nada', async () => {
    expect(await failure(() => deleteMyData(ana))).toBe(
      'Antes de eliminar tu cuenta, pasa la propiedad de «Compartido» a otra persona',
    );
    const rows = await db.admin('select 1 from team_members where team_id = $1 and user_id = $2', [shared, ana]);
    expect(rows).toHaveLength(1);
  });

  it('AC-2 y AC-3: borra el equipo donde está sola y deja constancia en los demás', async () => {
    await deleteMyData(dani);
    expect(await db.admin('select 1 from teams where id = $1', [solo])).toHaveLength(0);
    const left = await db.admin<{ team_id: string; actor_id: string }>(
      "select team_id, actor_id from audit_log where action = 'member_left' and target_user = $1 order by team_id",
      [dani],
    );
    expect(left.map((r) => r.team_id).sort()).toEqual([withEva, twoOwners].sort());
    expect(left.every((r) => r.actor_id === dani)).toBe(true);
    const files = await db.admin<{ owner: string | null; owner_id: string | null }>('select owner, owner_id from storage.objects');
    expect(files).toEqual([{ owner: null, owner_id: null }]);
  });

  it('AC-3: al borrar la cuenta de acceso, lo del equipo se queda sin creador y lo personal desaparece', async () => {
    await db.admin('delete from auth.users where id = $1', [dani]);
    const createdBy = async (table: string, id: string) =>
      (await db.admin<{ created_by: string | null }>(`select created_by from ${table} where id = $1`, [id]))[0]?.created_by;
    expect(await createdBy('teams', twoOwners)).toBeNull();
    expect(await createdBy('projects', project)).toBeNull();
    expect(await createdBy('tasks', task)).toBeNull();
    expect(await db.admin('select created_by from classification_rules where team_id = $1', [withEva])).toEqual([{ created_by: null }]);
    for (const table of ['activity_blocks', 'time_entries', 'team_members']) {
      expect(await db.admin(`select 1 from ${table} where user_id = $1`, [dani])).toHaveLength(0);
    }
    expect(await db.admin('select 1 from profiles where id = $1', [dani])).toHaveLength(0);
    expect(await db.admin("select actor_id from audit_log where action = 'member_left' and team_id = $1", [withEva])).toEqual([{ actor_id: null }]);
    // Los equipos con más personas siguen.
    expect(await db.admin('select 1 from teams where id = any($1)', [[withEva, twoOwners]])).toHaveLength(2);
  });
});
