import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type TestDb } from './harness';

/**
 * F6-8: los mensajes del servidor nombran los roles en español (propietario, administrador,
 * miembro, observador, líder), como la interfaz. Equipo: ana (owner), caro (member), vero (viewer).
 */
let db: TestDb;
let ana: string, caro: string, vero: string;
let team: string, project: string;

const ROLE_IN_ENGLISH = /\b(owner|admin|member|viewer|lead)s?\b/;

beforeAll(async () => {
  db = await createTestDb();
  [ana, caro, vero] = await Promise.all(['ana', 'caro', 'vero'].map((n) => db.createUser(`${n}@pulso.test`))) as [string, string, string];
  team = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo') as id")))[0]!.id;
  await db.admin("insert into team_members (team_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'viewer')", [team, caro, vero]);
  project = (await db.as(ana, (q) => q<{ id: string }>("select create_project($1, 'Sitio') as id", [team])))[0]!.id;
});
afterAll(() => db.close());

const expectSpanish = (message: string, expected: string) => {
  expect(message).toBe(expected);
  expect(message).not.toMatch(ROLE_IN_ENGLISH);
};

describe('roles en español en los mensajes del servidor', () => {
  it('el último propietario no puede salir', async () => {
    expectSpanish(
      await failure(() => db.as(ana, (q) => q('select leave_team($1)', [team]))),
      'El equipo debe conservar al menos un propietario',
    );
  });

  it('un observador no entra a proyectos', async () => {
    const text = 'Solo se añaden propietarios, administradores o miembros del equipo; un observador no pertenece a proyectos';
    expectSpanish(await failure(() => db.as(ana, (q) => q("select set_project_member($1, $2, 'contributor')", [project, vero]))), text);
    expectSpanish(
      await failure(() => db.as(ana, (q) => q("select create_task(p_project => $1, p_title => 'X', p_status => 'todo', p_assignee => $2)", [project, vero]))),
      text,
    );
  });

  it('quién genera reportes de proyecto y de equipo', async () => {
    const facts = (scope: string, subject: string) =>
      failure(() => db.as(caro, (q) => q("select get_report_facts($1, $2, $3, 'yesterday')", [team, scope, subject])));
    expectSpanish(await facts('project', project), 'No permitido: el reporte de proyecto lo generan propietarios, administradores o el líder del proyecto');
    expectSpanish(await facts('team', team), 'No permitido: el reporte de equipo lo generan propietarios o administradores');
  });
});
