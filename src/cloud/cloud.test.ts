import { describe, expect, it } from 'vitest';
import type { SyncBlock } from '@/bridge/contract';
import { CONSENT_VERSION } from '@/lib/consent';
import { AUDIT_PAGE_SIZE, DEFAULT_WORKDAY, TeamDashboardSchema, normalizeProcessPattern } from './contract';
import { createMockCloud } from './mock';
import { myTeamFromRow, teamDashboardFromRow } from './supabase';

/** Capa de nube de F5 (spec F5-tableros-privacidad: D-2, D-4, D-8, D-9, D-12, D-13). */

const uuid = () => crypto.randomUUID();
const CATS = { productive: 1, neutral: 0, distraction: 0, ai: 0 };

describe('MyTeam: campos nuevos de F5 (Contratos → Nube)', () => {
  const base = { team_id: uuid(), role: 'member', consent_at: null, consent_version: null };

  it('trae los valores de teams.settings y de la fila propia', () => {
    const team = myTeamFromRow({
      ...base,
      share_app_names: false,
      teams: {
        name: 'Equipo A',
        settings: {
          idle_minutes: 7,
          workday: { days: [1, 2, 3], start: '09:00', end: '17:00' },
          policies: { ai_counts_as_productive: true, presence_visible_to_members: true, pause_cap_minutes: 60, allow_hidden_apps: false },
        },
      },
    });
    expect(team).toMatchObject({
      idleMinutes: 7,
      workday: { days: [1, 2, 3], start: '09:00', end: '17:00' },
      aiCountsAsProductive: true,
      presenceVisibleToMembers: true,
      pauseCapMinutes: 60,
      shareAppNames: false,
      allowHiddenApps: false,
    });
  });

  it('usa los valores por defecto de la spec si faltan', () => {
    for (const settings of [null, {}, { policies: {} }, { idle_minutes: 99, policies: { pause_cap_minutes: 'x' } }]) {
      const team = myTeamFromRow({ ...base, teams: { name: 'Equipo A', settings } });
      expect(team).toMatchObject({
        idleMinutes: null,
        workday: DEFAULT_WORKDAY,
        aiCountsAsProductive: false,
        presenceVisibleToMembers: false,
        pauseCapMinutes: 0,
        shareAppNames: true,
      });
    }
  });

  it('share_app_names null (migración sin aplicar) cuenta como true', () => {
    const team = myTeamFromRow({ ...base, share_app_names: null, teams: { name: 'Equipo A', settings: null } });
    expect(team.shareAppNames).toBe(true);
  });
});

describe('teamDashboard: validación de la respuesta del servidor', () => {
  const task = { id: uuid(), title: 'Tarea', project_id: uuid(), project_name: 'Proyecto' };
  const totals = {
    members: 2,
    hours_active: 3.5,
    hours_productive: 2,
    hours_category: { productive: 2, neutral: 0.5, distraction: 0, ai: 1 },
    ai_hours: 1,
    ai_sessions: 2,
    ai_tool: { claude: 0.5, other: 0.5 },
    ai_usage: { code: 0.5, writing: 0, analysis: 0, other: 0, untagged: 0.5 },
    tasks_doing: 1,
    tasks_done: 3,
  };
  const perDay = [{ day: '2026-10-13', hours_category: { productive: 2, neutral: 0.5, distraction: 0, ai: 1 } }];

  it('owner: pasa a camelCase con personas, capacidad y apps', () => {
    const userId = uuid();
    const dash = teamDashboardFromRow({
      role: 'owner',
      is_lead: false,
      totals,
      per_day: perDay,
      members: [
        {
          user_id: userId,
          name: 'Ana',
          share_app_names: false,
          hours_active: 3.5,
          hours_productive: 2,
          hours_category: { productive: 2, neutral: 0.5, distraction: 0, ai: 1 },
          ai_hours: 1,
          ai_sessions: 2,
          capacity_hours: 30,
          capacity_share: null,
          tasks_doing: [task],
        },
      ],
      lead_members: [],
      top_apps: [{ app_name: 'code', hours: 2 }],
    });
    expect(dash.role).toBe('owner');
    expect(dash.totals?.aiTool).toEqual({ claude: 0.5, other: 0.5 });
    expect(dash.totals?.hoursCategory.ai).toBe(1);
    expect(dash.members[0]).toMatchObject({ userId, name: 'Ana', shareAppNames: false, capacityShare: null });
    expect(dash.members[0]!.tasksDoing[0]).toEqual({ id: task.id, title: 'Tarea', projectId: task.project_id, projectName: 'Proyecto' });
    expect(dash.topApps).toEqual([{ appName: 'code', hours: 2 }]);
    expect(dash.perDay[0]!.hoursCategory.neutral).toBe(0.5);
  });

  it('viewer: sin userId ni name en ninguna parte', () => {
    const dash = teamDashboardFromRow({ role: 'viewer', is_lead: false, totals, per_day: perDay, members: [], lead_members: [], top_apps: [] });
    expect(dash.members).toEqual([]);
    expect(dash.leadMembers).toEqual([]);
    const json = JSON.stringify(dash);
    expect(json).not.toMatch(/userId|"name"|user_id/);
  });

  it('viewer con equipo de menos de 2 miembros: totals null y per_day vacío', () => {
    const dash = teamDashboardFromRow({ role: 'viewer', is_lead: false, totals: null, per_day: [], members: [], lead_members: [], top_apps: [] });
    expect(dash.totals).toBeNull();
    expect(dash.perDay).toEqual([]);
  });

  it('lead: lead_members con las horas en sus proyectos', () => {
    const userId = uuid();
    const dash = teamDashboardFromRow({
      role: 'member',
      is_lead: true,
      totals,
      per_day: perDay,
      members: [],
      lead_members: [{ user_id: userId, name: null, project_hours: 2.5, ai_hours_in_projects: 0.5, tasks_doing: [task] }],
      top_apps: [],
    });
    expect(dash.isLead).toBe(true);
    expect(dash.leadMembers[0]).toMatchObject({ userId, name: null, projectHours: 2.5, aiHoursInProjects: 0.5 });
  });

  it('rechaza campos de más, de menos o con otro tipo', () => {
    const ok = { role: 'viewer', is_lead: false, totals: null, per_day: [], members: [], lead_members: [], top_apps: [] };
    expect(() => teamDashboardFromRow({ ...ok, extra: 1 })).toThrow();
    expect(() => teamDashboardFromRow({ ...ok, role: 'root' })).toThrow();
    expect(() => teamDashboardFromRow({ ...ok, top_apps: [{ app_name: 'x', hours: 'uno' }] })).toThrow();
    expect(() => teamDashboardFromRow({ ...ok, per_day: [{ day: 'ayer', hours_category: CATS }] })).toThrow();
    expect(() => teamDashboardFromRow({ ...ok, top_apps: undefined })).toThrow();
    expect(() => TeamDashboardSchema.parse({ ...ok, topApps: [], perDay: [], members: [], leadMembers: [], isLead: false, userId: uuid() })).toThrow();
  });
});

describe('reglas por app (D-13)', () => {
  it("normaliza el patrón: '  Code.EXE ' → 'code'", () => {
    expect(normalizeProcessPattern('  Code.EXE ')).toBe('code');
    expect(normalizeProcessPattern('Figma')).toBe('figma');
    expect(normalizeProcessPattern('app.exe.exe')).toBe('app.exe');
    expect(normalizeProcessPattern(' .exe ')).toBe('');
  });

  it('la nube simulada crea la regla normalizada, la lista, la manda al sensor y la borra con removeDomainRule', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.addProcessRule(team, '  Code.EXE ', 'productive');
    const rules = await cloud.processRules(team);
    expect(rules).toEqual([{ id: expect.any(String), pattern: 'code', category: 'productive' }]);
    expect(await cloud.teamRules(team)).toContainEqual({ match: 'process', pattern: 'code', category: 'productive', ai_tool: null, not_allowed: false });
    await cloud.removeDomainRule(rules[0]!.id);
    expect(await cloud.processRules(team)).toEqual([]);
  });

  it('rechaza un nombre vacío y a quien no gestiona el equipo', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await expect(cloud.addProcessRule(team, ' .exe ', 'neutral')).rejects.toMatchObject({ kind: 'invalid' });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await expect(cloud.addProcessRule(team, 'code', 'neutral')).rejects.toMatchObject({ kind: 'forbidden' });
  });
});

describe('auditoría simulada (D-12)', () => {
  it('pagina de 50 en 50 con beforeId, de la más nueva a la más vieja', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    for (let id = 1; id <= 120; id++) {
      cloud.debug.audit.push({ teamId: team, id, action: id % 3 === 0 ? 'role_changed' : 'policy_changed', actorId: null, targetUserId: null, details: {}, createdAt: '2026-10-13T10:00:00.000Z' });
    }
    const first = await cloud.auditLog(team);
    expect(first).toHaveLength(AUDIT_PAGE_SIZE);
    expect(first[0]!.id).toBe(120);
    expect(first.at(-1)!.id).toBe(71);
    const second = await cloud.auditLog(team, { beforeId: 71 });
    expect(second.map((r) => r.id)).toEqual(Array.from({ length: 50 }, (_, i) => 70 - i));
    const third = await cloud.auditLog(team, { beforeId: 21 });
    expect(third).toHaveLength(20);
    expect(third.at(-1)!.id).toBe(1);
    expect(await cloud.auditLog(team, { beforeId: 1 })).toEqual([]);
  });

  it('filtra por acción y solo la ven owner y admin', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    for (let id = 1; id <= 10; id++) {
      cloud.debug.audit.push({ teamId: team, id, action: id % 2 ? 'role_changed' : 'policy_changed', actorId: null, targetUserId: null, details: {}, createdAt: '2026-10-13T10:00:00.000Z' });
    }
    const rows = await cloud.auditLog(team, { action: 'role_changed' });
    expect(rows.map((r) => r.id)).toEqual([9, 7, 5, 3, 1]);
    expect(rows[0]).toEqual({ id: 9, action: 'role_changed', actorId: null, targetUserId: null, details: {}, createdAt: '2026-10-13T10:00:00.000Z' });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    expect(await cloud.auditLog(team)).toEqual([]);
  });

  it('setTeamSettings y setShareAppNames dejan su fila', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.setTeamSettings(team, { idleMinutes: 5, workday: DEFAULT_WORKDAY, aiCountsAsProductive: true, presenceVisibleToMembers: false, pauseCapMinutes: 30 });
    await cloud.setShareAppNames(team, false);
    const rows = await cloud.auditLog(team);
    expect(rows.map((r) => r.action)).toEqual(['share_apps_changed', 'settings_changed']);
    expect(rows[1]!.details).toMatchObject({ idle_minutes: 5, pause_cap_minutes: 30, ai_counts_as_productive: true });
  });
});

describe('ajustes del equipo y privacidad simulados (D-8, D-9)', () => {
  const valid = { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive: false, presenceVisibleToMembers: false, pauseCapMinutes: 0 };

  it('guarda los ajustes y myTeams los devuelve', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.setTeamSettings(team, { ...valid, idleMinutes: 8, workday: { days: [3, 1], start: '07:30', end: '15:00' }, pauseCapMinutes: 120, aiCountsAsProductive: true });
    expect((await cloud.myTeams())[0]).toMatchObject({
      idleMinutes: 8,
      workday: { days: [1, 3], start: '07:30', end: '15:00' },
      pauseCapMinutes: 120,
      aiCountsAsProductive: true,
      presenceVisibleToMembers: false,
    });
  });

  it('valida como set_team_settings y solo deja a owner y admin', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    const bad = [
      { ...valid, idleMinutes: 2 },
      { ...valid, idleMinutes: 16 },
      { ...valid, pauseCapMinutes: 45 },
      { ...valid, workday: { ...DEFAULT_WORKDAY, days: [] } },
      { ...valid, workday: { ...DEFAULT_WORKDAY, days: [1, 1] } },
      { ...valid, workday: { ...DEFAULT_WORKDAY, days: [0, 8] } },
      { ...valid, workday: { ...DEFAULT_WORKDAY, start: '18:00', end: '08:00' } },
      { ...valid, workday: { ...DEFAULT_WORKDAY, start: '8:00' } },
    ];
    for (const settings of bad) await expect(cloud.setTeamSettings(team, settings)).rejects.toMatchObject({ kind: 'invalid' });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await expect(cloud.setTeamSettings(team, valid)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('setShareAppNames oculta lo subido y lo nuevo; el viewer no puede', async () => {
    const { cloud, team, ana, viewer } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T13:00:00.000Z', '2026-10-14T14:00:00.000Z', 'productive')]);
    await cloud.setShareAppNames(team, false);
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T14:00:00.000Z', '2026-10-14T14:30:00.000Z', 'productive', 'figma')]);
    expect(cloud.debug.uploaded.blocks.map((b) => [b.appName, b.domain])).toEqual([['App oculta', null], ['App oculta', null]]);
    expect(cloud.debug.uploaded.blocks.every((b) => b.category === 'productive')).toBe(true);
    expect((await cloud.myTeams())[0]!.shareAppNames).toBe(false);
    await cloud.signIn('viv@pulso.test', 'secreto-123');
    await expect(cloud.setShareAppNames(team, false)).rejects.toMatchObject({ kind: 'forbidden' });
    expect(viewer).toBeTruthy();
  });
});

describe('tablero y presencia simulados por rol (D-2, D-3, D-4, D-5)', () => {
  const FROM = '2026-10-13T00:00:00.000Z';
  const TO = '2026-10-15T00:00:00.000Z';

  it('owner ve personas y apps; member y viewer solo totales sin nombres', async () => {
    const { cloud, team, ana, beto } = await setup();
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(beto, [block(team, '2026-10-14T10:00:00.000Z', '2026-10-14T11:00:00.000Z', 'productive')]);
    await cloud.upsertBlocks(beto, [{ ...block(team, '2026-10-14T11:00:00.000Z', '2026-10-14T11:30:00.000Z', 'ai'), aiTool: 'Claude', aiUsageType: 'code' }]);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T12:00:00.000Z', '2026-10-14T13:00:00.000Z', 'neutral', 'notion')]);

    const owner = await cloud.teamDashboard(team, FROM, TO);
    expect(owner).toMatchObject({ role: 'owner', isLead: false });
    expect(owner.totals).toMatchObject({ members: 2, hoursActive: 2.5, hoursProductive: 1, aiHours: 0.5, aiSessions: 1, aiTool: { claude: 0.5 }, aiUsage: { code: 0.5 } });
    expect(owner.members.map((m) => [m.name, m.hoursActive, m.aiHours])).toEqual([['Ana', 1, 0], ['Beto', 1.5, 0.5]]);
    expect(owner.topApps[0]).toEqual({ appName: 'code', hours: 1.5 });
    expect(owner.perDay.reduce((sum, d) => sum + d.hoursCategory.productive + d.hoursCategory.neutral + d.hoursCategory.ai, 0)).toBeCloseTo(2.5, 5);

    for (const email of ['beto@pulso.test', 'viv@pulso.test']) {
      await cloud.signIn(email, 'secreto-123');
      const dash = await cloud.teamDashboard(team, FROM, TO);
      expect(dash.totals?.hoursActive).toBe(2.5);
      expect(dash.members).toEqual([]);
      expect(dash.topApps).toEqual([]);
      expect(JSON.stringify(dash)).not.toMatch(new RegExp(`${ana}|${beto}|Ana|Beto`));
    }
  });

  it('con la regla de IA, hoursProductive suma la IA', async () => {
    const { cloud, team, ana } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T10:00:00.000Z', '2026-10-14T11:00:00.000Z', 'productive')]);
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T11:00:00.000Z', '2026-10-14T12:00:00.000Z', 'ai')]);
    expect((await cloud.teamDashboard(team, FROM, TO)).totals?.hoursProductive).toBe(1);
    await cloud.setTeamSettings(team, { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive: true, presenceVisibleToMembers: false, pauseCapMinutes: 0 });
    expect((await cloud.teamDashboard(team, FROM, TO)).totals?.hoursProductive).toBe(2);
  });

  it('equipo de owner + viewer: el viewer recibe totals null y el owner sí', async () => {
    const cloud = createMockCloud(() => NOW);
    const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    const viv = cloud.debug.addAccount('viv@pulso.test', 'secreto-123', 'Viv');
    const team = cloud.debug.addTeam('Solo dos', ana);
    cloud.debug.addMember(team, viv, 'viewer');
    await cloud.signIn('viv@pulso.test', 'secreto-123');
    const viewer = await cloud.teamDashboard(team, FROM, TO);
    expect(viewer.totals).toBeNull();
    expect(viewer.perDay).toEqual([]);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    expect((await cloud.teamDashboard(team, FROM, TO)).totals).not.toBeNull();
  });

  it('rechaza a quien no es del equipo y los periodos inválidos', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await expect(cloud.teamDashboard(team, TO, FROM)).rejects.toMatchObject({ kind: 'invalid' });
    await expect(cloud.teamDashboard(team, '2026-01-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')).rejects.toMatchObject({ kind: 'invalid' });
    cloud.debug.addAccount('otra@pulso.test', 'secreto-123', 'Otra');
    await cloud.signIn('otra@pulso.test', 'secreto-123');
    await expect(cloud.teamDashboard(team, FROM, TO)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(cloud.teamPresence(team)).rejects.toMatchObject({ kind: 'forbidden' });
    await expect(cloud.myTimeByTask(team, FROM, TO)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('presencia: activo si el bloque terminó hace menos de 3 min, si no desconectado; sin app', async () => {
    const { cloud, team, ana, beto } = await setup();
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(beto, [block(team, '2026-10-14T14:30:00.000Z', '2026-10-14T14:59:00.000Z', 'productive', 'secreto')]);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.upsertBlocks(ana, [block(team, '2026-10-14T14:00:00.000Z', '2026-10-14T14:55:00.000Z', 'productive')]);
    const rows = await cloud.teamPresence(team);
    expect(rows).toEqual([
      { userId: ana, name: 'Ana', state: 'offline', since: null },
      { userId: beto, name: 'Beto', state: 'active', since: '2026-10-14T14:30:00.000Z' },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/secreto|app|domain|ai/i);
  });

  it('presencia: el member solo con la política; el viewer nunca', async () => {
    const { cloud, team } = await setup();
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await expect(cloud.teamPresence(team)).rejects.toMatchObject({ kind: 'forbidden' });
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.setTeamSettings(team, { idleMinutes: null, workday: DEFAULT_WORKDAY, aiCountsAsProductive: false, presenceVisibleToMembers: true, pauseCapMinutes: 0 });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    expect(await cloud.teamPresence(team)).toHaveLength(2);
    await cloud.signIn('viv@pulso.test', 'secreto-123');
    await expect(cloud.teamPresence(team)).rejects.toMatchObject({ kind: 'forbidden' });
  });

  it('myTimeByTask: solo entradas propias; sin tarea, con campos nulos', async () => {
    const { cloud, team, ana, beto } = await setup();
    const entry = (startedAt: string, endedAt: string) => ({
      id: uuid(), teamId: team, startedAt, endedAt, taskId: null, source: 'manual' as const, updatedAt: startedAt, deletedAt: null,
    });
    await cloud.signIn('beto@pulso.test', 'secreto-123');
    await cloud.upsertEntries(beto, [entry('2026-10-14T10:00:00.000Z', '2026-10-14T12:00:00.000Z')]);
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.upsertEntries(ana, [entry('2026-10-14T10:00:00.000Z', '2026-10-14T10:30:00.000Z')]);
    expect(await cloud.myTimeByTask(team, FROM, TO)).toEqual([{ projectId: null, projectName: null, taskId: null, taskTitle: null, seconds: 1800 }]);
  });
});

// ---- utilidades ----

const NOW = new Date('2026-10-14T15:00:00.000Z');

/** Equipo con owner Ana, member Beto y viewer Viv, todos con consentimiento. */
async function setup() {
  const cloud = createMockCloud(() => NOW);
  const ana = cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
  const beto = cloud.debug.addAccount('beto@pulso.test', 'secreto-123', 'Beto');
  const viewer = cloud.debug.addAccount('viv@pulso.test', 'secreto-123', 'Viv');
  const team = cloud.debug.addTeam('Equipo A', ana);
  cloud.debug.addMember(team, beto, 'member');
  cloud.debug.addMember(team, viewer, 'viewer');
  await cloud.signIn('ana@pulso.test', 'secreto-123');
  await cloud.giveConsent(team, CONSENT_VERSION);
  await cloud.ensureProfile('America/Bogota');
  await cloud.signIn('beto@pulso.test', 'secreto-123');
  await cloud.ensureProfile('America/Bogota');
  await cloud.signIn('viv@pulso.test', 'secreto-123');
  await cloud.ensureProfile('America/Bogota');
  return { cloud, team, ana, beto, viewer };
}

function block(teamId: string, startedAt: string, endedAt: string, category: SyncBlock['category'], appName = 'code'): SyncBlock {
  return { id: uuid(), teamId, startedAt, endedAt, appName, category, aiTool: null, domain: null, aiUsageType: null };
}
