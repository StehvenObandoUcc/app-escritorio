import { describe, expect, it, vi } from 'vitest';
import { handleDeleteAccount, type DeleteDeps } from '../functions/delete-account/handler.ts';

/** Edge Function delete-account con dobles (spec F7, AC-4). */
const USER = '22222222-2222-4222-8222-222222222222';
const BLOCKED = 'Antes de eliminar tu cuenta, pasa la propiedad de «Compartido» a otra persona';

function setup(rpcError: { message: string; code?: string } | null = null, userId: string | null = USER) {
  const rpc = vi.fn(async () => ({ error: rpcError }));
  const deleteUser = vi.fn(async () => ({ error: null }));
  const deps: DeleteDeps = { userId, rpc, deleteUser };
  return { deps, rpc, deleteUser };
}

describe('delete-account', () => {
  it('sin sesión responde 401 sin tocar nada', async () => {
    const s = setup(null, null);
    expect(await handleDeleteAccount(s.deps)).toEqual({ status: 401, body: { reason: 'unauthorized' } });
    expect(s.rpc).not.toHaveBeenCalled();
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  it('si la base lo bloquea responde 409 con el mensaje y no borra la cuenta', async () => {
    const s = setup({ message: BLOCKED, code: 'P0001' });
    expect(await handleDeleteAccount(s.deps)).toEqual({ status: 409, body: { reason: 'blocked', message: BLOCKED } });
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  it('otro error de la base responde 500 y no borra la cuenta', async () => {
    const s = setup({ message: 'boom', code: 'XX000' });
    expect((await handleDeleteAccount(s.deps)).status).toBe(500);
    expect(s.deleteUser).not.toHaveBeenCalled();
  });

  it('prepara los datos de la persona del JWT y luego borra su cuenta de acceso', async () => {
    const s = setup();
    expect(await handleDeleteAccount(s.deps)).toEqual({ status: 200, body: { ok: true } });
    expect(s.rpc).toHaveBeenCalledWith('delete_my_account_data', { p_user: USER });
    expect(s.deleteUser).toHaveBeenCalledWith(USER);
  });

  it('si falla el borrado de la cuenta de acceso responde 500', async () => {
    const s = setup();
    s.deleteUser.mockResolvedValueOnce({ error: { message: 'Database error deleting user' } } as never);
    expect((await handleDeleteAccount(s.deps)).status).toBe(500);
  });
});
