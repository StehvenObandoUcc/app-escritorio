/**
 * Arnés de pruebas de base de datos SIN Docker.
 *
 * Levanta un Postgres real en memoria (PGlite, WebAssembly), carga un doble
 * mínimo de Supabase (_supabase_stub.sql) y aplica TODAS las migraciones de
 * supabase/migrations en orden. Cada prueba ejecuta consultas "como" un
 * usuario, con el rol `authenticated` y su JWT, igual que la API de Supabase:
 * así se comprueba la seguridad por filas (RLS) de verdad.
 *
 * Uso: npm run test:db
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS = join(HERE, '..', 'migrations');

export type Row = Record<string, unknown>;

export interface TestDb {
  /** Crea un usuario (como haría Supabase Auth) y devuelve su id. */
  createUser(email: string): Promise<string>;
  /** Ejecuta consultas como un usuario con sesión (o como `anon` si userId es null). */
  as<T>(userId: string | null, run: (q: Query) => Promise<T>): Promise<T>;
  /** Ejecuta como administrador de la base (salta RLS). Solo para preparar datos. */
  admin<T extends Row = Row>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}

export type Query = <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;

export async function createTestDb(): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec(readFileSync(join(HERE, '_supabase_stub.sql'), 'utf8'));

  const files = readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    try {
      await pg.exec(readFileSync(join(MIGRATIONS, file), 'utf8'));
    } catch (cause) {
      throw new Error(`La migración ${file} falló: ${(cause as Error).message}`, { cause });
    }
  }

  const query =
    (tx: Transaction): Query =>
    async <T extends Row = Row>(sql: string, params: unknown[] = []) =>
      (await tx.query<T>(sql, params)).rows;

  return {
    async createUser(email) {
      const { rows } = await pg.query<{ id: string }>(
        'insert into auth.users (email) values ($1) returning id',
        [email],
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('No se pudo crear el usuario de prueba');
      return id;
    },

    as(userId, run) {
      return pg.transaction(async (tx) => {
        const claims = userId ? { sub: userId, role: 'authenticated' } : { role: 'anon' };
        await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
        await tx.exec(`set local role ${userId ? 'authenticated' : 'anon'}`);
        return run(query(tx));
      });
    },

    async admin<T extends Row = Row>(sql: string, params: unknown[] = []) {
      return (await pg.query<T>(sql, params)).rows;
    },

    close: () => pg.close(),
  };
}

/** Devuelve el mensaje de error de una operación que DEBE fallar. */
export async function failure(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (cause) {
    return (cause as Error).message;
  }
  throw new Error('Se esperaba un error y la operación terminó bien');
}
