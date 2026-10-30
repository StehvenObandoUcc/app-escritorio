import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb, type TestDb } from './harness';

/**
 * F6-2: el perfil lo crea la base al registrarse (trigger en auth.users), no solo la app al entrar.
 * Los usuarios se insertan como lo haría Supabase Auth, con los datos del registro en raw_user_meta_data.
 */
let db: TestDb;

const signUp = async (email: string, meta: Record<string, unknown> | null) =>
  (await db.admin<{ id: string }>('insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id', [email, meta]))[0]!.id;

const profileOf = async (id: string) =>
  (await db.admin<{ display_name: string; timezone: string }>('select display_name, timezone from public.profiles where id = $1', [id]))[0];

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

describe('perfil al registrarse', () => {
  it('usa el nombre y la zona horaria del registro', async () => {
    const id = await signUp('lina@pulso.test', { display_name: '  Lina Pérez ', timezone: 'Europe/Madrid' });
    expect(await profileOf(id)).toEqual({ display_name: 'Lina Pérez', timezone: 'Europe/Madrid' });
  });

  it('sin nombre usa la parte local del correo y la zona por defecto', async () => {
    const id = await signUp('mario.r@pulso.test', null);
    expect(await profileOf(id)).toEqual({ display_name: 'mario.r', timezone: 'America/Bogota' });
  });

  it('un nombre en blanco o una zona inválida no impiden el registro', async () => {
    const id = await signUp('nora@pulso.test', { display_name: '   ', timezone: 'Marte/Olympus' });
    expect(await profileOf(id)).toEqual({ display_name: 'nora', timezone: 'America/Bogota' });
  });

  it('recorta el nombre a 80 caracteres', async () => {
    const id = await signUp('largo@pulso.test', { display_name: 'x'.repeat(120) });
    expect((await profileOf(id))!.display_name).toHaveLength(80);
  });

  it('no pisa un perfil que ya existía', async () => {
    const id = crypto.randomUUID();
    // Perfil previo con ese id: con replication_role = replica no se comprueba la FK (los triggers no corren).
    await db.admin('set session_replication_role = replica');
    await db.admin("insert into public.profiles (id, display_name, timezone) values ($1, 'Elegido', 'Asia/Tokyo')", [id]);
    await db.admin('set session_replication_role = origin');
    await db.admin("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'otra@pulso.test', $2)", [id, { display_name: 'Otro' }]);
    expect(await profileOf(id)).toEqual({ display_name: 'Elegido', timezone: 'Asia/Tokyo' });
  });
});
