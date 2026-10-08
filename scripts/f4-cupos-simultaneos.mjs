#!/usr/bin/env node
/**
 * AC-15 (spec F4): el cupo gratis aguanta peticiones simultáneas. PGlite no puede probarlo; esto va contra pulso-dev.
 *
 * Lanza N llamadas a `consume_ai_trial` a la vez con la misma cuenta. Como el cupo se serializa con
 * pg_advisory_xact_lock, exactamente una debe pasar y las demás deben responder `cooldown`; si pasan dos o más,
 * el candado no funciona y también fallarían los cupos de equipo y global, que usan el mismo candado.
 * No llama a la IA (no cuesta nada), pero gasta 1 de los 5 reportes gratis del día de esa cuenta.
 *
 * Variables de entorno (ninguna se imprime; sin alguna, el script no corre):
 *   PULSO_SUPABASE_URL, PULSO_SUPABASE_ANON_KEY, PULSO_EMAIL, PULSO_PASSWORD
 *   Opcional: PULSO_TEAM_ID (si no, el primer equipo de la cuenta), PULSO_PARALLEL (por defecto 10).
 *
 * Uso (PowerShell): $env:PULSO_EMAIL = '...'; ...; node scripts/f4-cupos-simultaneos.mjs
 */
import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['PULSO_SUPABASE_URL', 'PULSO_SUPABASE_ANON_KEY', 'PULSO_EMAIL', 'PULSO_PASSWORD'];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}. No se ejecuta nada.`);
  process.exit(2);
}
const env = (name) => process.env[name];
const parallel = Math.min(Math.max(Number(env('PULSO_PARALLEL') ?? 10) || 10, 2), 50);

// Todo lo que usa la red va en main(): process.exit() con conexiones abiertas hace caer a Node 24 en Windows.
async function main() {
  const supabase = createClient(env('PULSO_SUPABASE_URL'), env('PULSO_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({ email: env('PULSO_EMAIL'), password: env('PULSO_PASSWORD') });
  if (authError || !auth.user) {
    console.error('No se pudo iniciar sesión con esa cuenta.');
    return 2;
  }
  const { data: teams } = await supabase.from('team_members').select('team_id').eq('user_id', auth.user.id);
  const team = env('PULSO_TEAM_ID') ?? teams?.[0]?.team_id;
  if (!team) {
    console.error('La cuenta no pertenece a ningún equipo.');
    return 2;
  }

  const answers = await Promise.all(Array.from({ length: parallel }, () => supabase.rpc('consume_ai_trial', { p_team: team })));
  const tally = {};
  for (const { data, error } of answers) {
    const key = error ? `error: ${error.message}` : data.ok ? 'ok' : data.reason;
    tally[key] = (tally[key] ?? 0) + 1;
  }
  console.log(`${parallel} peticiones simultáneas:`);
  for (const [key, n] of Object.entries(tally)) console.log(`  ${key}: ${n}`);

  const passed = tally.ok ?? 0;
  const limitReached = (tally.user_limit ?? 0) + (tally.team_limit ?? 0) + (tally.global_limit ?? 0) === parallel;
  if (limitReached) console.log('\nLa cuenta ya no tiene cupo hoy: todas respondieron el límite. Repite mañana o con otra cuenta.');
  else console.log(`\nPasaron ${passed} (esperado: 1) → ${passed === 1 ? 'CUMPLE' : 'NO CUMPLE'}`);
  await supabase.auth.signOut();
  return passed === 1 || limitReached ? 0 : 1;
}

process.exitCode = await main();
