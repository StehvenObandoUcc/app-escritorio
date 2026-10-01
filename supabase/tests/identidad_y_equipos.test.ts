import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type TestDb } from './harness';

/**
 * Pruebas de la migración de identidad y equipos contra la matriz de docs/ROLES.md.
 * Equipo A: ana (owner), beto (admin), caro (member), dani (viewer).
 * Equipo B: eva (owner). Sirve para probar el aislamiento entre equipos.
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, eva: string;
let teamA: string, teamB: string;

const roleOf = async (team: string, user: string) =>
  (await db.admin<{ role: string }>(
    'select role from team_members where team_id = $1 and user_id = $2',
    [team, user],
  ))[0]?.role;

beforeAll(async () => {
  db = await createTestDb();
  ana = await db.createUser('ana@pulso.test');
  beto = await db.createUser('beto@pulso.test');
  caro = await db.createUser('caro@pulso.test');
  dani = await db.createUser('dani@pulso.test');
  eva = await db.createUser('eva@pulso.test');
  for (const [id, name] of [[ana, 'Ana'], [beto, 'Beto'], [caro, 'Caro'], [dani, 'Dani'], [eva, 'Eva']] as const) {
    await db.as(id, (q) => q('insert into profiles (id, display_name) values ($1, $2)', [id, name]));
  }

  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;

  // Las invitaciones llegan en F2; aquí se agregan miembros directamente como administrador.
  await db.admin(
    `insert into team_members (team_id, user_id, role) values
       ($1, $2, 'admin'), ($1, $3, 'member'), ($1, $4, 'viewer')`,
    [teamA, beto, caro, dani],
  );
});

afterAll(() => db.close());

describe('crear equipo', () => {
  it('quien crea el equipo queda como owner', async () => {
    expect(await roleOf(teamA, ana)).toBe('owner');
  });

  it('sin sesión no se puede crear un equipo', async () => {
    const message = await failure(() => db.as(null, (q) => q("select create_team('Intruso')")));
    expect(message).toMatch(/permission denied|Debes iniciar sesión/);
  });
});

describe('aislamiento entre equipos', () => {
  it('cada persona ve solo sus equipos', async () => {
    const seenByCaro = await db.as(caro, (q) => q<{ name: string }>('select name from teams'));
    expect(seenByCaro.map((t) => t.name)).toEqual(['Equipo A']);

    const seenByEva = await db.as(eva, (q) => q<{ name: string }>('select name from teams'));
    expect(seenByEva.map((t) => t.name)).toEqual(['Equipo B']);
  });

  it('nadie ve los miembros de un equipo ajeno', async () => {
    const rows = await db.as(eva, (q) => q('select * from team_members where team_id = $1', [teamA]));
    expect(rows).toHaveLength(0);
  });

  it('los perfiles solo son visibles entre compañeros de equipo', async () => {
    const seenByCaro = await db.as(caro, (q) => q<{ display_name: string }>('select display_name from profiles'));
    expect(seenByCaro.map((p) => p.display_name).sort()).toEqual(['Ana', 'Beto', 'Caro', 'Dani']);

    const seenByEva = await db.as(eva, (q) => q<{ display_name: string }>('select display_name from profiles'));
    expect(seenByEva.map((p) => p.display_name)).toEqual(['Eva']);
  });

  it('el rol anon no lee nada', async () => {
    const message = await failure(() => db.as(null, (q) => q('select * from teams')));
    expect(message).toMatch(/permission denied/);
  });
});

describe('visibilidad según rol', () => {
  it('owner, admin y member ven la lista completa de miembros', async () => {
    for (const user of [ana, beto, caro]) {
      const rows = await db.as(user, (q) => q('select * from team_members where team_id = $1', [teamA]));
      expect(rows).toHaveLength(4);
    }
  });

  it('el viewer solo ve su propia fila', async () => {
    const rows = await db.as(dani, (q) => q<{ user_id: string }>('select user_id from team_members'));
    expect(rows.map((r) => r.user_id)).toEqual([dani]);
  });
});

describe('las filas de miembros no se tocan directamente', () => {
  it('ni el owner puede insertar, actualizar o borrar team_members a mano', async () => {
    for (const sql of [
      `insert into team_members (team_id, user_id, role) values ('${teamA}', '${eva}', 'owner')`,
      `update team_members set role = 'owner' where user_id = '${caro}'`,
      `delete from team_members where user_id = '${caro}'`,
    ]) {
      expect(await failure(() => db.as(ana, (q) => q(sql)))).toMatch(/permission denied/);
    }
  });
});

describe('cambiar roles', () => {
  it('el admin mueve a alguien entre member y viewer', async () => {
    await db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'viewer']));
    expect(await roleOf(teamA, caro)).toBe('viewer');
    await db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'member']));
    expect(await roleOf(teamA, caro)).toBe('member');
  });

  it('el admin no puede nombrar admins ni tocar al owner', async () => {
    expect(
      await failure(() => db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'admin']))),
    ).toMatch(/No permitido/);
    expect(
      await failure(() => db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, ana, 'member']))),
    ).toMatch(/No permitido/);
  });

  it('member y viewer no pueden cambiar roles', async () => {
    for (const user of [caro, dani]) {
      expect(
        await failure(() => db.as(user, (q) => q('select set_member_role($1, $2, $3)', [teamA, dani, 'member']))),
      ).toMatch(/No permitido/);
    }
  });

  it('alguien de otro equipo no puede cambiar roles', async () => {
    expect(
      await failure(() => db.as(eva, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'admin']))),
    ).toMatch(/No permitido/);
  });

  it('el owner puede nombrar admins', async () => {
    await db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'admin']));
    expect(await roleOf(teamA, caro)).toBe('admin');
    await db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'member']));
  });

  it('rechaza roles que no existen', async () => {
    expect(
      await failure(() => db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, caro, 'jefe']))),
    ).toMatch(/Rol desconocido/);
  });
});

describe('el equipo siempre conserva un owner', () => {
  it('el último owner no puede salir ni degradarse', async () => {
    expect(await failure(() => db.as(ana, (q) => q('select leave_team($1)', [teamA])))).toMatch(
      /al menos un owner/,
    );
    expect(
      await failure(() => db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, ana, 'admin']))),
    ).toMatch(/al menos un owner/);
    expect(await roleOf(teamA, ana)).toBe('owner');
  });

  it('con un segundo owner, el primero sí puede degradarse', async () => {
    await db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, beto, 'owner']));
    await db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, ana, 'admin']));
    expect(await roleOf(teamA, ana)).toBe('admin');
    // Se deja como al principio: ana owner, beto admin.
    await db.as(beto, (q) => q('select set_member_role($1, $2, $3)', [teamA, ana, 'owner']));
    await db.as(ana, (q) => q('select set_member_role($1, $2, $3)', [teamA, beto, 'admin']));
  });
});

describe('expulsar y salir', () => {
  it('el admin expulsa a un viewer pero no a otro admin ni al owner', async () => {
    expect(await failure(() => db.as(beto, (q) => q('select remove_member($1, $2)', [teamA, ana])))).toMatch(
      /No permitido/,
    );
    await db.as(beto, (q) => q('select remove_member($1, $2)', [teamA, dani]));
    expect(await roleOf(teamA, dani)).toBeUndefined();
  });

  it('un member puede salir del equipo por su cuenta', async () => {
    await db.as(caro, (q) => q('select leave_team($1)', [teamA]));
    expect(await roleOf(teamA, caro)).toBeUndefined();
  });
});

describe('renombrar y eliminar el equipo', () => {
  it('el admin no puede renombrar ni eliminar', async () => {
    const renamed = await db.as(beto, (q) => q("update teams set name = 'Hackeado' where id = $1 returning id", [teamA]));
    expect(renamed).toHaveLength(0);
    const deleted = await db.as(beto, (q) => q('delete from teams where id = $1 returning id', [teamA]));
    expect(deleted).toHaveLength(0);
  });

  it('nadie puede cambiar settings escribiendo la tabla directamente', async () => {
    expect(
      await failure(() => db.as(ana, (q) => q(`update teams set settings = '{"x":1}' where id = $1`, [teamA]))),
    ).toMatch(/permission denied/);
  });

  it('el owner sí puede expulsar a un admin', async () => {
    await db.as(ana, (q) => q('select remove_member($1, $2)', [teamA, beto]));
    expect(await roleOf(teamA, beto)).toBeUndefined();
  });

  it('el owner renombra y elimina; al eliminar se van sus miembros', async () => {
    const renamed = await db.as(ana, (q) =>
      q<{ name: string }>("update teams set name = 'Equipo Alfa' where id = $1 returning name", [teamA]),
    );
    expect(renamed[0]?.name).toBe('Equipo Alfa');

    await db.as(ana, (q) => q('delete from teams where id = $1', [teamA]));
    expect(await db.admin('select 1 from team_members where team_id = $1', [teamA])).toHaveLength(0);
    expect(await db.admin('select 1 from teams where id = $1', [teamB])).toHaveLength(1);
  });
});
