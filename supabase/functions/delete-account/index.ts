/**
 * Edge Function `delete-account` (Deno): eliminar mi cuenta (CU-08). Solo arma las dependencias; la lógica está
 * en `handler.ts`. SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los pone Supabase.
 * Despliegue: npx supabase@2.119.0 functions deploy delete-account --use-api
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { handleDeleteAccount } from './handler.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const env = (name: string) => Deno.env.get(name) ?? '';

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

  const result = await handleDeleteAccount({
    userId: auth.user?.id ?? null,
    async rpc(fn, args) {
      const { error } = await service.rpc(fn, args);
      return { error: error ? { message: error.message, code: error.code } : null };
    },
    async deleteUser(id) {
      const { error } = await service.auth.admin.deleteUser(id);
      return { error: error ? { message: error.message } : null };
    },
  });
  return send(result.status, result.body);
});
