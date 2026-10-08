#!/usr/bin/env node
/**
 * AC-13b (spec F4): 20 reportes reales y cuántos terminan en la plantilla. Meta: 3 o menos.
 *
 * Lo ejecuta una persona, una vez, contra pulso-dev. Hechos reales de su cuenta (get_report_facts) y un proveedor
 * real con el mismo prompt v2, el mismo validador y el mismo reintento que la app. No guarda reportes ni gasta el
 * cupo gratis (que solo permite 5 al día por persona).
 *
 * Variables de entorno (ninguna se imprime; sin alguna, el script no corre):
 *   PULSO_SUPABASE_URL, PULSO_SUPABASE_ANON_KEY, PULSO_EMAIL, PULSO_PASSWORD
 *   PULSO_AI_BASE_URL (p. ej. https://api.deepseek.com), PULSO_AI_MODEL, PULSO_AI_KEY
 *   Opcional: PULSO_TEAM_ID (si no, el primer equipo de la cuenta).
 *
 * Uso (PowerShell): $env:PULSO_EMAIL = '...'; ...; node scripts/f4-reportes-reales.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { buildMessages, retryMessages } from '../supabase/functions/_shared/report-prompt.ts';
import { extractJson, validateNarrative } from '../supabase/functions/_shared/report-validator.ts';

const REQUIRED = ['PULSO_SUPABASE_URL', 'PULSO_SUPABASE_ANON_KEY', 'PULSO_EMAIL', 'PULSO_PASSWORD', 'PULSO_AI_BASE_URL', 'PULSO_AI_MODEL', 'PULSO_AI_KEY'];
const RUNS = 20;
const GOAL = 3;

const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}. No se ejecuta nada.`);
  process.exit(2);
}
const env = (name) => process.env[name];

async function chat(messages) {
  const url = `${env('PULSO_AI_BASE_URL').replace(/\/+$/, '')}/chat/completions`;
  const send = (body) =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env('PULSO_AI_KEY')}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
  const model = env('PULSO_AI_MODEL');
  let res = await send({ model, messages, temperature: 0.2, max_tokens: 1200, response_format: { type: 'json_object' } });
  if (res.status === 400) res = await send({ model, messages });
  if (!res.ok) throw new Error(`el proveedor respondió ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

const supabase = createClient(env('PULSO_SUPABASE_URL'), env('PULSO_SUPABASE_ANON_KEY'), { auth: { persistSession: false } });
const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: env('PULSO_EMAIL'), password: env('PULSO_PASSWORD') });
if (authError || !auth.user) {
  console.error('No se pudo iniciar sesión con esa cuenta.');
  process.exit(2);
}
const me = auth.user.id;
const { data: teams } = await supabase.from('team_members').select('team_id').eq('user_id', me);
const team = env('PULSO_TEAM_ID') ?? teams?.[0]?.team_id;
if (!team) {
  console.error('La cuenta no pertenece a ningún equipo.');
  process.exit(2);
}
const names = ((await supabase.from('profiles').select('display_name')).data ?? []).map((p) => p.display_name);
const { data: projects } = await supabase.from('projects').select('id').eq('team_id', team);

// Combinaciones posibles (las que la cuenta no puede generar se descartan al pedir los hechos).
const combos = [];
for (const period of ['today', 'yesterday', 'this_week', 'last_week']) {
  for (const language of ['es', 'en']) {
    combos.push({ scope: 'personal', subject: me, period, language });
    combos.push({ scope: 'team', subject: team, period, language });
    for (const p of projects ?? []) combos.push({ scope: 'project', subject: p.id, period, language });
  }
}
const usable = [];
for (const c of combos) {
  const { data, error } = await supabase.rpc('get_report_facts', { p_team: team, p_scope: c.scope, p_subject: c.subject, p_period: c.period });
  if (!error && data) usable.push({ ...c, facts: data.facts, periodFrom: data.period_from, periodTo: data.period_to });
}
if (!usable.length) {
  console.error('No hay ningún reporte que esta cuenta pueda generar.');
  process.exit(2);
}

const results = { ok: 0, retried: 0, fallback: 0, provider: 0 };
for (let i = 0; i < RUNS; i++) {
  const c = usable[i % usable.length];
  const context = { facts: c.facts, names, periodFrom: c.periodFrom, periodTo: c.periodTo };
  const messages = buildMessages(c.facts, c.language);
  let outcome;
  try {
    const first = await chat(messages);
    const check = validateNarrative(extractJson(first), context);
    if (check.ok) outcome = 'ok';
    else {
      const second = await chat(retryMessages(messages, first, check.errors));
      outcome = validateNarrative(extractJson(second), context).ok ? 'retried' : 'fallback';
    }
  } catch {
    outcome = 'provider';
  }
  results[outcome]++;
  console.log(`${String(i + 1).padStart(2)}. ${c.scope.padEnd(8)} ${c.period.padEnd(9)} ${c.language}  →  ${outcome}`);
}

console.log(`\nVálidos a la primera: ${results.ok} · con reintento: ${results.retried} · plantilla: ${results.fallback} · fallo del proveedor: ${results.provider}`);
console.log(`Plantilla: ${results.fallback} de ${RUNS} (meta: ${GOAL} o menos) → ${results.fallback <= GOAL ? 'CUMPLE' : 'NO CUMPLE'}`);
await supabase.auth.signOut();
process.exit(results.fallback <= GOAL && results.provider === 0 ? 0 : 1);
