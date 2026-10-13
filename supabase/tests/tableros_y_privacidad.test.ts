import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, failure, type TestDb } from './harness';

/**
 * Tableros, privacidad y ajustes del equipo (spec F5, AC-1 a AC-13).
 *
 * Equipo A: owen (owner), adam (admin), lena (member, lead del proyecto «Plataforma»), mara (member en «Plataforma»),
 * nico (member fuera de los proyectos), vera (viewer). Equipo B: zoe (owner) y nico. Equipo C: ofe (owner) y vic (viewer).
 * «Plataforma» la crea owen, así que owen también es persona del proyecto (create_project lo agrega como lead).
 * «Otro» es un proyecto de owen sin más personas.
 *
 * Todos los bloques sembrados son de AYER (America/Bogota, la zona por defecto del perfil), salvo los de cada prueba que
 * lo dice. Datos de ayer, en horas locales (cuenta a mano de cada prueba al final de cada bloque):
 *   lena: VS Code productive 09:00-11:00 · ChatGPT ai 11:00-12:00 (tool ChatGPT, uso code)
 *   mara: VS Code productive 09:00-10:00 · Figma neutral 10:00-10:30 · Reddit distraction 12:00-12:30
 *         VS Code idle 13:00-14:00 (no cuenta) · Claude ai 14:00-15:00 (tool claude, sin etiqueta)
 *   nico: Excel productive 08:00-09:00 · ChatGPT ai 15:00-16:00 (tool ChatGPT, uso writing)
 *   owen: VS Code productive 08:00-09:00 · Copilot ai 10:00-10:30 (tool Copilot, uso analysis)
 *   adam: Otra IA ai 16:00-16:30 (tool «Mi herramienta», uso other)
 */
let db: TestDb;
let owen: string, adam: string, lena: string, mara: string, nico: string, vera: string, zoe: string, ofe: string, vic: string;
let teamA: string, teamB: string, teamC: string, projectP: string, projectQ: string;
let t1: string, t2: string, t6: string;

/** Hora local de Bogotá como expresión SQL: día relativo a hoy y hora «HH:MM». */
const local = (day: number, hm: string) =>
  `(((now() at time zone 'America/Bogota')::date + ${day}) + time '${hm}') at time zone 'America/Bogota'`;
/** Lo mismo, pero relativo al lunes de la semana pasada. */
const lastWeek = (day: number, hm: string) =>
  `((date_trunc('week', now() at time zone 'America/Bogota')::date - 7 + ${day}) + time '${hm}') at time zone 'America/Bogota'`;
const thisMonday = `(date_trunc('week', now() at time zone 'America/Bogota')::date)::timestamp at time zone 'America/Bogota'`;

const YESTERDAY: [string, string] = [local(-1, '00:00'), local(0, '00:00')];

type Cats = { productive: number; neutral: number; distraction: number; ai: number };
type Doing = { id: string; title: string; project_id: string; project_name: string };
type Member = {
  user_id: string; name: string; share_app_names: boolean; hours_active: number; hours_productive: number; hours_category: Cats;
  ai_hours: number; ai_sessions: number; capacity_hours: number; capacity_share: number | null; tasks_doing: Doing[];
};
type Totals = {
  members: number; hours_active: number; hours_productive: number; hours_category: Cats; ai_hours: number; ai_sessions: number;
  ai_tool: Record<string, number>; ai_usage: Record<string, number>; tasks_doing: number; tasks_done: number;
};
type Dash = {
  role: string; is_lead: boolean; totals: Totals | null; per_day: { day: string; hours_category: Cats }[]; members: Member[];
  lead_members: { user_id: string; name: string; project_hours: number; ai_hours_in_projects: number; tasks_doing: Doing[] }[];
  top_apps: { app_name: string; hours: number }[];
};

const dash = (user: string, team: string, [from, to]: [string, string] = YESTERDAY) =>
  db.as(user, (q) => q<{ d: Dash }>(`select team_dashboard($1, ${from}, ${to}) as d`, [team])).then((r) => r[0]!.d);

async function block(user: string, team: string, start: string, end: string, app: string, category: string, aiTool: string | null = null, usage: string | null = null, domain: string | null = null) {
  const [row] = await db.admin<{ id: string }>(
    `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category, ai_tool, ai_usage_type, domain)
     values (gen_random_uuid(), $1, $2, ${start}, ${end}, $3, $4, $5, $6, $7) returning id`,
    [team, user, app, category, aiTool, usage, domain],
  );
  return row!.id;
}

async function entry(user: string, start: string, end: string | null, task: string | null, deleted = false) {
  await db.admin(
    `insert into time_entries (id, team_id, user_id, started_at, ended_at, task_id, source, deleted_at)
     values (gen_random_uuid(), $1, $2, ${start}, ${end ?? 'null'}, $3, 'timer', ${deleted ? 'now()' : 'null'})`,
    [teamA, user, task],
  );
}

async function task(project: string, title: string, assignee: string | null, status: string, completedAt: string | null = null) {
  const [row] = await db.admin<{ id: string }>(
    `insert into tasks (project_id, team_id, title, assignee_id, status, created_by, completed_at)
     values ($1, $2, $3, $4, $5, $6, ${completedAt ?? 'null'}) returning id`,
    [project, teamA, title, assignee, status, owen],
  );
  return row!.id;
}

const DEFAULT_WORKDAY = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };

type SettingsArgs = { idle?: number | null; workday?: unknown; ai?: boolean; presence?: boolean; cap?: number };
const setSettings = (user: string, o: SettingsArgs = {}, team = teamA) =>
  db.as(user, (q) =>
    q('select set_team_settings($1, $2::integer, $3::jsonb, $4::boolean, $5::boolean, $6::integer)', [
      team, o.idle ?? null, JSON.stringify(o.workday ?? DEFAULT_WORKDAY), o.ai ?? false, o.presence ?? false, o.cap ?? 0,
    ]),
  );

const cats = (productive: number, neutral: number, distraction: number, ai: number): Cats => ({ productive, neutral, distraction, ai });

beforeAll(async () => {
  db = await createTestDb();
  const names = ['owen', 'adam', 'lena', 'mara', 'nico', 'vera', 'zoe', 'ofe', 'vic'];
  const ids = await Promise.all(names.map((n) => db.createUser(`${n}@pulso.test`)));
  [owen, adam, lena, mara, nico, vera, zoe, ofe, vic] = ids as [string, string, string, string, string, string, string, string, string];
  for (const [id, n] of names.map((n, i) => [ids[i]!, n] as const)) {
    await db.as(id, (q) => q('insert into profiles (id, display_name) values ($1, $2)', [id, n[0]!.toUpperCase() + n.slice(1)]));
  }
  teamA = (await db.as(owen, (q) => q<{ id: string }>("select create_team('Equipo A') as id")))[0]!.id;
  teamB = (await db.as(zoe, (q) => q<{ id: string }>("select create_team('Equipo B') as id")))[0]!.id;
  teamC = (await db.as(ofe, (q) => q<{ id: string }>("select create_team('Equipo C') as id")))[0]!.id;
  await db.admin(
    `insert into team_members (team_id, user_id, role, consent_version, consent_at) values
     ($1, $2, 'admin', 'v2', now()), ($1, $3, 'member', 'v2', now()), ($1, $4, 'member', 'v2', now()),
     ($1, $5, 'member', 'v2', now()), ($1, $6, 'viewer', 'v2', now()),
     ($7, $5, 'member', 'v2', now()),
     ($8, $9, 'viewer', 'v2', now())`,
    [teamA, adam, lena, mara, nico, vera, teamB, teamC, vic],
  );
  projectP = (await db.as(owen, (q) => q<{ id: string }>("select create_project($1, 'Plataforma') as id", [teamA])))[0]!.id;
  projectQ = (await db.as(owen, (q) => q<{ id: string }>("select create_project($1, 'Otro') as id", [teamA])))[0]!.id;
  await db.as(owen, (q) => q("select set_project_member($1, $2, 'lead')", [projectP, lena]));
  await db.as(owen, (q) => q("select set_project_member($1, $2, 'contributor')", [projectP, mara]));

  // Actividad de ayer (ver la tabla del encabezado).
  await block(lena, teamA, local(-1, '09:00'), local(-1, '11:00'), 'VS Code', 'productive');
  await block(lena, teamA, local(-1, '11:00'), local(-1, '12:00'), 'ChatGPT', 'ai', 'ChatGPT', 'code');
  await block(mara, teamA, local(-1, '09:00'), local(-1, '10:00'), 'VS Code', 'productive');
  await block(mara, teamA, local(-1, '10:00'), local(-1, '10:30'), 'Figma', 'neutral');
  await block(mara, teamA, local(-1, '12:00'), local(-1, '12:30'), 'Reddit', 'distraction');
  await block(mara, teamA, local(-1, '13:00'), local(-1, '14:00'), 'VS Code', 'idle');
  await block(mara, teamA, local(-1, '14:00'), local(-1, '15:00'), 'Claude', 'ai', 'claude');
  await block(nico, teamA, local(-1, '08:00'), local(-1, '09:00'), 'Excel', 'productive', null, null, 'sheets.example.com');
  await block(nico, teamA, local(-1, '15:00'), local(-1, '16:00'), 'ChatGPT', 'ai', 'ChatGPT', 'writing', 'chat.example.com');
  await block(owen, teamA, local(-1, '08:00'), local(-1, '09:00'), 'VS Code', 'productive');
  await block(owen, teamA, local(-1, '10:00'), local(-1, '10:30'), 'Copilot', 'ai', 'Copilot', 'analysis');
  await block(adam, teamA, local(-1, '16:00'), local(-1, '16:30'), 'Otra IA', 'ai', 'Mi herramienta', 'other');
  await block(nico, teamB, local(-1, '09:00'), local(-1, '10:00'), 'Notepad', 'neutral');

  // Tareas: T1 (mara, en curso), T2 (lena, en curso), T3 (mara, por hacer), T4 hecha ayer, T5 hecha hace 3 días,
  // T6 (owen, en curso, en «Otro»).
  t1 = await task(projectP, 'T1', mara, 'doing');
  t2 = await task(projectP, 'T2', lena, 'doing');
  await task(projectP, 'T3', mara, 'todo');
  await task(projectP, 'T4', mara, 'done', local(-1, '17:00'));
  await task(projectP, 'T5', mara, 'done', local(-3, '17:00'));
  t6 = await task(projectQ, 'T6', owen, 'doing');

  // Temporizadores de ayer: lena en T2 09:30-11:30; mara en T1 abierto desde las 14:30 (sigue corriendo) y uno borrado
  // 14:00-14:30; mara en T6 16:00-17:00 (proyecto «Otro») y sin tarea 06:00-06:30; nico en T1 10:00-11:00.
  await entry(lena, local(-1, '09:30'), local(-1, '11:30'), t2);
  await entry(mara, local(-1, '14:30'), null, t1);
  await entry(mara, local(-1, '14:00'), local(-1, '14:30'), t1, true);
  await entry(mara, local(-1, '16:00'), local(-1, '17:00'), t6);
  await entry(mara, local(-1, '06:00'), local(-1, '06:30'), null);
  await entry(nico, local(-1, '10:00'), local(-1, '11:00'), t1);
});

afterAll(() => db.close());

/** Capacidad de ayer en horas: 10 h si ayer fue día laborable (ISO 1 a 5), si no 0. */
const yesterdayCapacity = async () => {
  const [r] = await db.admin<{ d: number }>("select extract(isodow from (now() at time zone 'America/Bogota')::date - 1)::integer as d");
  return r!.d <= 5 ? 10 : 0;
};
const yesterdayDate = async () =>
  (await db.admin<{ d: string }>("select to_char((now() at time zone 'America/Bogota')::date - 1, 'YYYY-MM-DD') as d"))[0]!.d;

describe('tablero por rol (AC-1 a AC-4)', () => {
  it('AC-1 owner y admin reciben totales, por día, miembros con sus tareas y top de apps', async () => {
    // Cuenta a mano (horas): productive = lena 2 + mara 1 + nico 1 + owen 1 = 5 · neutral = mara 0,5 · distraction = mara 0,5
    // · ai = lena 1 + mara 1 + nico 1 + owen 0,5 + adam 0,5 = 4 · activas = 10 (el idle de mara no cuenta) · sesiones de IA = 5.
    // Herramienta: chatgpt = lena 1 + nico 1 = 2 · claude 1 · copilot 0,5 · other («Mi herramienta») 0,5.
    // Uso: code 1 (lena) · writing 1 (nico) · analysis 0,5 (owen) · other 0,5 (adam) · untagged 1 (mara).
    // Tareas: en curso T1, T2, T6 = 3; hechas en el periodo: T4 = 1 (T5 es de hace 3 días).
    const cap = await yesterdayCapacity();
    const share = (hours: number) => (cap > 0 ? Math.round((100 * hours) / cap) : null);
    const expectedTotals: Totals = {
      members: 5,
      hours_active: 10,
      hours_productive: 5,
      hours_category: cats(5, 0.5, 0.5, 4),
      ai_hours: 4,
      ai_sessions: 5,
      ai_tool: { chatgpt: 2, claude: 1, copilot: 0.5, other: 0.5 },
      ai_usage: { code: 1, writing: 1, analysis: 0.5, other: 0.5, untagged: 1 },
      tasks_doing: 3,
      tasks_done: 1,
    };
    const doing = (id: string, title: string, project: string, name: string): Doing => ({ id, title, project_id: project, project_name: name });
    // Por persona (orden por nombre): Adam 0,5 (ai) · Lena 3 (prod 2 + ai 1) · Mara 3 (1 + 0,5 + 0,5 + ai 1) · Nico 2 (1 + 1) · Owen 1,5 (1 + 0,5).
    const member = (id: string, name: string, act: number, c: Cats, ses: number, tasks: Doing[]): Member => ({
      user_id: id, name, share_app_names: true, hours_active: act, hours_productive: c.productive, hours_category: c,
      ai_hours: c.ai, ai_sessions: ses, capacity_hours: cap, capacity_share: share(act), tasks_doing: tasks,
    });
    const expectedMembers = [
      member(adam, 'Adam', 0.5, cats(0, 0, 0, 0.5), 1, []),
      member(lena, 'Lena', 3, cats(2, 0, 0, 1), 1, [doing(t2, 'T2', projectP, 'Plataforma')]),
      member(mara, 'Mara', 3, cats(1, 0.5, 0.5, 1), 1, [doing(t1, 'T1', projectP, 'Plataforma')]),
      member(nico, 'Nico', 2, cats(1, 0, 0, 1), 1, []),
      member(owen, 'Owen', 1.5, cats(1, 0, 0, 0.5), 1, [doing(t6, 'T6', projectQ, 'Otro')]),
    ];
    // Apps: VS Code = lena 2 + mara 1 + owen 1 = 4 · ChatGPT = lena 1 + nico 1 = 2 · Claude 1 · Excel 1 (empate: por nombre)
    // · Copilot, Figma, Otra IA y Reddit 0,5. El idle de mara no suma.
    const expectedApps = [
      { app_name: 'VS Code', hours: 4 }, { app_name: 'ChatGPT', hours: 2 }, { app_name: 'Claude', hours: 1 }, { app_name: 'Excel', hours: 1 },
      { app_name: 'Copilot', hours: 0.5 }, { app_name: 'Figma', hours: 0.5 }, { app_name: 'Otra IA', hours: 0.5 }, { app_name: 'Reddit', hours: 0.5 },
    ];
    const day = await yesterdayDate();
    for (const [user, role] of [[owen, 'owner'], [adam, 'admin']] as const) {
      const d = await dash(user, teamA);
      expect(d.role).toBe(role);
      expect(d.is_lead).toBe(false);
      expect(d.totals).toEqual(expectedTotals);
      expect(d.per_day).toEqual([{ day, hours_category: cats(5, 0.5, 0.5, 4) }]);
      expect(d.members).toEqual(expectedMembers);
      expect(d.top_apps).toEqual(expectedApps);
      expect(d.lead_members).toEqual([]);
    }
  });

  it('AC-2 el lead ve solo a las personas de sus proyectos, con las horas recortadas', async () => {
    // Personas de «Plataforma»: lena (lead), mara y owen (creó el proyecto). Nico no está: su temporizador en T1 no sale.
    // lena: temporizador T2 09:30-11:30 = 2 h; su IA 11:00-12:00 solapa 11:00-11:30 = 0,5 h (solapamiento parcial).
    // mara: temporizador abierto en T1 desde 14:30, recortado al fin del periodo (hoy 00:00) = 9,5 h; el borrado 14:00-14:30
    //   no cuenta; el de T6 («Otro») tampoco. Su IA 14:00-15:00 solapa 14:30-15:00 = 0,5 h.
    // owen: sin temporizadores en «Plataforma» = 0 h.
    const d = await dash(lena, teamA);
    expect(d.role).toBe('member');
    expect(d.is_lead).toBe(true);
    expect(d.members).toEqual([]);
    expect(d.top_apps).toEqual([]);
    expect(d.lead_members).toEqual([
      { user_id: lena, name: 'Lena', project_hours: 2, ai_hours_in_projects: 0.5, tasks_doing: [{ id: t2, title: 'T2', project_id: projectP, project_name: 'Plataforma' }] },
      { user_id: mara, name: 'Mara', project_hours: 9.5, ai_hours_in_projects: 0.5, tasks_doing: [{ id: t1, title: 'T1', project_id: projectP, project_name: 'Plataforma' }] },
      { user_id: owen, name: 'Owen', project_hours: 0, ai_hours_in_projects: 0, tasks_doing: [] },
    ]);
    // Quien no es lead no recibe nada de esto; el lead ve los totales como cualquier member.
    expect(d.totals?.members).toBe(5);
    const m = await dash(mara, teamA);
    expect(m.is_lead).toBe(false);
    expect(m.lead_members).toEqual([]);
    // El owner, aunque también es lead de «Plataforma», recibe la vista de owner (is_lead false, lead_members vacío).
    const o = await dash(owen, teamA);
    expect(o.is_lead).toBe(false);
    expect(o.lead_members).toEqual([]);
  });

  it('AC-3 member y viewer reciben los totales y el JSON no trae ningún user_id ni nombre', async () => {
    const owner = await dash(owen, teamA);
    for (const [user, role] of [[mara, 'member'], [nico, 'member'], [vera, 'viewer']] as const) {
      const d = await dash(user, teamA);
      expect(d.role).toBe(role);
      expect(d.totals).toEqual(owner.totals);
      expect(d.per_day).toEqual(owner.per_day);
      expect(d.members).toEqual([]);
      expect(d.lead_members).toEqual([]);
      expect(d.top_apps).toEqual([]);
      const json = JSON.stringify(d);
      expect(json).not.toMatch(/"user_id"|"name"|"app_name"/);
      for (const id of [owen, adam, lena, mara, nico, vera]) expect(json).not.toContain(id);
      for (const name of ['Owen', 'Adam', 'Lena', 'Mara', 'Nico', 'Vera']) expect(json).not.toContain(name);
    }
  });

  it('AC-4 con solo owner y viewer, el viewer no recibe totales y el owner sí', async () => {
    const v = await dash(vic, teamC);
    expect(v.role).toBe('viewer');
    expect(v.totals).toBeNull();
    expect(v.per_day).toEqual([]);
    const o = await dash(ofe, teamC);
    expect(o.totals?.members).toBe(1);
    expect(o.totals?.hours_active).toBe(0);
    expect(o.per_day).toHaveLength(1);

    // Umbral de 2: al sumar un member (owner + member = 2 miembros sin contar viewer), member y viewer SÍ reciben totales.
    const mia = await db.createUser('mia@pulso.test');
    await db.admin("insert into team_members (team_id, user_id, role, consent_version, consent_at) values ($1, $2, 'member', 'v2', now())", [teamC, mia]);
    for (const user of [mia, vic]) {
      const d = await dash(user, teamC);
      expect(d.totals?.members).toBe(2);
      expect(d.per_day).toHaveLength(1);
    }
  });
});

describe('permisos y periodo (AC-5)', () => {
  it('AC-5 alguien de otro equipo recibe 42501; un periodo inválido da 22023', async () => {
    const forbidden = /No permitido/;
    const calls = [
      `select team_dashboard($1, ${YESTERDAY[0]}, ${YESTERDAY[1]})`,
      'select * from team_presence($1)',
      `select * from my_time_by_task($1, ${YESTERDAY[0]}, ${YESTERDAY[1]})`,
      'select set_share_app_names($1, false)',
    ];
    for (const sql of calls) {
      expect(await failure(() => db.as(zoe, (q) => q(sql, [teamA])))).toMatch(forbidden);
      // Un equipo que no existe tampoco deja pasar.
      expect(await failure(() => db.as(owen, (q) => q(sql, ['00000000-0000-0000-0000-000000000000'])))).toMatch(forbidden);
    }
    const [from] = YESTERDAY;
    const ninetyTwo = `${from} + interval '92 days'`;
    // 92 días exactos sí; un minuto más, no; fin igual o anterior al inicio, no.
    await db.as(owen, (q) => q(`select team_dashboard($1, ${from}, ${ninetyTwo})`, [teamA]));
    await db.as(owen, (q) => q(`select * from my_time_by_task($1, ${from}, ${ninetyTwo})`, [teamA]));
    for (const to of [`${ninetyTwo} + interval '1 minute'`, from, `${from} - interval '1 day'`]) {
      expect(await failure(() => db.as(owen, (q) => q(`select team_dashboard($1, ${from}, ${to})`, [teamA])))).toMatch(/Rango inválido/);
      expect(await failure(() => db.as(owen, (q) => q(`select * from my_time_by_task($1, ${from}, ${to})`, [teamA])))).toMatch(/Rango inválido/);
    }
  });
});

describe('presencia (AC-6)', () => {
  it('AC-6 estados, visibilidad por rol y sin datos de apps', async () => {
    // Bloques relativos a now(): owen IA terminó hace 1 min → active; adam productive terminó hace 5 min → offline;
    // lena paused hace 1 min (con otro más viejo antes: manda el último) → paused; mara break hace 2 min → break;
    // nico idle hace 1 min → idle.
    const recent = (user: string, from: number, to: number, category: string, tool: string | null = null) =>
      block(user, teamA, `now() - interval '${from} minutes'`, `now() - interval '${to} minutes'`, 'secreto.exe', category, tool, null, 'secreto.example.com');
    const ids = [
      await recent(owen, 10, 1, 'ai', 'ChatGPT'),
      await recent(adam, 20, 5, 'productive'),
      await block(lena, teamA, "now() - interval '40 minutes'", "now() - interval '20 minutes'", 'secreto.exe', 'productive'),
      await recent(lena, 9, 1, 'paused'),
      await recent(mara, 8, 2, 'break'),
      await recent(nico, 7, 1, 'idle'),
    ];
    const [owenStart] = await db.admin<{ s: Date }>('select started_at as s from activity_blocks where id = $1', [ids[0]!]);

    try {
      const view = async (user: string) => db.as(user, (q) => q<{ user_id: string; name: string; state: string; since: Date | null }>('select * from team_presence($1)', [teamA]));
      const states = (rows: { name: string; state: string }[]) => Object.fromEntries(rows.map((r) => [r.name, r.state]));
      const all = { Adam: 'offline', Lena: 'paused', Mara: 'break', Nico: 'idle', Owen: 'active' };

      for (const user of [owen, adam]) {
        const rows = await view(user);
        expect(states(rows)).toEqual(all);
        expect(rows.map((r) => r.name)).toEqual(['Adam', 'Lena', 'Mara', 'Nico', 'Owen']);
        // Sin app, dominio ni herramienta de IA: solo estas cuatro columnas.
        expect(Object.keys(rows[0]!)).toEqual(['user_id', 'name', 'state', 'since']);
        expect(JSON.stringify(rows)).not.toMatch(/secreto|ChatGPT/);
        // since = inicio del último bloque; nulo si está offline.
        expect(new Date(rows.find((r) => r.name === 'Owen')!.since!).getTime()).toBe(new Date(owenStart!.s).getTime());
        expect(rows.find((r) => r.name === 'Adam')!.since).toBeNull();
      }

      // El lead ve solo a las personas de sus proyectos (lena, mara y owen).
      expect(states(await view(lena))).toEqual({ Lena: 'paused', Mara: 'break', Owen: 'active' });

      // Member sin lead: 42501 con la política en false; viewer y ajeno, siempre.
      for (const user of [mara, nico, vera, zoe]) {
        expect(await failure(() => view(user))).toMatch(/No permitido/);
      }
      await setSettings(owen, { presence: true });
      expect(states(await view(mara))).toEqual(all);
      expect(states(await view(nico))).toEqual(all);
      expect(states(await view(lena))).toEqual(all);
      for (const user of [vera, zoe]) {
        expect(await failure(() => view(user))).toMatch(/No permitido/);
      }
    } finally {
      await setSettings(owen);
      await db.admin('delete from activity_blocks where id = any($1::uuid[])', [ids]);
    }
  });
});

describe('capacidad (AC-7)', () => {
  it('AC-7 jornada L-V 08:00-18:00: lunes a miércoles de la semana pasada = 30 h; 15 h activas = 50 %', async () => {
    // Nico: 3 bloques productive de 08:00 a 13:00 (5 h) de lunes a miércoles de la semana pasada = 15 h.
    // Capacidad = 10 h (18:00 - 08:00) × 3 días laborables (lunes, martes, miércoles) = 30 h → 100 × 15 / 30 = 50.
    for (const day of [0, 1, 2]) await block(nico, teamA, lastWeek(day, '08:00'), lastWeek(day, '13:00'), 'Excel', 'productive');
    const period: [string, string] = [lastWeek(0, '00:00'), lastWeek(3, '00:00')];
    const byName = (d: Dash) => Object.fromEntries(d.members.map((m) => [m.name, m]));

    const d = await dash(owen, teamA, period);
    const m = byName(d);
    expect(m.Nico).toMatchObject({ hours_active: 15, capacity_hours: 30, capacity_share: 50 });
    expect(m.Owen).toMatchObject({ hours_active: 0, capacity_hours: 30, capacity_share: 0 });
    expect(d.per_day).toHaveLength(3);
    // Lead y member no reciben capacidad.
    expect((await dash(lena, teamA, period)).members).toEqual([]);

    // Esta semana: solo cuentan los días laborables hasta hoy incluido → 10 h × min(día ISO de hoy, 5).
    const [today] = await db.admin<{ d: number }>("select extract(isodow from (now() at time zone 'America/Bogota')::date)::integer as d");
    const week = await dash(owen, teamA, [thisMonday, `${thisMonday} + interval '7 days'`]);
    expect(byName(week).Nico!.capacity_hours).toBe(10 * Math.min(today!.d, 5));

    // Con bloques de la semana en curso (lunes 00:00-00:30, en la zona del perfil): capacidad = 10 h × días laborables
    // transcurridos de lunes a hoy, calculados aquí con la misma zona (America/Bogota); 0,5 h activas.
    const [elapsed] = await db.admin<{ n: number }>(
      `select count(*)::integer as n from generate_series((date_trunc('week', now() at time zone 'America/Bogota'))::date,
         (now() at time zone 'America/Bogota')::date, interval '1 day') d where extract(isodow from d) <= 5`);
    const mondayBlock = await block(nico, teamA, thisMonday, `${thisMonday} + interval '30 minutes'`, 'Excel', 'productive');
    try {
      const w = byName(await dash(owen, teamA, [thisMonday, `${thisMonday} + interval '7 days'`]));
      const capacity = 10 * elapsed!.n;
      expect(w.Nico).toMatchObject({ hours_active: 0.5, capacity_hours: capacity, capacity_share: Math.round((100 * 0.5) / capacity) });
    } finally {
      await db.admin('delete from activity_blocks where id = $1', [mondayBlock]);
    }

    // Jornada sin días (set_team_settings exige uno, así que se escribe directo): capacidad 0 y sin porcentaje.
    await db.admin(`update teams set settings = jsonb_set(settings, '{workday}', '{"days": [], "start": "08:00", "end": "18:00"}') where id = $1`, [teamA]);
    try {
      const empty = byName(await dash(owen, teamA, period));
      expect(empty.Nico).toMatchObject({ hours_active: 15, capacity_hours: 0, capacity_share: null });
    } finally {
      await db.admin(`update teams set settings = jsonb_set(settings, '{workday}', $2::jsonb) where id = $1`, [teamA, JSON.stringify(DEFAULT_WORKDAY)]);
    }
  });
});

describe('regla de IA (AC-8)', () => {
  it('AC-8 hours_productive suma la IA solo si el equipo lo decide; los hechos de F4 no cambian', async () => {
    const facts = () => db.as(owen, (q) => q<{ f: unknown }>("select get_report_facts($1, 'team', $1, 'yesterday') as f", [teamA])).then((r) => r[0]!.f);
    const before = await facts();
    const off = await dash(owen, teamA);
    // false: solo productive. Total 5; por persona lena 2, mara 1, nico 1, owen 1, adam 0.
    expect(off.totals?.hours_productive).toBe(5);
    expect(off.members.map((m) => m.hours_productive)).toEqual([0, 2, 1, 1, 1]);

    await setSettings(owen, { ai: true });
    try {
      const on = await dash(owen, teamA);
      // true: productive + ai. Total 5 + 4 = 9; adam 0 + 0,5 · lena 2 + 1 · mara 1 + 1 · nico 1 + 1 · owen 1 + 0,5.
      expect(on.totals?.hours_productive).toBe(9);
      expect(on.members.map((m) => m.hours_productive)).toEqual([0.5, 3, 2, 2, 1.5]);
      // Las categorías guardadas no cambian.
      expect(on.totals?.hours_category).toEqual(off.totals?.hours_category);
      expect(on.members.map((m) => m.hours_category)).toEqual(off.members.map((m) => m.hours_category));
      expect(await facts()).toEqual(before);
    } finally {
      await setSettings(owen);
    }
  });
});

describe('no compartir nombres de apps (AC-9)', () => {
  it('AC-9 oculta lo ya subido, lo nuevo y deja la categoría; solo en ese equipo', async () => {
    const nicoBlocks = (team: string) =>
      db.admin<{ app_name: string; domain: string | null; category: string; ai_tool: string | null }>(
        'select app_name, domain, category, ai_tool from activity_blocks where team_id = $1 and user_id = $2 order by started_at', [team, nico]);
    // Antes: nico comparte (por defecto) y sus apps salen en el top.
    const before = await dash(owen, teamA);
    expect(before.members.find((m) => m.user_id === nico)!.share_app_names).toBe(true);
    expect(before.top_apps.some((a) => a.app_name === 'Excel')).toBe(true);

    // El viewer no puede.
    expect(await failure(() => db.as(vera, (q) => q('select set_share_app_names($1, false)', [teamA])))).toMatch(/No permitido/);

    await db.as(nico, (q) => q('select set_share_app_names($1, false)', [teamA]));
    const hidden = await nicoBlocks(teamA);
    expect(hidden.length).toBeGreaterThan(0);
    for (const b of hidden) expect(b).toMatchObject({ app_name: 'App oculta', domain: null });
    // La categoría y la herramienta de IA se conservan.
    expect(hidden.filter((b) => b.category === 'ai').map((b) => b.ai_tool)).toEqual(['ChatGPT']);
    expect(new Set(hidden.map((b) => b.category))).toEqual(new Set(['productive', 'ai']));
    // En el otro equipo no cambia nada.
    expect(await nicoBlocks(teamB)).toEqual([{ app_name: 'Notepad', domain: null, category: 'neutral', ai_tool: null }]);

    // Un upsert nuevo (o una actualización) con nombre real queda oculto.
    const fixed = '11111111-1111-4111-8111-111111111111';
    const upsert = `insert into activity_blocks (id, team_id, user_id, started_at, ended_at, app_name, category, domain)
      values ($3, $1, $2, now() - interval '3 days', now() - interval '3 days' + interval '1 hour', $4, 'neutral', 'real.example.com')
      on conflict (id) do update set app_name = excluded.app_name, domain = excluded.domain
      returning app_name, domain`;
    expect(await db.as(nico, (q) => q(upsert, [teamA, nico, fixed, 'Real.exe']))).toEqual([{ app_name: 'App oculta', domain: null }]);
    expect(await db.as(nico, (q) => q(upsert, [teamA, nico, fixed, 'Otra.exe']))).toEqual([{ app_name: 'App oculta', domain: null }]);

    // El tablero: sin sus apps en el top (ChatGPT queda solo con lena), marcado «no comparte» y sin 'App oculta'.
    const after = await dash(owen, teamA);
    expect(after.members.find((m) => m.user_id === nico)!.share_app_names).toBe(false);
    expect(after.members.find((m) => m.user_id === nico)!.hours_active).toBe(2);
    expect(after.top_apps.map((a) => a.app_name)).not.toContain('Excel');
    expect(after.top_apps.map((a) => a.app_name)).not.toContain('App oculta');
    expect(after.top_apps.find((a) => a.app_name === 'ChatGPT')!.hours).toBe(1);

    // Auditoría.
    const audit = await db.admin<{ actor_id: string; target_user: string; details: unknown }>(
      "select actor_id, target_user, details from audit_log where team_id = $1 and action = 'share_apps_changed'", [teamA]);
    expect(audit).toEqual([{ actor_id: nico, target_user: nico, details: { share: false } }]);

    // Volver a compartir solo afecta a lo nuevo.
    await db.as(nico, (q) => q('select set_share_app_names($1, true)', [teamA]));
    expect((await nicoBlocks(teamA)).filter((b) => b.app_name === 'App oculta').length).toBe(hidden.length + 1);
    expect(await db.as(nico, (q) => q(upsert, [teamA, nico, '22222222-2222-4222-8222-222222222222', 'Visible.exe']))).toEqual([{ app_name: 'Visible.exe', domain: 'real.example.com' }]);
  });
});

describe('ajustes del equipo (AC-10)', () => {
  it('AC-10 solo owner y admin; valida; conserva las demás claves y deja auditoría', async () => {
    for (const user of [lena, mara, vera, nico, zoe]) {
      expect(await failure(() => setSettings(user))).toMatch(/No permitido/);
    }
    const countAudit = async () =>
      (await db.admin<{ n: number }>("select count(*)::integer as n from audit_log where team_id = $1 and action = 'settings_changed'", [teamA]))[0]!.n;
    const auditBefore = await countAudit();
    // Valores inválidos.
    const invalid: [SettingsArgs, RegExp][] = [
      [{ idle: 2 }, /entre 3 y 15/],
      [{ idle: 16 }, /entre 3 y 15/],
      [{ workday: { days: [1, 1], start: '08:00', end: '18:00' } }, /repetirse/],
      [{ workday: { days: [], start: '08:00', end: '18:00' } }, /al menos un día/],
      [{ workday: { days: [0, 1], start: '08:00', end: '18:00' } }, /de 1 \(lunes\) a 7/],
      [{ workday: { days: [8], start: '08:00', end: '18:00' } }, /de 1 \(lunes\) a 7/],
      [{ workday: { days: [1], start: '18:00', end: '08:00' } }, /anterior al fin/],
      [{ workday: { days: [1], start: '08:00', end: '08:00' } }, /anterior al fin/],
      [{ workday: { days: [1], start: '8:00', end: '18:00' } }, /HH:MM/],
      [{ cap: 45 }, /tope de pausa/],
    ];
    for (const [args, message] of invalid) {
      expect(await failure(() => setSettings(owen, args))).toMatch(message);
    }

    // Claves ajenas de teams.settings y de policies se conservan.
    await db.admin(
      `update teams set settings = settings || '{"otra": {"a": 1}, "policies": {"allow_hidden_apps": true, "alert_repeat_minutes": 5}}'::jsonb where id = $1`, [teamA]);
    const workday = { days: [5, 1, 3], start: '07:30', end: '16:00' };
    await setSettings(adam, { idle: 5, workday, ai: true, presence: true, cap: 60 });
    const [row] = await db.admin<{ settings: Record<string, unknown> }>('select settings from teams where id = $1', [teamA]);
    expect(row!.settings).toEqual({
      otra: { a: 1 },
      idle_minutes: 5,
      workday: { days: [1, 3, 5], start: '07:30', end: '16:00' },
      policies: { allow_hidden_apps: true, alert_repeat_minutes: 5, ai_counts_as_productive: true, presence_visible_to_members: true, pause_cap_minutes: 60 },
    });
    const audit = await db.admin<{ actor_id: string; details: unknown }>(
      "select actor_id, details from audit_log where team_id = $1 and action = 'settings_changed' order by id desc limit 1", [teamA]);
    expect(audit).toEqual([{
      actor_id: adam,
      details: {
        idle_minutes: 5, workday: { days: [1, 3, 5], start: '07:30', end: '16:00' },
        ai_counts_as_productive: true, presence_visible_to_members: true, pause_cap_minutes: 60,
      },
    }]);

    // Sin umbral de equipo (null) la clave idle_minutes desaparece; los límites 3 y 15 valen.
    await setSettings(owen, { idle: 3 });
    await setSettings(owen, { idle: 15 });
    await setSettings(owen, { idle: null, cap: 0 });
    const [after] = await db.admin<{ settings: Record<string, unknown> }>('select settings from teams where id = $1', [teamA]);
    expect(after!.settings).not.toHaveProperty('idle_minutes');
    expect(after!.settings).toMatchObject({ otra: { a: 1 }, workday: DEFAULT_WORKDAY });
    // Los intentos rechazados no dejan rastro: solo las cuatro llamadas buenas (adam, 3, 15 y null).
    expect(await countAudit()).toBe(auditBefore + 4);
    // Limpieza: vuelve a los ajustes por defecto para las pruebas siguientes.
    await db.admin(`update teams set settings = jsonb_build_object('workday', $2::jsonb) where id = $1`, [teamA, JSON.stringify(DEFAULT_WORKDAY)]);
  });
});

describe('mi tiempo por tarea (AC-11)', () => {
  it('AC-11 solo entradas propias; la entrada sin tarea sale con task_id nulo', async () => {
    const mine = async (user: string) =>
      (await db.as(user, (q) => q<{ project_id: string | null; project_name: string | null; task_id: string | null; task_title: string | null; seconds: bigint }>(
        `select * from my_time_by_task($1, ${YESTERDAY[0]}, ${YESTERDAY[1]})`, [teamA])))
        .map((r) => ({ ...r, seconds: Number(r.seconds) }));
    // Mara: «Otro»/T6 16:00-17:00 = 3600 s · «Plataforma»/T1 abierto desde 14:30 recortado a las 24:00 = 9,5 h = 34200 s
    // (el borrado 14:00-14:30 no cuenta) · sin tarea 06:00-06:30 = 1800 s. Orden: proyecto (nulos al final), tarea.
    expect(await mine(mara)).toEqual([
      { project_id: projectQ, project_name: 'Otro', task_id: t6, task_title: 'T6', seconds: 3600 },
      { project_id: projectP, project_name: 'Plataforma', task_id: t1, task_title: 'T1', seconds: 34200 },
      { project_id: null, project_name: null, task_id: null, task_title: null, seconds: 1800 },
    ]);
    // Nico: solo su hora en T1 (el temporizador abierto de mara no aparece). Lena: solo T2 (2 h).
    expect(await mine(nico)).toEqual([{ project_id: projectP, project_name: 'Plataforma', task_id: t1, task_title: 'T1', seconds: 3600 }]);
    expect(await mine(lena)).toEqual([{ project_id: projectP, project_name: 'Plataforma', task_id: t2, task_title: 'T2', seconds: 7200 }]);
    expect(await mine(adam)).toEqual([]);
    // Un viewer no tiene tiempo propio.
    expect(await failure(() => mine(vera))).toMatch(/No permitido/);
  });
});

describe('reporte personal (AC-12)', () => {
  it('AC-12 data_until es nulo sin bloques en el periodo y el fin del último con bloques', async () => {
    const sina = await db.createUser('sina@pulso.test');
    await db.admin("insert into team_members (team_id, user_id, role, consent_version, consent_at) values ($1, $2, 'member', 'v2', now())", [teamA, sina]);
    const personal = async (user: string, period: string) => {
      const f = await db.as(user, (q) => q<{ f: { facts_hash: string } }>("select get_report_facts($1, 'personal', $2, $3) as f", [teamA, user, period]));
      const narrative = { summary: 'Resumen.', insights: [{ text: 'Una observación.', fact_ids: ['F1'] }], recommendations: [], insufficient_data: false };
      const [r] = await db.as(user, (q) =>
        q<{ id: string }>("select save_report($1, 'personal', $2, $3, $4, $5::jsonb, 'own_key', 'ok', 'report.v2', 'es') as id",
          [teamA, user, period, f[0]!.f.facts_hash, JSON.stringify(narrative)]));
      return (await db.admin<{ data_until: Date | null }>('select data_until from report_runs where id = $1', [r!.id]))[0]!.data_until;
    };
    // Sin ningún bloque: nulo (antes quedaba el fin del periodo).
    expect(await personal(sina, 'today')).toBeNull();
    // Lena solo tiene bloques de ayer: en «hoy» no hay bloques del periodo → nulo.
    expect(await personal(lena, 'today')).toBeNull();
    // Con bloques ayer: el fin del último (12:00 local).
    const [expected] = await db.admin<{ t: Date }>(`select ${local(-1, '12:00')} as t`);
    const until = await personal(lena, 'yesterday');
    expect(new Date(until!).getTime()).toBe(new Date(expected!.t).getTime());
  });
});

describe('permisos de funciones (AC-13)', () => {
  it('AC-13 authenticated ejecuta las seis funciones públicas y ninguna auxiliar; anon, ninguna', async () => {
    const PUBLIC = ['team_dashboard', 'team_presence', 'set_team_settings', 'set_share_app_names', 'my_time_by_task', 'save_report'];
    const INTERNAL = ['hide_app_names', 'dashboard_hours', 'dashboard_cats', 'assert_dashboard_period', 'lead_projects'];
    const rows = await db.admin<{ name: string; auth: boolean; anon: boolean }>(
      `select p.proname as name, has_function_privilege('authenticated', p.oid, 'execute') as auth, has_function_privilege('anon', p.oid, 'execute') as anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = any($1::text[]) order by 1`, [[...PUBLIC, ...INTERNAL]]);
    expect(rows.map((r) => r.name)).toEqual([...PUBLIC, ...INTERNAL].sort());
    for (const r of rows) {
      expect({ name: r.name, auth: r.auth, anon: r.anon }).toEqual({ name: r.name, auth: PUBLIC.includes(r.name), anon: false });
    }
    // La igualdad exacta de la lista de funciones que puede ejecutar authenticated (ALLOWED, con estas cinco nuevas)
    // está en supabase/tests/ia_y_reportes.test.ts; aquí solo se comprueba cada una de las nuevas.
    const allowed = await db.admin<{ name: string }>(
      `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prorettype <> 'trigger'::regtype and has_function_privilege('authenticated', p.oid, 'execute')`);
    for (const name of PUBLIC) expect(allowed.map((r) => r.name)).toContain(name);
    for (const name of INTERNAL) expect(allowed.map((r) => r.name)).not.toContain(name);
  });
});
