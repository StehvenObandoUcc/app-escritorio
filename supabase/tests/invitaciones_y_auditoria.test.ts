import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Pruebas de la migración de invitaciones, auditoría, consentimiento y cierres (F2)
 * contra docs/ROLES.md (filas 8, 9, 13 y 26) y las decisiones A-1 y A-3 de la spec F2.
 * Equipo A: ana (owner), beto (admin), caro (member), dani (viewer).
 * Equipo B: eva (owner). Invitados: fran, gabi (correo sin verificar), hugo, ines.
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, eva: string;
let fran: string, gabi: string, hugo: string, ines: string;
let teamA: string, teamB: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const inMins = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const invite = (by: string, team: string, email: string, role: string) =>
  db.as(by, (q) => q<{ id: string }>('select invite_member($1, $2, $3) as id', [team, email, role])).then((r) => r[0]!.id);

const myInvitations = (user: string) =>
  db.as(user, (q) => q<{ id: string; team_name: string; role: string }>('select * from my_invitations()'));

const roleOf = async (team: string, user: string) =>
  (await db.admin<{ role: string }>('select role from team_members where team_id = $1 and user_id = $2', [team, user]))[0]?.role;

const auditActions = async (team: string) =>
  (await db.admin<{ action: string }>('select action from audit_log where team_id = $1 order by id', [team])).map((r) => r.action);

const addBlock = (q: Query, team: string, user: string) =>
  q(
    `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category)
     values ($1, $2, $3, $4, $5, 'code', 'productive')`,
    [randomUUID(), team, user, minsAgo(60), minsAgo(30)],
  );

const addEntry = (q: Query, team: string, user: string, start = minsAgo(120), end = minsAgo(60)) =>
  q(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, source)
     values ($1, $2, $3, $4, $5, 'manual')`,
    [randomUUID(), team, user, start, end],
  );

const addClosure = (q: Query, team: string, user: string, id = randomUUID()) =>
  q(
    `insert into app_closures (id, team_id, user_id, closed_at, reopened_at) values ($1, $2, $3, $4, $5)`,
    [id, team, user, minsAgo(90), minsAgo(80)],
  );

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.admin<{ n: string }>(`select count(*) as n from ${sql}`, params))[0]?.n);

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani, eva, fran, gabi, hugo, ines] = (await Promise.all(
    ['ana', 'beto', 'caro', 'dani', 'eva', 'fran', 'gabi', 'hugo', 'ines'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string, string, string, string, string];
  await db.admin('update auth.users set email_confirmed_at = null where id = $1', [gabi]);
  await db.as(ana, (q) => q('insert into profiles (id, display_name) values ($1, $2)', [ana, 'Ana']));

  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'admin', 'v1', now()), ($1, $3, 'member', 'v1', now()), ($1, $4, 'viewer', 'v1', now())`,
    [teamA, beto, caro, dani],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v1')", [teamA]));
  await db.as(eva, (q) => q("select give_consent($1, 'v1')", [teamB]));
});

afterAll(() => db.close());

describe('jornada por defecto (A-1)', () => {
  it('un equipo nuevo nace con jornada de lunes a viernes, de 08:00 a 18:00', async () => {
    const [row] = await db.admin<{ settings: { workday: unknown } }>('select settings from teams where id = $1', [teamA]);
    expect(row!.settings.workday).toEqual({ days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' });
  });
});

describe('consentimiento (PS-02)', () => {
  it('sin consentimiento no se sube actividad, tiempo ni cierres', async () => {
    await db.admin(
      `insert into team_members (team_id, user_id, role) values ($1, $2, 'member')`,
      [teamB, hugo],
    );
    expect(await failure(() => db.as(hugo, (q) => addBlock(q, teamB, hugo)))).toMatch(/row-level security/);
    expect(await failure(() => db.as(hugo, (q) => addEntry(q, teamB, hugo)))).toMatch(/row-level security/);
    expect(await failure(() => db.as(hugo, (q) => addClosure(q, teamB, hugo)))).toMatch(/row-level security/);
  });

  it('al darlo, queda la versión, la fecha y una fila de auditoría; ya puede subir', async () => {
    await db.as(hugo, (q) => q("select give_consent($1, 'v1')", [teamB]));
    const [m] = await db.admin<{ consent_version: string; consent_at: string | null }>(
      'select consent_version, consent_at from team_members where team_id = $1 and user_id = $2',
      [teamB, hugo],
    );
    expect(m!.consent_version).toBe('v1');
    expect(m!.consent_at).not.toBeNull();
    await db.as(hugo, (q) => addBlock(q, teamB, hugo));
    expect(await auditActions(teamB)).toContain('consent_given');
  });

  it('no se da en un equipo ajeno ni con una versión vacía', async () => {
    expect(await failure(() => db.as(fran, (q) => q("select give_consent($1, 'v1')", [teamA])))).toMatch(/No perteneces/);
    expect(await failure(() => db.as(caro, (q) => q("select give_consent($1, '  ')", [teamA])))).toMatch(/inválida/);
  });
});

describe('invitar personas (fila 8)', () => {
  it('el owner invita con cualquier rol y el correo se guarda en minúsculas', async () => {
    const id = await invite(ana, teamA, ' Fran@Pulso.Test ', 'admin');
    const [row] = await db.admin<{ email: string; status: string; expires_at: Date; created_at: Date }>(
      'select email, status, expires_at, created_at from invitations where id = $1',
      [id],
    );
    expect(row!.email).toBe('fran@pulso.test');
    expect(row!.status).toBe('pending');
    // vence a los 7 días
    expect(new Date(row!.expires_at).getTime() - new Date(row!.created_at).getTime()).toBe(7 * 24 * 3600 * 1000);
    await db.as(ana, (q) => q('select revoke_invitation($1)', [id]));
  });

  it('el admin invita member o viewer, pero no admin ni owner', async () => {
    const id = await invite(beto, teamA, 'ines@pulso.test', 'viewer');
    expect(id).toBeTruthy();
    expect(await failure(() => invite(beto, teamA, 'otra@pulso.test', 'admin'))).toMatch(/No permitido/);
    expect(await failure(() => invite(beto, teamA, 'otra@pulso.test', 'owner'))).toMatch(/No permitido/);
    await db.as(beto, (q) => q('select revoke_invitation($1)', [id]));
  });

  it('member, viewer, gente de fuera y anon no invitan', async () => {
    for (const user of [caro, dani, eva]) {
      expect(await failure(() => invite(user, teamA, 'otra@pulso.test', 'member'))).toMatch(/No permitido/);
    }
    expect(await failure(() => db.as(null, (q) => q("select invite_member($1, 'x@pulso.test', 'member')", [teamA])))).toMatch(
      /permission denied/,
    );
  });

  it('no invita a quien ya es miembro ni duplica una invitación pendiente', async () => {
    expect(await failure(() => invite(ana, teamA, 'caro@pulso.test', 'member'))).toMatch(/ya pertenece/);
    const id = await invite(ana, teamA, 'dup@pulso.test', 'member');
    expect(await failure(() => invite(ana, teamA, 'dup@pulso.test', 'viewer'))).toMatch(/pendiente/);
    await db.as(ana, (q) => q('select revoke_invitation($1)', [id]));
  });

  it('una invitación vencida no impide invitar de nuevo', async () => {
    const id = await invite(ana, teamA, 'vieja@pulso.test', 'member');
    await db.admin("update invitations set expires_at = now() - interval '1 minute' where id = $1", [id]);
    const again = await invite(ana, teamA, 'vieja@pulso.test', 'member');
    expect(again).not.toBe(id);
    const [old] = await db.admin<{ status: string }>('select status from invitations where id = $1', [id]);
    expect(old!.status).toBe('expired');
  });

  it('owner y admin ven las invitaciones del equipo; member, viewer y gente de fuera no', async () => {
    for (const user of [ana, beto]) {
      expect((await db.as(user, (q) => q('select id from invitations'))).length).toBeGreaterThan(0);
    }
    for (const user of [caro, dani, eva]) {
      expect(await db.as(user, (q) => q('select id from invitations where team_id = $1', [teamA]))).toHaveLength(0);
    }
  });

  it('nadie escribe la tabla de invitaciones directamente', async () => {
    expect(
      await failure(() =>
        db.as(ana, (q) => q("insert into invitations (team_id, email, role) values ($1, 'x@pulso.test', 'member')", [teamA])),
      ),
    ).toMatch(/permission denied/);
  });
});

describe('aceptar o rechazar una invitación (EQ-03)', () => {
  it('la persona invitada la ve al iniciar sesión con ese correo', async () => {
    await invite(ana, teamA, 'fran@pulso.test', 'member');
    const list = await myInvitations(fran);
    expect(list).toHaveLength(1);
    expect(list[0]!.team_name).toBe('Equipo A');
    expect(list[0]!.role).toBe('member');
    // otra persona no la ve
    expect(await myInvitations(eva)).toHaveLength(0);
  });

  it('con otro correo no se puede aceptar ni rechazar', async () => {
    const [inv] = await myInvitations(fran);
    expect(await failure(() => db.as(eva, (q) => q("select accept_invitation($1, 'v1')", [inv!.id])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(eva, (q) => q('select decline_invitation($1)', [inv!.id])))).toMatch(/No permitido/);
  });

  it('sin consentimiento no se acepta', async () => {
    const [inv] = await myInvitations(fran);
    expect(await failure(() => db.as(fran, (q) => q("select accept_invitation($1, '')", [inv!.id])))).toMatch(/consentimiento/);
  });

  it('al aceptar entra con el rol indicado, con consentimiento, y queda auditado', async () => {
    const [inv] = await myInvitations(fran);
    await db.as(fran, (q) => q("select accept_invitation($1, 'v1')", [inv!.id]));
    expect(await roleOf(teamA, fran)).toBe('member');
    const [m] = await db.admin<{ consent_at: string | null }>(
      'select consent_at from team_members where team_id = $1 and user_id = $2',
      [teamA, fran],
    );
    expect(m!.consent_at).not.toBeNull();
    expect(await myInvitations(fran)).toHaveLength(0);
    expect(await auditActions(teamA)).toContain('invitation_accepted');
    // y ya puede subir su actividad
    await db.as(fran, (q) => addBlock(q, teamA, fran));
  });

  it('una invitación ya usada no se vuelve a aceptar', async () => {
    const [row] = await db.admin<{ id: string }>("select id from invitations where email = 'fran@pulso.test' and status = 'accepted'");
    expect(await failure(() => db.as(fran, (q) => q("select accept_invitation($1, 'v1')", [row!.id])))).toMatch(/ya no está pendiente/);
  });

  it('con el correo sin verificar no ve ni acepta invitaciones', async () => {
    const id = await invite(eva, teamB, 'gabi@pulso.test', 'member');
    expect(await myInvitations(gabi)).toHaveLength(0);
    expect(await failure(() => db.as(gabi, (q) => q("select accept_invitation($1, 'v1')", [id])))).toMatch(/Verifica tu correo/);
  });

  it('una invitación vencida no se acepta', async () => {
    const id = await invite(eva, teamB, 'ines@pulso.test', 'viewer');
    await db.admin("update invitations set expires_at = now() - interval '1 minute' where id = $1", [id]);
    expect(await myInvitations(ines)).toHaveLength(0);
    expect(await failure(() => db.as(ines, (q) => q("select accept_invitation($1, 'v1')", [id])))).toMatch(/venció/);
  });

  it('al rechazarla desaparece y queda auditado', async () => {
    const id = await invite(eva, teamB, 'ines@pulso.test', 'viewer');
    await db.as(ines, (q) => q('select decline_invitation($1)', [id]));
    expect(await myInvitations(ines)).toHaveLength(0);
    expect(await roleOf(teamB, ines)).toBeUndefined();
    expect(await auditActions(teamB)).toContain('invitation_declined');
  });

  it('una invitación revocada no se acepta', async () => {
    const id = await invite(eva, teamB, 'ines@pulso.test', 'member');
    await db.as(eva, (q) => q('select revoke_invitation($1)', [id]));
    expect(await failure(() => db.as(ines, (q) => q("select accept_invitation($1, 'v1')", [id])))).toMatch(/ya no está pendiente/);
    expect(await auditActions(teamB)).toContain('invitation_revoked');
  });

  it('el admin no revoca invitaciones de admin; el member no revoca ninguna', async () => {
    const id = await invite(ana, teamA, 'nuevo-admin@pulso.test', 'admin');
    expect(await failure(() => db.as(beto, (q) => q('select revoke_invitation($1)', [id])))).toMatch(/No permitido/);
    expect(await failure(() => db.as(caro, (q) => q('select revoke_invitation($1)', [id])))).toMatch(/No permitido/);
    await db.as(ana, (q) => q('select revoke_invitation($1)', [id]));
  });
});

describe('ceder la propiedad (EQ-06)', () => {
  it('el owner nombra a otro owner, se degrada y el equipo nunca queda sin owner', async () => {
    const teamC = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo C') as id")))[0]!.id;
    const id = await invite(eva, teamC, 'hugo@pulso.test', 'member');
    await db.as(hugo, (q) => q("select accept_invitation($1, 'v1')", [id]));
    await db.as(eva, (q) => q("select set_member_role($1, $2, 'owner')", [teamC, hugo]));
    await db.as(eva, (q) => q("select set_member_role($1, $2, 'member')", [teamC, eva]));
    expect(await roleOf(teamC, hugo)).toBe('owner');
    expect(await roleOf(teamC, eva)).toBe('member');
    expect(await failure(() => db.as(hugo, (q) => q("select set_member_role($1, $2, 'member')", [teamC, hugo])))).toMatch(
      /al menos un owner/,
    );
  });
});

describe('registro de auditoría (fila 9)', () => {
  it('crear el equipo, cambiar roles, expulsar y salir quedan registrados con quién lo hizo', async () => {
    await db.as(ana, (q) => q("select set_member_role($1, $2, 'viewer')", [teamA, fran]));
    await db.as(ana, (q) => q("select set_member_role($1, $2, 'member')", [teamA, fran]));
    const [row] = await db.admin<{ actor_id: string; target_user: string; details: { from: string; to: string } }>(
      "select actor_id, target_user, details from audit_log where team_id = $1 and action = 'role_changed' order by id limit 1",
      [teamA],
    );
    expect(row).toMatchObject({ actor_id: ana, target_user: fran, details: { from: 'member', to: 'viewer' } });
    expect(await auditActions(teamA)).toContain('team_created');
  });

  it('owner y admin leen el registro; member, viewer y gente de fuera no', async () => {
    for (const user of [ana, beto]) {
      expect((await db.as(user, (q) => q('select id from audit_log where team_id = $1', [teamA]))).length).toBeGreaterThan(0);
    }
    for (const user of [caro, dani, eva]) {
      expect(await db.as(user, (q) => q('select id from audit_log where team_id = $1', [teamA]))).toHaveLength(0);
    }
    expect(await failure(() => db.as(null, (q) => q('select id from audit_log')))).toMatch(/permission denied/);
  });

  it('nadie escribe ni borra el registro directamente', async () => {
    expect(
      await failure(() => db.as(ana, (q) => q("insert into audit_log (team_id, action) values ($1, 'team_created')", [teamA]))),
    ).toMatch(/permission denied/);
    expect(await failure(() => db.as(ana, (q) => q('delete from audit_log where team_id = $1', [teamA])))).toMatch(/permission denied/);
  });
});

describe('cierres de Pulso dentro de la jornada (A-1, fila 26)', () => {
  it('owner, admin y member suben sus cierres; el viewer no', async () => {
    for (const user of [ana, beto, caro]) {
      await db.as(user, (q) => addClosure(q, teamA, user));
    }
    expect(await failure(() => db.as(dani, (q) => addClosure(q, teamA, dani)))).toMatch(/row-level security/);
  });

  it('subir dos veces el mismo cierre no lo duplica', async () => {
    const id = randomUUID();
    const upsert = (q: Query) =>
      q(
        `insert into app_closures (id, team_id, user_id, closed_at, reopened_at) values ($1, $2, $3, $4, $5)
         on conflict (id) do update set reopened_at = excluded.reopened_at`,
        [id, teamA, caro, minsAgo(50), minsAgo(40)],
      );
    await db.as(caro, upsert);
    await db.as(caro, upsert);
    expect(await count('app_closures where id = $1', [id])).toBe(1);
  });

  it('nadie sube un cierre a nombre de otra persona, al revés o en el futuro', async () => {
    expect(await failure(() => db.as(caro, (q) => addClosure(q, teamA, ana)))).toMatch(/row-level security/);
    expect(
      await failure(() =>
        db.as(caro, (q) =>
          q('insert into app_closures (id, team_id, user_id, closed_at, reopened_at) values ($1, $2, $3, $4, $5)', [
            randomUUID(), teamA, caro, minsAgo(10), minsAgo(20),
          ]),
        ),
      ),
    ).toMatch(/app_closures_order/);
    expect(
      await failure(() =>
        db.as(caro, (q) =>
          q('insert into app_closures (id, team_id, user_id, closed_at, reopened_at) values ($1, $2, $3, $4, $5)', [
            randomUUID(), teamA, caro, minsAgo(10), inMins(30),
          ]),
        ),
      ),
    ).toMatch(/futuro/);
  });

  it('owner y admin ven los cierres de todo el equipo; el member solo los suyos', async () => {
    for (const user of [ana, beto]) {
      const users = await db.as(user, (q) => q<{ user_id: string }>('select distinct user_id from app_closures where team_id = $1', [teamA]));
      expect(users.map((r) => r.user_id).sort()).toEqual([ana, beto, caro].sort());
    }
    const caros = await db.as(caro, (q) => q<{ user_id: string }>('select distinct user_id from app_closures'));
    expect(caros.map((r) => r.user_id)).toEqual([caro]);
  });

  it('el viewer y la gente de fuera no ven cierres', async () => {
    expect(await db.as(dani, (q) => q('select id from app_closures'))).toHaveLength(0);
    expect(await db.as(eva, (q) => q('select id from app_closures where team_id = $1', [teamA]))).toHaveLength(0);
  });
});

describe('salida de un equipo (A-3): misma regla para salir y para ser expulsado', () => {
  let teamD: string;
  let mia: string, nico: string;

  beforeAll(async () => {
    [mia, nico] = (await Promise.all(['mia', 'nico'].map((n) => db.createUser(`${n}@pulso.test`)))) as [string, string];
    teamD = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo D') as id")))[0]!.id;
    await db.as(ana, (q) => q("select give_consent($1, 'v1')", [teamD]));
    for (const [user, email] of [[mia, 'mia@pulso.test'], [nico, 'nico@pulso.test']] as const) {
      const id = await invite(ana, teamD, email, 'member');
      await db.as(user, (q) => q("select accept_invitation($1, 'v1')", [id]));
      await db.as(user, async (q) => {
        await addBlock(q, teamD, user);
        await addEntry(q, teamD, user);
        await addClosure(q, teamD, user);
      });
    }
    await db.as(ana, (q) => addEntry(q, teamD, ana));
  });

  it('quien es expulsado pierde su actividad y sus cierres, conserva su tiempo y queda auditado', async () => {
    await db.as(ana, (q) => q('select remove_member($1, $2)', [teamD, mia]));
    expect(await count('activity_blocks where team_id = $1 and user_id = $2', [teamD, mia])).toBe(0);
    expect(await count('app_closures where team_id = $1 and user_id = $2', [teamD, mia])).toBe(0);
    expect(await count('time_entries where team_id = $1 and user_id = $2', [teamD, mia])).toBe(1);
    const [row] = await db.admin<{ actor_id: string; target_user: string }>(
      "select actor_id, target_user from audit_log where team_id = $1 and action = 'member_removed'",
      [teamD],
    );
    expect(row).toMatchObject({ actor_id: ana, target_user: mia });
  });

  it('quien sale por su cuenta sigue la misma regla y queda auditado', async () => {
    await db.as(nico, (q) => q('select leave_team($1)', [teamD]));
    expect(await count('activity_blocks where team_id = $1 and user_id = $2', [teamD, nico])).toBe(0);
    expect(await count('app_closures where team_id = $1 and user_id = $2', [teamD, nico])).toBe(0);
    expect(await count('time_entries where team_id = $1 and user_id = $2', [teamD, nico])).toBe(1);
    expect(await auditActions(teamD)).toContain('member_left');
  });

  it('los totales de tiempo muestran a quienes se fueron como «Exmiembro» (user_id nulo)', async () => {
    const rows = await db.as(ana, (q) =>
      q<{ user_id: string | null; seconds: number; entries: number }>(
        'select * from team_time_summary($1, $2, $3)',
        [teamD, minsAgo(60 * 24), inMins(10)],
      ),
    );
    const ex = rows.find((r) => r.user_id === null);
    expect(ex).toMatchObject({ seconds: 2 * 3600, entries: 2 });
    expect(rows.find((r) => r.user_id === ana)).toMatchObject({ seconds: 3600, entries: 1 });
  });
});

describe('tiempo por miembro (fila 13)', () => {
  it('el admin también ve los totales de tiempo; member, viewer y gente de fuera no', async () => {
    await db.as(beto, (q) => q('select * from team_time_summary($1, $2, $3)', [teamA, minsAgo(60), inMins(10)]));
    for (const user of [caro, dani, eva]) {
      expect(
        await failure(() => db.as(user, (q) => q('select * from team_time_summary($1, $2, $3)', [teamA, minsAgo(60), inMins(10)]))),
      ).toMatch(/No permitido/);
    }
  });

  it('no cuenta entradas borradas y recorta al rango pedido', async () => {
    const teamE = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo E') as id")))[0]!.id;
    await db.as(ana, (q) => q("select give_consent($1, 'v1')", [teamE]));
    await db.as(ana, async (q) => {
      await addEntry(q, teamE, ana, minsAgo(120), minsAgo(60));
      const deleted = randomUUID();
      await q(
        `insert into time_entries (id, team_id, user_id, started_at, ended_at, source, deleted_at)
         values ($1, $2, $3, $4, $5, 'manual', now())`,
        [deleted, teamE, ana, minsAgo(50), minsAgo(40)],
      );
    });
    const rows = await db.as(ana, (q) =>
      q<{ seconds: number }>('select * from team_time_summary($1, $2, $3)', [teamE, minsAgo(90), inMins(10)]),
    );
    expect(rows).toEqual([expect.objectContaining({ seconds: 30 * 60, entries: 1 })]);
  });
});
