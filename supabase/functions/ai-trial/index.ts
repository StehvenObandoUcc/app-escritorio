/**
 * Edge Function `ai-trial` (Deno): modo Gratis de los reportes. Solo arma las dependencias; la lógica está en
 * `handler.ts`. Secretos (nunca en el repositorio, docs/COMO-VERIFICAR.md §5): DEEPSEEK_API_KEY, AI_TRIAL_ENABLED,
 * AI_TRIAL_MODEL. SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
 * Despliegue: npx supabase@2.119.0 functions deploy ai-trial --use-api
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { handleTrial, type Db, type ReportKey } from './handler.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (name: string) => Deno.env.get(name) ?? '';

function adapt(client: SupabaseClient): Db {
  return {
    async rpc(fn, args) {
      const { data, error } = await client.rpc(fn, args);
      return { data, error: error ? { message: error.message, code: error.code } : null };
    },
    async findReport(k: ReportKey) {
      const { data } = await client
        .from('report_runs')
        .select('*')
        .eq('team_id', k.team)
        .eq('scope', k.scope)
        .eq('subject_id', k.subject)
        .eq('period_from', k.periodFrom)
        .eq('period_to', k.periodTo)
        .eq('facts_hash', k.factsHash)
        .eq('prompt_version', k.promptVersion)
        .eq('language', k.language)
        .maybeSingle();
      return data;
    },
    async reportById(id) {
      const { data } = await client.from('report_runs').select('*').eq('id', id).maybeSingle();
      return data;
    },
    async memberNames() {
      const { data } = await client.from('profiles').select('display_name');
      return (data ?? []).map((p: { display_name: string }) => p.display_name);
    },
  };
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const send = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
  if (request.method !== 'POST') return send(405, { reason: 'bad_request' });

  const authorization = request.headers.get('Authorization') ?? '';
  const user = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const service = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
  const { data: auth } = await user.auth.getUser(authorization.replace(/^Bearer\s+/i, ''));
  const body = await request.json().catch(() => null);

  const result = await handleTrial(body, {
    enabled: env('AI_TRIAL_ENABLED') === 'true',
    model: env('AI_TRIAL_MODEL'),
    apiKey: env('DEEPSEEK_API_KEY'),
    userId: auth.user?.id ?? null,
    user: adapt(user),
    service: adapt(service),
    fetch,
    now: Date.now,
  });
  return send(result.status, result.body);
});
