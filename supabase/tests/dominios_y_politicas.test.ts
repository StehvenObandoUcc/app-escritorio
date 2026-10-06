import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type Query, type TestDb } from './harness';

/**
 * Pruebas de dominios, sitios no permitidos y política de apps ocultas (ADR-0009)
 * contra docs/ROLES.md (filas 13 y 23).
 * Equipo A: ana (owner), beto (admin), caro (member), dani (viewer). Equipo B: eva (owner).
 */
let db: TestDb;
let ana: string, beto: string, caro: string, dani: string, eva: string;
let teamA: string, teamB: string;

const minsAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();
const inMins = (m: number) => new Date(Date.now() + m * 60_000).toISOString();

const addBlock = (q: Query, team: string, user: string, domain: string | null, from = 60, to = 30, category = 'neutral') =>
  q(
    `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category, domain)
     values ($1, $2, $3, $4, $5, 'brave', $6, $7)`,
    [randomUUID(), team, user, minsAgo(from), minsAgo(to), category, domain],
  );

const addDomainRule = (q: Query, team: string, user: string, pattern: string, notAllowed = true, category = 'distraction') =>
  q(
    `insert into classification_rules (team_id, priority, match_type, pattern, category, created_by, not_allowed)
     values ($1, 10, 'domain', $2, $3, $4, $5)`,
    [team, pattern, category, user, notAllowed],
  );

beforeAll(async () => {
  db = await createTestDb();
  [ana, beto, caro, dani, eva] = (await Promise.all(
    ['ana', 'beto', 'caro', 'dani', 'eva'].map((n) => db.createUser(`${n}@pulso.test`)),
  )) as [string, string, string, string, string];
  teamA = (await db.as(ana, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(eva, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
       ($1, $2, 'admin', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'viewer', 'v2', now())`,
    [teamA, beto, caro, dani],
  );
  await db.as(ana, (q) => q("select give_consent($1, 'v2')", [teamA]));
  await db.as(eva, (q) => q("select give_consent($1, 'v2')", [teamB]));
});

afterAll(() => db.close());

describe('dominio en la actividad (ADR-0009)', () => {
  it('se guarda el dominio del sitio', async () => {
    await db.as(caro, (q) => addBlock(q, teamA, caro, 'perplexity.ai'));
    const rows = await db.as(caro, (q) => q<{ domain: string }>('select domain from activity_blocks'));
    expect(rows.map((r) => r.domain)).toContain('perplexity.ai');
  });

  it.each(['perplexity.ai/search?q=secreto', 'claude.ai/chat/1', 'Claude.AI', 'sitio con espacios.com', 'a.com#x'])(
    'nunca se guarda una ruta, búsqueda o texto que no sea un dominio: %s',
    async (bad) => {
      expect(await failure(() => db.as(caro, (q) => addBlock(q, teamA, caro, bad)))).toMatch(/activity_blocks_domain_format/);
    },
  );
});

describe('sitios no permitidos (fila 23)', () => {
  it('owner y admin crean reglas por dominio y las marcan «no permitido»', async () => {
    await db.as(ana, (q) => addDomainRule(q, teamA, ana, 'youtube.com'));
    await db.as(beto, (q) => addDomainRule(q, teamA, beto, 'netflix.com'));
    const rows = await db.as(caro, (q) => q<{ pattern: string; not_allowed: boolean }>("select pattern, not_allowed from classification_rules where match_type = 'domain' order by pattern"));
    expect(rows).toEqual([
      { pattern: 'netflix.com', not_allowed: true },
      { pattern: 'youtube.com', not_allowed: true },
    ]);
  });

  it('member, viewer y gente de fuera no crean reglas', async () => {
    for (const user of [caro, dani, eva]) {
      expect(await failure(() => db.as(user, (q) => addDomainRule(q, teamA, user, 'tiktok.com')))).toMatch(/row-level security/);
    }
  });

  it('«no permitido» solo puede ser distracción, y el patrón de dominio no lleva rutas', async () => {
    expect(await failure(() => db.as(ana, (q) => addDomainRule(q, teamA, ana, 'github.com', true, 'productive')))).toMatch(
      /classification_rules_not_allowed_is_distraction/,
    );
    expect(await failure(() => db.as(ana, (q) => addDomainRule(q, teamA, ana, 'youtube.com/shorts')))).toMatch(
      /classification_rules_domain_format/,
    );
  });

  it('el owner quita una regla', async () => {
    await db.as(ana, (q) => q("delete from classification_rules where team_id = $1 and pattern = 'netflix.com'", [teamA]));
    const rows = await db.admin("select 1 from classification_rules where pattern = 'netflix.com'");
    expect(rows).toHaveLength(0);
  });
});

describe('política de apps ocultas (fila 23)', () => {
  const policy = async (team: string) =>
    (await db.admin<{ p: boolean | null }>("select (settings -> 'policies' ->> 'allow_hidden_apps')::boolean as p from teams where id = $1", [team]))[0]!.p;

  it('owner y admin la cambian, se conserva la jornada y queda en auditoría', async () => {
    await db.as(beto, (q) => q('select set_team_policy($1, false)', [teamA]));
    expect(await policy(teamA)).toBe(false);
    await db.as(ana, (q) => q('select set_team_policy($1, true)', [teamA]));
    expect(await policy(teamA)).toBe(true);
    const [row] = await db.admin<{ settings: { workday: unknown } }>('select settings from teams where id = $1', [teamA]);
    expect(row!.settings.workday).toBeDefined();
    const actions = await db.admin<{ n: number }>("select count(*)::int as n from audit_log where team_id = $1 and action = 'policy_changed'", [teamA]);
    expect(actions[0]!.n).toBe(2);
  });

  it('member, viewer, gente de fuera y anon no la cambian', async () => {
    for (const user of [caro, dani, eva]) {
      expect(await failure(() => db.as(user, (q) => q('select set_team_policy($1, false)', [teamA])))).toMatch(/No permitido/);
    }
    expect(await failure(() => db.as(null, (q) => q('select set_team_policy($1, false)', [teamA])))).toMatch(/permission denied/);
  });

  it('todos los miembros la leen en los ajustes del equipo', async () => {
    const [row] = await db.as(caro, (q) => q<{ p: string }>("select settings -> 'policies' ->> 'allow_hidden_apps' as p from teams where id = $1", [teamA]));
    expect(row!.p).toBe('true');
  });
});

describe('tiempo por sitio y persona (fila 13)', () => {
  beforeAll(async () => {
    await db.as(beto, (q) => addBlock(q, teamA, beto, 'claude.ai', 120, 90, 'ai'));
    await db.as(beto, (q) => addBlock(q, teamA, beto, null, 90, 80));
  });

  it('owner y admin ven el tiempo por dominio de cada miembro, sin bloques sin dominio', async () => {
    for (const user of [ana, beto]) {
      const rows = await db.as(user, (q) =>
        q<{ user_id: string; domain: string; seconds: number }>('select * from team_domain_summary($1, $2, $3)', [teamA, minsAgo(60 * 24), inMins(10)]),
      );
      expect(rows.find((r) => r.user_id === beto && r.domain === 'claude.ai')?.seconds).toBe(30 * 60);
      expect(rows.every((r) => r.domain !== null)).toBe(true);
    }
  });

  it('member, viewer y gente de fuera no pueden pedirlo', async () => {
    for (const user of [caro, dani, eva]) {
      expect(
        await failure(() => db.as(user, (q) => q('select * from team_domain_summary($1, $2, $3)', [teamA, minsAgo(60), inMins(10)]))),
      ).toMatch(/No permitido/);
    }
  });
});
