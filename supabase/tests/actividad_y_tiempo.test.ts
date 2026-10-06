import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Pruebas de la migración de actividad y tiempo contra docs/ROLES.md (filas 10–14 y 23).
 * Equipo A: ana (owner), beto (admin), caro (member), dani (viewer).
 * Equipo B: eva (owner). Sirve para probar el aislamiento entre equipos.
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, eva: string;
let teamA: string, teamB: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const inMins = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

interface BlockArgs {
  id?: string;
  team: string;
  user: string;
  start?: string;
  end?: string;
  app?: string;
  category?: string;
  aiTool?: string | null;
}

const addBlock = (q: Query, a: BlockArgs) =>
  q(
    `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category, ai_tool)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [a.id ?? randomUUID(), a.team, a.user, a.start ?? minsAgo(60), a.end ?? minsAgo(30), a.app ?? 'code', a.category ?? 'productive', a.aiTool ?? null],
  );

interface EntryArgs {
  id?: string;
  team: string;
  user: string;
  start?: string;
  end?: string | null;
  source?: string;
}

const addEntry = (q: Query, a: EntryArgs) =>
  q(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, source)
     values ($1, $2, $3, $4, $5, $6)`,
    [a.id ?? randomUUID(), a.team, a.user, a.start ?? minsAgo(120), a.end === undefined ? minsAgo(60) : a.end, a.source ?? 'manual'],
  );

const count = async (sql: string, params: unknown[] = []) =>
  Number((await db.admin<{ n: string }>(`select count(*) as n from ${sql}`, params))[0]?.n);

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani, eva] = await Promise.all(
    ['ana', 'beto', 'caro', 'dani', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)),
  ) as [string, string, string, string, string];

  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'member'), ($1, $4, 'viewer')`,
    [teamA, beto, caro, dani],
  );
  // Sin consentimiento no se sube nada (PS-02, migración 20261006000001).
  for (const user of [ana, beto, caro]) {
    await db.as(user, (q) => q("select give_consent($1, 'v1')", [teamA]));
  }
  await db.as(eva, (q) => q("select give_consent($1, 'v1')", [teamB]));
});

afterAll(() => db.close());

describe('actividad: quién registra y quién lee (filas 10 y 12)', () => {
  it('owner, admin y member suben y leen su propia actividad', async () => {
    for (const user of [ana, beto, caro]) {
      await db.as(user, (q) => addBlock(q, { team: teamA, user }));
      const rows = await db.as(user, (q) => q('select id from activity_blocks'));
      expect(rows).toHaveLength(1);
    }
  });

  it('subir dos veces el mismo bloque no lo duplica (SY-03)', async () => {
    const id = randomUUID();
    const upsert = (end: string) =>
      db.as(caro, (q) =>
        q(
          `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category)
           values ($1, $2, $3, $4, $5, 'chrome', 'neutral')
           on conflict (id) do update set started_at = excluded.started_at, ended_at = excluded.ended_at,
             team_id = excluded.team_id, user_id = excluded.user_id`,
          [id, teamA, caro, minsAgo(50), end],
        ),
      );
    await upsert(minsAgo(40));
    await upsert(minsAgo(40));
    await upsert(minsAgo(35)); // el bloque creció
    expect(await count('activity_blocks where id = $1', [id])).toBe(1);
    const [row] = await db.admin<{ ended_at: Date }>('select ended_at from activity_blocks where id = $1', [id]);
    expect(Math.abs(row!.ended_at.getTime() - Date.parse(minsAgo(35)))).toBeLessThan(5_000);
  });

  it('el viewer no registra ni lee actividad', async () => {
    expect(await failure(() => db.as(dani, (q) => addBlock(q, { team: teamA, user: dani })))).toMatch(/row-level security/);
    expect(await db.as(dani, (q) => q('select * from activity_blocks'))).toHaveLength(0);
  });

  it('nadie sube actividad a nombre de otra persona', async () => {
    expect(await failure(() => db.as(ana, (q) => addBlock(q, { team: teamA, user: caro })))).toMatch(/row-level security/);
  });

  it('nadie sube actividad a un equipo ajeno', async () => {
    expect(await failure(() => db.as(eva, (q) => addBlock(q, { team: teamA, user: eva })))).toMatch(/row-level security/);
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamB, user: caro })))).toMatch(/row-level security/);
  });

  it('ni el owner ni el admin leen los bloques en bruto de otros', async () => {
    for (const user of [ana, beto]) {
      const rows = await db.as(user, (q) => q<{ user_id: string }>('select user_id from activity_blocks'));
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.user_id === user)).toBe(true);
    }
  });

  it('el rol anon no accede a nada', async () => {
    expect(await failure(() => db.as(null, (q) => q('select * from activity_blocks')))).toMatch(/permission denied/);
    expect(await failure(() => db.as(null, (q) => q('select * from time_entries')))).toMatch(/permission denied/);
    expect(await failure(() => db.as(null, (q) => q('select * from classification_rules')))).toMatch(/permission denied/);
  });

  it('la tabla no tiene ninguna columna para títulos de ventana (D-05)', async () => {
    const columns = await db.admin<{ column_name: string }>(
      "select column_name from information_schema.columns where table_schema = 'public' and table_name = 'activity_blocks'",
    );
    const names = columns.map((c) => c.column_name);
    expect(names.length).toBeGreaterThan(5);
    expect(names.filter((n) => /title|titulo|window|ventana/i.test(n))).toEqual([]);
  });
});

describe('actividad: validación en el servidor', () => {
  it('rechaza un fin anterior o igual al inicio', async () => {
    const m = await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: minsAgo(10), end: minsAgo(20) })));
    expect(m).toMatch(/posterior al inicio/);
    const same = minsAgo(10);
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: same, end: same })))).toMatch(/posterior al inicio/);
  });

  it('rechaza más de 24 horas', async () => {
    const m = await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: minsAgo(60 * 26), end: minsAgo(10) })));
    expect(m).toMatch(/24 horas/);
  });

  it('rechaza fechas futuras y tolera 5 minutos de desajuste de reloj', async () => {
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: minsAgo(10), end: inMins(30) })))).toMatch(/futuro/);
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: inMins(20), end: inMins(30) })))).toMatch(/futuro/);
    await db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, start: minsAgo(10), end: inMins(2) }));
  });

  it('rechaza categorías desconocidas y herramienta de IA fuera de la categoría ai', async () => {
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, category: 'trabajo' })))).toMatch(/check/);
    expect(await failure(() => db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, category: 'neutral', aiTool: 'ChatGPT' })))).toMatch(/ai_tool_only_for_ai/);
    await db.as(caro, (q) => addBlock(q, { team: teamA, user: caro, category: 'ai', aiTool: 'ChatGPT', app: 'chrome' }));
  });

  it('un bloque no cambia de dueño ni de equipo al actualizarse', async () => {
    const id = randomUUID();
    await db.as(caro, (q) => addBlock(q, { id, team: teamA, user: caro }));
    expect(await failure(() => db.as(caro, (q) => q('update activity_blocks set user_id = $2 where id = $1', [id, ana])))).toMatch(
      /No permitido|row-level security/,
    );
    expect(await failure(() => db.as(caro, (q) => q('update activity_blocks set team_id = $2 where id = $1', [id, teamB])))).toMatch(
      /No permitido|row-level security/,
    );
  });

  it('solo el dueño edita o borra sus bloques', async () => {
    const id = randomUUID();
    await db.as(caro, (q) => addBlock(q, { id, team: teamA, user: caro }));
    for (const user of [ana, beto, eva]) {
      expect(await db.as(user, (q) => q("update activity_blocks set app_name = 'x' where id = $1 returning id", [id]))).toHaveLength(0);
      expect(await db.as(user, (q) => q('delete from activity_blocks where id = $1 returning id', [id]))).toHaveLength(0);
    }
    expect(await db.as(caro, (q) => q('delete from activity_blocks where id = $1 returning id', [id]))).toHaveLength(1);
  });
});

describe('tiempo propio (filas 10 y 11)', () => {
  it('owner, admin y member registran y editan su propio tiempo', async () => {
    for (const user of [ana, beto, caro]) {
      const id = randomUUID();
      await db.as(user, (q) => addEntry(q, { id, team: teamA, user }));
      const upd = await db.as(user, (q) => q('update time_entries set ended_at = $2, updated_at = now() where id = $1 returning id', [id, minsAgo(50)]));
      expect(upd).toHaveLength(1);
    }
  });

  it('un temporizador en marcha se guarda sin fin y luego se cierra', async () => {
    const id = randomUUID();
    await db.as(caro, (q) => addEntry(q, { id, team: teamA, user: caro, start: minsAgo(15), end: null, source: 'timer' }));
    await db.as(caro, (q) => q('update time_entries set ended_at = $2 where id = $1', [id, minsAgo(1)]));
    const [row] = await db.admin<{ ended_at: Date | null }>('select ended_at from time_entries where id = $1', [id]);
    expect(row?.ended_at).not.toBeNull();
  });

  it('el viewer no registra tiempo', async () => {
    expect(await failure(() => db.as(dani, (q) => addEntry(q, { team: teamA, user: dani })))).toMatch(/row-level security/);
  });

  it('nadie edita el tiempo de otra persona, ni el owner (fila 11)', async () => {
    const id = randomUUID();
    await db.as(caro, (q) => addEntry(q, { id, team: teamA, user: caro }));
    for (const user of [ana, beto, dani, eva]) {
      const upd = await db.as(user, (q) => q("update time_entries set source = 'timer' where id = $1 returning id", [id]));
      expect(upd).toHaveLength(0);
    }
    expect(await failure(() => db.as(ana, (q) => addEntry(q, { team: teamA, user: caro })))).toMatch(/row-level security/);
  });

  it('la lectura es solo de las propias entradas', async () => {
    const rows = await db.as(ana, (q) => q<{ user_id: string }>('select user_id from time_entries'));
    expect(rows.every((r) => r.user_id === ana)).toBe(true);
  });

  it('no se borra: se marca con deleted_at', async () => {
    const id = randomUUID();
    await db.as(caro, (q) => addEntry(q, { id, team: teamA, user: caro }));
    expect(await failure(() => db.as(caro, (q) => q('delete from time_entries where id = $1', [id])))).toMatch(/permission denied/);
    await db.as(caro, (q) => q('update time_entries set deleted_at = now() where id = $1', [id]));
    expect(await count('time_entries where id = $1 and deleted_at is not null', [id])).toBe(1);
  });

  it('valida igual que Rust (fin posterior, 24 h, sin futuro) y el origen', async () => {
    expect(await failure(() => db.as(caro, (q) => addEntry(q, { team: teamA, user: caro, start: minsAgo(10), end: minsAgo(20) })))).toMatch(/posterior al inicio/);
    expect(await failure(() => db.as(caro, (q) => addEntry(q, { team: teamA, user: caro, start: minsAgo(60 * 26), end: minsAgo(5) })))).toMatch(/24 horas/);
    expect(await failure(() => db.as(caro, (q) => addEntry(q, { team: teamA, user: caro, start: minsAgo(10), end: inMins(60) })))).toMatch(/futuro/);
    expect(await failure(() => db.as(caro, (q) => addEntry(q, { team: teamA, user: caro, source: 'auto' })))).toMatch(/check/);
  });

  it('subir dos veces la misma entrada no la duplica', async () => {
    const id = randomUUID();
    for (let i = 0; i < 2; i++) {
      await db.as(caro, (q) =>
        q(
          `insert into time_entries (id, team_id, user_id, started_at, ended_at, source)
           values ($1, $2, $3, $4, $5, 'manual')
           on conflict (id) do update set started_at = excluded.started_at, ended_at = excluded.ended_at,
             team_id = excluded.team_id, user_id = excluded.user_id`,
          [id, teamA, caro, minsAgo(90), minsAgo(80)],
        ),
      );
    }
    expect(await count('time_entries where id = $1', [id])).toBe(1);
  });
});

describe('totales por miembro (filas 13 y 14)', () => {
  const from = () => minsAgo(60 * 24);
  const to = () => inMins(10);

  beforeAll(async () => {
    // Datos conocidos y aislados en un equipo propio, para sumar sin ruido.
    await db.admin(
      `insert into team_members (team_id, user_id, role, consent_version, consent_at) values ($1, $2, 'member', 'v1', now())`,
      [teamB, caro],
    );
    await db.as(caro, async (q) => {
      await addBlock(q, { team: teamB, user: caro, start: minsAgo(200), end: minsAgo(140), app: 'code', category: 'productive' });
      await addBlock(q, { team: teamB, user: caro, start: minsAgo(140), end: minsAgo(110), app: 'chrome', category: 'ai', aiTool: 'ChatGPT' });
      await addBlock(q, { team: teamB, user: caro, start: minsAgo(110), end: minsAgo(100), app: 'chrome', category: 'ai', aiTool: 'ChatGPT' });
    });
  });

  it('el owner del equipo ve los totales de cada miembro por categoría y app', async () => {
    const rows = await db.as(eva, (q) =>
      q<{ user_id: string; category: string; app_name: string; ai_tool: string | null; seconds: string; blocks: string }>(
        'select * from team_activity_summary($1, $2, $3)',
        [teamB, from(), to()],
      ),
    );
    const byKey = Object.fromEntries(rows.map((r) => [`${r.user_id}/${r.category}/${r.app_name}`, r]));
    expect(Number(byKey[`${caro}/productive/code`]?.seconds)).toBe(60 * 60);
    expect(Number(byKey[`${caro}/ai/chrome`]?.seconds)).toBe(40 * 60);
    expect(Number(byKey[`${caro}/ai/chrome`]?.blocks)).toBe(2);
    expect(byKey[`${caro}/ai/chrome`]?.ai_tool).toBe('ChatGPT');
  });

  it('el admin también los ve', async () => {
    await db.admin("update team_members set role = 'admin' where team_id = $1 and user_id = $2", [teamB, caro]);
    // caro (admin del equipo B) consulta los totales del equipo B
    const rows = await db.as(caro, (q) => q('select * from team_activity_summary($1, $2, $3)', [teamB, from(), to()]));
    expect(rows.length).toBeGreaterThan(0);
    await db.admin("update team_members set role = 'member' where team_id = $1 and user_id = $2", [teamB, caro]);
  });

  it('los segundos se recortan al rango pedido', async () => {
    const rows = await db.as(eva, (q) =>
      q<{ category: string; seconds: string }>(
        'select category, seconds from team_activity_summary($1, $2, $3) where category = $4',
        [teamB, minsAgo(150), minsAgo(120), 'ai'],
      ),
    );
    // Bloques ai: 140→110 (cuenta 140→120 = 20 min) y 110→100 (fuera del rango).
    expect(Number(rows[0]?.seconds)).toBe(20 * 60);
    expect(rows).toHaveLength(1);
  });

  it('member, viewer y gente de fuera no pueden pedir los totales', async () => {
    for (const [user, team] of [[caro, teamB], [dani, teamA], [caro, teamA], [eva, teamA]] as const) {
      expect(
        await failure(() => db.as(user, (q) => q('select * from team_activity_summary($1, $2, $3)', [team, from(), to()]))),
      ).toMatch(/No permitido/);
    }
  });

  it('no mezcla datos de otro equipo', async () => {
    const rows = await db.as(ana, (q) => q<{ user_id: string }>('select user_id from team_activity_summary($1, $2, $3)', [teamA, from(), to()]));
    expect(await count('activity_blocks where team_id = $1', [teamB])).toBeGreaterThan(0);
    // Los bloques de caro en el equipo B no aparecen en el resumen del equipo A.
    const caroInB = await db.admin<{ n: string }>('select count(*) as n from activity_blocks where team_id = $1 and user_id = $2', [teamB, caro]);
    expect(Number(caroInB[0]?.n)).toBe(3);
    expect(rows.every((r) => r.user_id !== eva)).toBe(true);
  });

  it('rechaza rangos inválidos', async () => {
    const bad = (a: string, b: string) => failure(() => db.as(ana, (q) => q('select * from team_activity_summary($1, $2, $3)', [teamA, a, b])));
    expect(await bad(to(), from())).toMatch(/Rango inválido/);
    expect(await bad(minsAgo(60 * 24 * 400), to())).toMatch(/Rango inválido/);
  });

  it('sin sesión no se puede pedir', async () => {
    expect(await failure(() => db.as(null, (q) => q('select * from team_activity_summary($1, $2, $3)', [teamA, from(), to()])))).toMatch(/permission denied/);
  });
});

describe('reglas de clasificación (fila 23)', () => {
  const rule = (q: Query, user: string, team: string, over: Partial<{ priority: number; match: string; pattern: string; category: string; aiTool: string | null }> = {}) =>
    q(
      `insert into classification_rules (team_id, priority, match_type, pattern, category, ai_tool, created_by)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [team, over.priority ?? 10, over.match ?? 'process', over.pattern ?? 'slack', over.category ?? 'productive', over.aiTool ?? null, user],
    );

  it('owner y admin crean reglas', async () => {
    await db.as(ana, (q) => rule(q, ana, teamA, { pattern: 'figma' }));
    await db.as(beto, (q) => rule(q, beto, teamA, { pattern: 'notion', priority: 20 }));
    expect(await count('classification_rules where team_id = $1', [teamA])).toBe(2);
  });

  it('member y viewer no crean, editan ni borran reglas', async () => {
    for (const user of [caro, dani]) {
      expect(await failure(() => db.as(user, (q) => rule(q, user, teamA)))).toMatch(/row-level security/);
      expect(await db.as(user, (q) => q("update classification_rules set category = 'distraction' returning id"))).toHaveLength(0);
      expect(await db.as(user, (q) => q('delete from classification_rules returning id'))).toHaveLength(0);
    }
    expect(await count('classification_rules where team_id = $1', [teamA])).toBe(2);
  });

  it('el member lee las reglas de su equipo; el viewer y los de fuera, no', async () => {
    expect(await db.as(caro, (q) => q('select id from classification_rules where team_id = $1', [teamA]))).toHaveLength(2);
    expect(await db.as(dani, (q) => q('select id from classification_rules'))).toHaveLength(0);
    expect(await db.as(eva, (q) => q('select id from classification_rules where team_id = $1', [teamA]))).toHaveLength(0);
  });

  it('nadie crea reglas en un equipo ajeno ni a nombre de otro', async () => {
    expect(await failure(() => db.as(eva, (q) => rule(q, eva, teamA)))).toMatch(/row-level security/);
    expect(await failure(() => db.as(ana, (q) => rule(q, caro, teamA)))).toMatch(/row-level security/);
  });

  it('el patrón va en minúsculas y las categorías son las permitidas', async () => {
    expect(await failure(() => db.as(ana, (q) => rule(q, ana, teamA, { pattern: 'Slack' })))).toMatch(/check/);
    expect(await failure(() => db.as(ana, (q) => rule(q, ana, teamA, { category: 'break' })))).toMatch(/check/);
    expect(await failure(() => db.as(ana, (q) => rule(q, ana, teamA, { match: 'url' })))).toMatch(/check/);
    expect(await failure(() => db.as(ana, (q) => rule(q, ana, teamA, { category: 'neutral', aiTool: 'X' })))).toMatch(/ai_tool_only_for_ai/);
    await db.as(ana, (q) => rule(q, ana, teamA, { category: 'ai', aiTool: 'Mistral', pattern: 'mistral', match: 'title' }));
  });

  it('el owner edita y borra reglas del equipo', async () => {
    const upd = await db.as(ana, (q) => q("update classification_rules set category = 'neutral' where pattern = 'figma' returning id"));
    expect(upd).toHaveLength(1);
    const del = await db.as(beto, (q) => q("delete from classification_rules where pattern = 'notion' returning id"));
    expect(del).toHaveLength(1);
  });
});

describe('salir del equipo y borrar el equipo', () => {
  // Regla A-3 (migración 20261006000001): se borra la actividad y se conserva el tiempo.
  it('quien sale por su cuenta pierde su actividad en ese equipo, conserva su tiempo y no toca lo de otros', async () => {
    const mine = await count('activity_blocks where team_id = $1 and user_id = $2', [teamA, caro]);
    const anas = await count('activity_blocks where team_id = $1 and user_id = $2', [teamA, ana]);
    const myTime = await count('time_entries where team_id = $1 and user_id = $2', [teamA, caro]);
    expect(mine).toBeGreaterThan(0);
    expect(myTime).toBeGreaterThan(0);
    await db.as(caro, (q) => q('select leave_team($1)', [teamA]));
    expect(await count('activity_blocks where team_id = $1 and user_id = $2', [teamA, caro])).toBe(0);
    expect(await count('time_entries where team_id = $1 and user_id = $2', [teamA, caro])).toBe(myTime);
    expect(await count('activity_blocks where team_id = $1 and user_id = $2', [teamA, ana])).toBe(anas);
    // lo que caro tiene en el equipo B no se toca
    expect(await count('activity_blocks where team_id = $1 and user_id = $2', [teamB, caro])).toBe(3);
  });

  it('al borrar el equipo se va todo lo suyo', async () => {
    await db.as(ana, (q) => q('delete from teams where id = $1', [teamA]));
    expect(await count('activity_blocks where team_id = $1', [teamA])).toBe(0);
    expect(await count('time_entries where team_id = $1', [teamA])).toBe(0);
    expect(await count('classification_rules where team_id = $1', [teamA])).toBe(0);
    expect(await count('activity_blocks where team_id = $1', [teamB])).toBeGreaterThan(0);
  });
});
