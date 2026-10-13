#!/usr/bin/env node
/**
 * Validación de F4 contra pulso-dev (docs/VALIDACION.md, pasos 4.2 a 4.7 y 4.19): la parte que solo necesita
 * Supabase y la Edge Function `ai-trial`, sin la app de escritorio. Usa tres cuentas de prueba:
 *   A = owner del equipo, B = member, C = viewer.
 *
 * Preparación (P): inicia sesión con cada cuenta (si no existe, la registra: ADR-0008 no exige verificar el correo).
 * Sin PULSO_TEAM_ID crea un equipo «Validación F4 <fecha>», A invita a B (member) y a C (viewer) y ellas aceptan con
 * el código y la versión de consentimiento de src/lib/consent.ts. Al terminar imprime el id del equipo para reutilizarlo.
 *
 * Pruebas, en este orden (cada una imprime «<paso> <CUMPLE|FALLA|OMITIDO> <motivo>»):
 *   4.2 reporte personal gratis, validado en el servidor · 4.3 repetirlo devuelve el guardado y no crece el historial
 *   4.5 un member no genera el reporte de equipo · 4.6 el owner sí, y queda `report_generated` en audit_log
 *   4.7 el viewer ve el reporte de equipo y ningún personal, y no genera · 4.19 cupo con 10 peticiones simultáneas
 *   4.4 (la más lenta, unos 3 minutos) el sexto reporte nuevo del día responde el límite diario.
 * Gasta cupo gratis: hasta 5 reportes de B, 1 de A y 1 más de A en 4.19. No llama a la IA salvo por la Edge Function.
 *
 * Variables de entorno (ninguna se imprime; sin alguna, el script no corre):
 *   PULSO_SUPABASE_URL, PULSO_SUPABASE_ANON_KEY, PULSO_EMAIL_A, PULSO_EMAIL_B, PULSO_EMAIL_C,
 *   PULSO_PASSWORD (la misma para las tres cuentas). Opcional: PULSO_TEAM_ID.
 *
 * Uso (PowerShell): $env:PULSO_EMAIL_A = '...'; ...; node scripts/f4-validar-nube.mjs
 */
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['PULSO_SUPABASE_URL', 'PULSO_SUPABASE_ANON_KEY', 'PULSO_EMAIL_A', 'PULSO_EMAIL_B', 'PULSO_EMAIL_C', 'PULSO_PASSWORD'];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}. No se ejecuta nada.`);
  process.exit(2);
}
const env = (name) => process.env[name];

// La versión del consentimiento se lee de la fuente (no se copia a mano): src/lib/consent.ts.
const consentSource = readFileSync(new URL('../src/lib/consent.ts', import.meta.url), 'utf8');
const consentMatch = consentSource.match(/export const CONSENT_VERSION\s*=\s*'([^']+)'/);
if (!consentMatch) {
  console.error('No se pudo leer CONSENT_VERSION de src/lib/consent.ts. No se ejecuta nada.');
  process.exit(2);
}
const CONSENT_VERSION = consentMatch[1];

const COOLDOWN_MS = 31_000; // el servidor exige 30 s entre reportes nuevos de la misma persona
const DAILY_LIMIT = 5;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function report(step, state, reason) {
  results.push(state);
  console.log(`${step} ${state} ${reason}`);
}

const newClient = () => createClient(env('PULSO_SUPABASE_URL'), env('PULSO_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

/** Inicia sesión; si la cuenta no existe, la registra y vuelve a iniciar. Devuelve el usuario o null. */
async function signIn(client, label) {
  const email = env(`PULSO_EMAIL_${label}`);
  const password = env('PULSO_PASSWORD');
  const first = await client.auth.signInWithPassword({ email, password });
  if (!first.error && first.data.user) return first.data.user;
  const created = await client.auth.signUp({ email, password, options: { data: { display_name: `Prueba ${label}` } } });
  const second = created.error ? null : await client.auth.signInWithPassword({ email, password });
  if (!second || second.error || !second.data.user) {
    console.error(`No se pudo iniciar sesión ni registrar la cuenta ${label}: revisa el correo y la contraseña`);
    return null;
  }
  return second.data.user;
}

/** Fila propia de team_members (rol y consentimiento) o null. */
async function membership(client, team, userId) {
  const { data, error } = await client.from('team_members').select('role, consent_at').eq('team_id', team).eq('user_id', userId).maybeSingle();
  if (error) throw new Error(`No se pudo leer la membresía: ${error.message}`);
  return data;
}

async function rpcOrThrow(client, fn, args) {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}

/** Deja a la cuenta en el equipo con el rol pedido y con consentimiento. */
async function ensureMember(owner, client, label, userId, team, role) {
  let row = await membership(client, team, userId);
  if (!row) {
    // Una ejecución cortada pudo dejar una invitación pendiente (su código no se puede recuperar): se revoca y se reenvía.
    const { data: pending, error: pendingError } = await owner
      .from('invitations')
      .select('id')
      .eq('team_id', team)
      .eq('email', env(`PULSO_EMAIL_${label}`).trim().toLowerCase())
      .eq('status', 'pending');
    if (pendingError) throw new Error(`No se pudo buscar invitaciones pendientes: ${pendingError.message}`);
    for (const old of pending ?? []) await rpcOrThrow(owner, 'revoke_invitation', { p_id: old.id });
    if ((pending ?? []).length) console.log('invitación pendiente revocada y reenviada');
    const invited = await rpcOrThrow(owner, 'invite_member', { p_team: team, p_email: env(`PULSO_EMAIL_${label}`), p_role: role });
    const invitation = Array.isArray(invited) ? invited[0] : invited;
    if (!invitation?.id || !invitation?.code) throw new Error(`invite_member no devolvió id y código para ${label}`);
    const mine = await rpcOrThrow(client, 'my_invitations', {});
    if (!Array.isArray(mine) || !mine.some((i) => i.id === invitation.id)) throw new Error(`${label} no ve su invitación en my_invitations`);
    const joined = await rpcOrThrow(client, 'accept_invitation', { p_id: invitation.id, p_code: invitation.code, p_consent_version: CONSENT_VERSION });
    if (!joined) throw new Error(`accept_invitation no aceptó la invitación de ${label}`);
    row = await membership(client, team, userId);
  }
  if (!row) throw new Error(`${label} sigue sin pertenecer al equipo`);
  if (row.role !== role) throw new Error(`${label} debe ser ${role} en el equipo y es ${row.role}`);
  if (!row.consent_at) await rpcOrThrow(client, 'give_consent', { p_team: team, p_version: CONSENT_VERSION });
}

/** Prepara equipo y membresías. Devuelve { team, created } o lanza un error con el motivo. */
async function prepare(a, b, c, users) {
  let team = env('PULSO_TEAM_ID');
  let created = false;
  if (!team) {
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const name = `Validación F4 ${stamp.getFullYear()}-${pad(stamp.getMonth() + 1)}-${pad(stamp.getDate())} ${pad(stamp.getHours())}:${pad(stamp.getMinutes())}`;
    team = await rpcOrThrow(a, 'create_team', { p_name: name });
    created = true;
  }
  const own = await membership(a, team, users.a.id);
  if (!own || !['owner', 'admin'].includes(own.role)) throw new Error('La cuenta A debe ser owner o admin del equipo');
  if (!own.consent_at) await rpcOrThrow(a, 'give_consent', { p_team: team, p_version: CONSENT_VERSION });
  await ensureMember(a, b, 'B', users.b.id, team, 'member');
  await ensureMember(a, c, 'C', users.c.id, team, 'viewer');
  return { team, created };
}

/** Invoca ai-trial y normaliza la respuesta a { status, body }. */
async function invoke(client, team, scope, subject, period, language) {
  const { data, error } = await client.functions.invoke('ai-trial', { body: { team, scope, subject, period, language } });
  if (!error) return { status: 200, body: data && typeof data === 'object' ? data : {} };
  const context = error.context;
  if (context && typeof context.json === 'function') {
    const body = await context.json().catch(() => null);
    return { status: context.status, body: body && typeof body === 'object' ? body : {} };
  }
  return { status: 0, body: { reason: 'network', message: error.message } };
}

const lastConsume = { a: 0, b: 0 };

/** Invoca ai-trial respetando el enfriamiento de 30 s; ante 429 `cooldown` espera y reintenta (máximo 2 reintentos). */
async function invokeWithRetry(client, who, team, scope, subject, period, language) {
  let res;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await waitCooldown(lastConsume[who]);
    res = await invoke(client, team, scope, subject, period, language);
    if (res.status === 429 && res.body.reason === 'cooldown') {
      lastConsume[who] = Date.now();
      continue;
    }
    if (isOk(res) && res.body.cached === false) lastConsume[who] = Date.now();
    return res;
  }
  return res;
}

const isOk = (res) => res.status === 200 && res.body.report && typeof res.body.report === 'object';
const describe = (res) => `HTTP ${res.status} ${res.body.reason ?? ''} ${String(res.body.message ?? '').slice(0, 120)}`.trim();

async function readRun(client, id) {
  const { data, error } = await client.from('report_runs').select('id, scope, validated_by').eq('id', id).maybeSingle();
  return error ? null : data;
}

async function countOwnRuns(client, team, userId) {
  const { count, error } = await client.from('report_runs').select('id', { count: 'exact', head: true }).eq('team_id', team).eq('created_by', userId);
  return error ? null : count;
}

async function waitCooldown(last) {
  const left = last + COOLDOWN_MS - Date.now();
  if (left > 0) await sleep(left);
}

// Todo lo que usa la red va en main(): process.exit() con conexiones abiertas hace caer a Node 24 en Windows.
async function main() {
  const [a, b, c] = [newClient(), newClient(), newClient()];
  try {
    const users = { a: await signIn(a, 'A'), b: await signIn(b, 'B'), c: await signIn(c, 'C') };
    if (!users.a || !users.b || !users.c) return 2;
    let team;
    try {
      ({ team } = await prepare(a, b, c, users));
    } catch (e) {
      console.error(`P FALLA ${e.message}`);
      return 2;
    }
    console.log('P CUMPLE cuentas y equipo listos');

    // 4.2
    let personalId = null;
    const first = await invokeWithRetry(b, 'b', team, 'personal', users.b.id, 'today', 'es');
    if (!isOk(first)) {
      report('4.2', 'FALLA', describe(first));
    } else {
      personalId = first.body.report.id;
      const row = await readRun(b, personalId);
      if (!row) report('4.2', 'FALLA', 'B no lee la fila en report_runs');
      else if (row.validated_by !== 'server') report('4.2', 'FALLA', `validated_by = ${row.validated_by}, se esperaba server`);
      else report('4.2', 'CUMPLE', `reporte guardado y validated_by = server${first.body.cached ? ' (ya existía: caché)' : ''}`);
    }

    // 4.3
    if (!personalId) {
      report('4.3', 'OMITIDO', 'depende de 4.2');
    } else {
      const before = await countOwnRuns(b, team, users.b.id);
      const again = await invoke(b, team, 'personal', users.b.id, 'today', 'es');
      const after = await countOwnRuns(b, team, users.b.id);
      if (!isOk(again)) report('4.3', 'FALLA', describe(again));
      else if (again.body.cached !== true) report('4.3', 'FALLA', 'la respuesta no dice cached: true');
      else if (again.body.report.id !== personalId) report('4.3', 'FALLA', 'devolvió un reporte distinto al guardado');
      else if (before === null || after === null || before !== after) report('4.3', 'FALLA', `filas de report_runs de B: ${before} antes, ${after} después`);
      else report('4.3', 'CUMPLE', `cached: true y el historial de B sigue en ${after} filas`);
    }

    // 4.5: la Edge Function y get_report_facts (que llama a report_assert_can_generate) rechazan a un member.
    {
      const viaFunction = await invoke(b, team, 'team', team, 'today', 'es');
      const viaFacts = await b.rpc('get_report_facts', { p_team: team, p_scope: 'team', p_subject: team, p_period: 'today' });
      if (isOk(viaFunction) || !viaFacts.error) report('4.5', 'FALLA', `B pudo pedir el reporte de equipo (función: ${describe(viaFunction)})`);
      else if (viaFunction.status !== 403 || viaFacts.error.code !== '42501') report('4.5', 'FALLA', `rechazo inesperado (función: ${describe(viaFunction)}; hechos: ${viaFacts.error.code} ${viaFacts.error.message})`);
      else report('4.5', 'CUMPLE', 'la función responde 403 y get_report_facts 42501');
    }

    // 4.6
    let teamReportId = null;
    {
      const res = await invokeWithRetry(a, 'a', team, 'team', team, 'yesterday', 'es');
      if (!isOk(res)) {
        report('4.6', 'FALLA', describe(res));
      } else {
        teamReportId = res.body.report.id;
        const { data, error } = await a.from('audit_log').select('id, details').eq('team_id', team).eq('action', 'report_generated');
        if (error) report('4.6', 'FALLA', `A no pudo leer audit_log: ${error.message}`);
        else if (!(data ?? []).some((row) => row.details?.report === teamReportId)) report('4.6', 'FALLA', 'no hay fila report_generated para ese reporte');
        else report('4.6', 'CUMPLE', `reporte de equipo generado y fila report_generated en audit_log${res.body.cached ? ' (ya existía: caché)' : ''}`);
      }
    }

    // 4.7
    if (!teamReportId) {
      report('4.7', 'OMITIDO', 'depende de 4.6');
    } else {
      const { data, error } = await c.from('report_runs').select('id, scope').eq('team_id', team);
      const attempt = await invoke(c, team, 'team', team, 'today', 'es');
      const rows = data ?? [];
      if (error) report('4.7', 'FALLA', `C no pudo leer report_runs: ${error.message}`);
      else if (!rows.some((row) => row.id === teamReportId)) report('4.7', 'FALLA', 'C no ve el reporte de equipo de 4.6');
      else if (rows.some((row) => row.scope === 'personal')) report('4.7', 'FALLA', 'C ve reportes personales');
      else if (attempt.status !== 403) report('4.7', 'FALLA', `al intentar generar, la función respondió ${describe(attempt)} en vez de 403`);
      else report('4.7', 'CUMPLE', `C ve el reporte de equipo (${rows.length} filas, ninguna personal) y generar da 403`);
    }

    // 4.19: misma lógica que f4-cupos-simultaneos.mjs, con la sesión de A (antes, esperar el enfriamiento de 4.6).
    {
      await waitCooldown(lastConsume.a);
      const answers = await Promise.all(Array.from({ length: 10 }, () => a.rpc('consume_ai_trial', { p_team: team })));
      const tally = {};
      for (const { data, error } of answers) {
        const key = error ? `error: ${error.message}` : data.ok ? 'ok' : data.reason;
        tally[key] = (tally[key] ?? 0) + 1;
      }
      const summary = Object.entries(tally).map(([key, n]) => `${key}: ${n}`).join(', ');
      const limits = (tally.user_limit ?? 0) + (tally.team_limit ?? 0) + (tally.global_limit ?? 0);
      if (limits === 10) report('4.19', 'OMITIDO', `A ya no tiene cupo hoy (${summary})`);
      else if (tally.ok === 1 && (tally.cooldown ?? 0) === 9) report('4.19', 'CUMPLE', summary);
      else report('4.19', 'FALLA', `se esperaba ok: 1 y cooldown: 9; llegó ${summary}`);
    }

    // 4.4
    console.log('4.4 tardará unos 3 minutos (31 s entre peticiones)...');
    {
      const bogotaDay = new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10); // America/Bogota es UTC-5 todo el año
      const { count, error } = await b
        .from('report_runs')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', users.b.id)
        .eq('mode', 'free')
        .gte('created_at', `${bogotaDay}T05:00:00Z`);
      let total = count ?? 0;
      if (error) {
        report('4.4', 'OMITIDO', `no se pudo contar los reportes de hoy de B: ${error.message}`);
      } else if (total >= DAILY_LIMIT) {
        report('4.4', 'OMITIDO', `B ya generó ${total} reportes hoy: su cupo está agotado; repite mañana`);
      } else {
        const combos = [['yesterday', 'es'], ['this_week', 'es'], ['last_week', 'es'], ['today', 'en'], ['yesterday', 'en'], ['this_week', 'en'], ['last_week', 'en']];
        let done = false;
        for (const [period, language] of combos) {
          const res = await invokeWithRetry(b, 'b', team, 'personal', users.b.id, period, language);
          if (isOk(res)) {
            if (res.body.cached === false) total += 1;
            continue;
          }
          done = true;
          if (res.status === 429 && res.body.reason === 'user_limit') {
            if (total >= DAILY_LIMIT) report('4.4', 'CUMPLE', `el reporte ${total + 1} del día respondió 429 user_limit`);
            else report('4.4', 'OMITIDO', `el límite llegó tras ${total} reportes contados: B gastó cupo en otros usos hoy`);
          } else if (res.status === 429 && ['team_limit', 'global_limit'].includes(res.body.reason)) {
            report('4.4', 'OMITIDO', `se agotó antes el cupo ${res.body.reason}`);
          } else {
            report('4.4', 'FALLA', `${period}/${language}: ${describe(res)}`);
          }
          if (done) break;
        }
        if (!done) report('4.4', 'OMITIDO', 'se acabaron las combinaciones sin recibir el límite diario');
      }
    }

    const count = (state) => results.filter((r) => r === state).length;
    console.log(`\nCUMPLE ${count('CUMPLE')} · FALLA ${count('FALLA')} · OMITIDO ${count('OMITIDO')}`);
    console.log(`Para reutilizar el equipo: PULSO_TEAM_ID=${team}`);
    return count('FALLA') > 0 ? 1 : 0;
  } finally {
    await Promise.allSettled([a.auth.signOut(), b.auth.signOut(), c.auth.signOut()]);
  }
}

process.exitCode = await main();
