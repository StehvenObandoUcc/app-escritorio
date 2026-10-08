/**
 * Idiomas sin librerías (ADR-0015).
 * - `es.ts` es la fuente; `en.ts` tiene el mismo tipo: si falta una clave, no compila.
 * - `t('clave.anidada', { n })` sustituye `{n}`; si el valor es `{ one, other }`, elige según `n`.
 * - El idioma activo es global: `LocaleProvider` (src/app) lo fija y vuelve a pintar la app al cambiarlo.
 */
import { en } from './en';
import { es } from './es';
import { SERVER_MESSAGES, SERVER_PATTERNS } from './server-messages';

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

type Plural = { readonly one: string; readonly other: string };
/** Mismo árbol que `es`, con cadenas en lugar de literales: el tipo de `en`. */
export type Dict<T = typeof es> = { -readonly [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? { one: string; other: string } : Dict<T[K]> };

type Leaves<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Leaves<typeof es>;

const DICTS: Record<Locale, Dict> = { es, en };
const INTL: Record<Locale, string> = { es: 'es-CO', en: 'en-US' };

let current: Locale = 'es';

export const getLocale = () => current;
export const setLocale = (locale: Locale) => {
  current = locale;
};
/** Etiqueta de `Intl` del idioma activo (fechas y números). */
export const intlLocale = () => INTL[current];

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

function lookup(dict: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined), dict);
}

export function t(key: TKey, vars: Record<string, string | number> = {}): string {
  let value = lookup(DICTS[current], key) ?? lookup(es, key);
  if (value && typeof value === 'object') {
    const plural = value as Plural;
    value = new Intl.PluralRules(INTL[current]).select(Number(vars.n ?? 0)) === 'one' ? plural.one : plural.other;
  }
  if (typeof value !== 'string') return key;
  return value.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** Fecha en el idioma activo. `date` acepta AAAA-MM-DD (mediodía local, sin saltos de zona) o ISO. */
export function formatDate(date: string | Date, options: Intl.DateTimeFormatOptions): string {
  const d = typeof date === 'string' ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date) : date;
  return new Intl.DateTimeFormat(INTL[current], options).format(d);
}

/**
 * Mensajes de error que vienen en español del servidor (supabase/migrations) o de Rust (src-tauri):
 * en inglés se traducen con esta tabla; los que no están se muestran tal cual.
 * Una prueba comprueba que todo mensaje fijo del servidor y de Rust tiene entrada.
 */
export function translateServerMessage(message: string): string {
  if (current === 'es') return message;
  const exact = SERVER_MESSAGES[message];
  if (exact) return exact;
  for (const [pattern, english] of SERVER_PATTERNS) {
    const m = message.match(pattern);
    if (m) return english.replace(/\$(\d)/g, (_, i: string) => m[Number(i)] ?? '');
  }
  return message;
}


/**
 * Objeto de etiquetas que se leen al usarlas (getters): `ROLE_LABEL.owner` siempre sale en el idioma activo
 * sin cambiar los sitios que ya lo usan.
 */
export function lazyLabels<K extends string>(keys: readonly K[], key: (k: K) => TKey): Record<K, string> {
  const labels = {} as Record<K, string>;
  for (const k of keys) Object.defineProperty(labels, k, { get: () => t(key(k)), enumerable: true });
  return labels;
}

/** Texto de un error para la persona, en el idioma activo. */
export const errorMessage = (cause: unknown) => translateServerMessage(cause instanceof Error ? cause.message : String(cause));
