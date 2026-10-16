import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setLocale, translateServerMessage } from '.';

/** Mensajes fijos para la persona: del servidor (raise exception) y de Rust (Err con texto en mayúscula). */
function serverMessages(): string[] {
  const sql = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .flatMap((f) => [...readFileSync(join('supabase/migrations', f), 'utf8').matchAll(/raise exception '((?:[^']|'')+)'/g)].map((m) => m[1]!.replaceAll('%', 'X')));
  const rustFiles = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? rustFiles(join(dir, e.name)) : e.name.endsWith('.rs') ? [join(dir, e.name)] : []));
  const rust = rustFiles('src-tauri/src').flatMap((f) => {
    const code = readFileSync(f, 'utf8').split('#[cfg(test)]')[0]!;
    return [
      ...[...code.matchAll(/"([A-ZÁÉÍÓÚ][^"]{10,}\.)"\.(?:into|to_string)\(\)/g)].map((m) => m[1]!),
      ...[...code.matchAll(/format!\("([A-ZÁÉÍÓÚ][^"]{10,}\.)"/g)].map((m) => m[1]!.replace(/\{[^}]*\}/g, '7')),
    ];
  });
  return [...new Set([...sql, ...rust])];
}

describe('mensajes del servidor y de Rust en inglés (ADR-0015, AC-35)', () => {
  afterEach(() => setLocale('es'));

  it('cada mensaje fijo tiene traducción', () => {
    setLocale('en');
    const messages = serverMessages();
    expect(messages.length).toBeGreaterThan(60);
    const missing = messages.filter((m) => translateServerMessage(m) === m);
    expect(missing).toEqual([]);
  });

  it('en español el mensaje no cambia y en inglés se rellenan las partes variables', () => {
    expect(translateServerMessage('No permitido')).toBe('No permitido');
    setLocale('en');
    expect(translateServerMessage('Falta completar «Qué se hizo» en el formulario de entrega')).toBe('“Qué se hizo” is missing in the delivery form');
    expect(translateServerMessage('Un mensaje desconocido')).toBe('Un mensaje desconocido');
  });
});
