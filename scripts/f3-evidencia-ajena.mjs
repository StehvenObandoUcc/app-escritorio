#!/usr/bin/env node
/**
 * Validación de F3 (docs/VALIDACION.md): una persona ajena al proyecto no puede abrir una evidencia de Storage
 * aunque tenga el enlace. Se ejecuta con la cuenta AJENA, contra pulso-dev.
 *
 * PULSO_EVIDENCE_URL es el enlace que se abre en el navegador al ver la evidencia con una cuenta del proyecto
 * (…/storage/v1/object/sign/task-evidence/<ruta>?token=…). El script prueba, con la sesión ajena:
 *   1. descargar el archivo por su ruta, 2. pedir un enlace firmado nuevo, 3. abrir el enlace recibido.
 * 1 y 2 deben fallar siempre; 3 debe fallar pasados 60 s desde que se creó (el enlace caduca).
 *
 * Variables de entorno (ninguna se imprime; sin alguna, el script no corre):
 *   PULSO_SUPABASE_URL, PULSO_SUPABASE_ANON_KEY, PULSO_EMAIL, PULSO_PASSWORD, PULSO_EVIDENCE_URL
 */
import { createClient } from '@supabase/supabase-js';

const REQUIRED = ['PULSO_SUPABASE_URL', 'PULSO_SUPABASE_ANON_KEY', 'PULSO_EMAIL', 'PULSO_PASSWORD', 'PULSO_EVIDENCE_URL'];
const missing = REQUIRED.filter((name) => !process.env[name]);
if (missing.length) {
  console.error(`Faltan variables de entorno: ${missing.join(', ')}. No se ejecuta nada.`);
  process.exit(2);
}
const env = (name) => process.env[name];
const match = env('PULSO_EVIDENCE_URL').match(/\/task-evidence\/([^?]+)/);
if (!match) {
  console.error('PULSO_EVIDENCE_URL no parece un enlace de evidencia (falta /task-evidence/).');
  process.exit(2);
}
const path = decodeURIComponent(match[1]);

// Todo lo que usa la red va en main(): process.exit() con conexiones abiertas hace caer a Node 24 en Windows.
async function main() {
  const supabase = createClient(env('PULSO_SUPABASE_URL'), env('PULSO_SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: authError } = await supabase.auth.signInWithPassword({ email: env('PULSO_EMAIL'), password: env('PULSO_PASSWORD') });
  if (authError) {
    console.error('No se pudo iniciar sesión con esa cuenta.');
    return 2;
  }

  const download = await supabase.storage.from('task-evidence').download(path);
  const signed = await supabase.storage.from('task-evidence').createSignedUrl(path, 60);
  const shared = await fetch(env('PULSO_EVIDENCE_URL'));

  const checks = [
    ['Descargar por la ruta con la sesión ajena', Boolean(download.error)],
    ['Pedir un enlace firmado nuevo con la sesión ajena', Boolean(signed.error)],
    ['Abrir el enlace compartido (debe haber caducado si pasaron más de 60 s)', !shared.ok],
  ];
  for (const [what, denied] of checks) console.log(`${denied ? 'BLOQUEADO' : 'PERMITIDO'}  ${what}`);
  const ok = checks[0][1] && checks[1][1];
  console.log(`\n${ok ? 'CUMPLE' : 'NO CUMPLE'}: la cuenta ajena ${ok ? 'no puede' : 'sí puede'} abrir la evidencia por su cuenta.`);
  if (!checks[2][1]) console.log('El enlace compartido aún abre: repite pasados 60 s desde que se creó para comprobar que caduca.');
  await supabase.auth.signOut();
  return ok ? 0 : 1;
}

process.exitCode = await main();
