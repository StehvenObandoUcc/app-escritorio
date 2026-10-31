/**
 * Lógica de la Edge Function `delete-account` (CU-08, spec F7), sin Deno ni red: todo llega en `DeleteDeps`.
 * Con la persona del JWT ya comprobada, primero `delete_my_account_data` (la base decide si se puede y prepara el
 * borrado) y después se borra la cuenta de acceso. Ambas con la clave de servicio: una sesión no llama a la RPC.
 */
type Failure = { error: { message: string; code?: string } | null };

export interface DeleteDeps {
  /** Persona de la sesión (null si el JWT no es válido). */
  userId: string | null;
  /** RPC con el cliente de servicio, para la persona del JWT. */
  rpc(fn: 'delete_my_account_data', args: { p_user: string }): Promise<Failure>;
  /** auth.admin.deleteUser con el cliente de servicio. */
  deleteUser(id: string): Promise<Failure>;
}

export type DeleteResponse = { status: number; body: Record<string, unknown> };

export async function handleDeleteAccount(deps: DeleteDeps): Promise<DeleteResponse> {
  if (!deps.userId) return { status: 401, body: { reason: 'unauthorized' } };
  const prepared = await deps.rpc('delete_my_account_data', { p_user: deps.userId });
  if (prepared.error) {
    // P0001: bloqueo de la base con un mensaje para la persona (D-1).
    return prepared.error.code === 'P0001'
      ? { status: 409, body: { reason: 'blocked', message: prepared.error.message } }
      : { status: 500, body: { reason: 'data', message: prepared.error.message } };
  }
  const deleted = await deps.deleteUser(deps.userId);
  if (deleted.error) return { status: 500, body: { reason: 'auth', message: deleted.error.message } };
  return { status: 200, body: { ok: true } };
}
