#!/usr/bin/env node
/**
 * Guardián de idiomas (ADR-0015).
 * Falla si en src/pages, src/ui o src/app (sin pruebas) aparece texto visible escrito a mano:
 *   - texto entre etiquetas JSX: <p>Hola</p>
 *   - atributos de texto con letras: label="Nombre", aria-label="…", title, placeholder, alt…
 * El texto va en src/i18n/es.ts y en.ts y se usa con t('clave').
 * Uso: npm run check:i18n
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';

const LETTERS = /[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}/;
const ATTRS = 'label|aria-label|title|placeholder|alt|subtitle|description|hint|submitLabel|acceptLabel|what|error';

export const RULES = [
  // Texto entre una etiqueta que cierra (>) y la siguiente que abre (<), sin llaves.
  { name: 'texto en JSX', re: />\s*([^<>{}`=;()]*[A-Za-zÁÉÍÓÚáéíóúÑñ]{2,}[^<>{}`=;()]*)\s*</g },
  { name: 'atributo de texto', re: new RegExp(`\\b(?:${ATTRS})="([^"]*)"`, 'g') },
];

/** Devuelve las infracciones de un texto: [{ line, rule, match }] */
export function findViolations(text) {
  const found = [];
  text.split('\n').forEach((content, i) => {
    if (content.trimStart().startsWith('//') || content.trimStart().startsWith('*')) return;
    for (const { name, re } of RULES) {
      for (const m of content.matchAll(re)) {
        if (LETTERS.test(m[1] ?? '')) found.push({ line: i + 1, rule: name, match: m[0].trim() });
      }
    }
  });
  return found;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (entry.endsWith('.tsx') && !/\.test\.tsx$/.test(entry)) out.push(path);
  }
  return out;
}

export function checkDirs(dirs) {
  return dirs.flatMap((dir) =>
    walk(dir).flatMap((file) => findViolations(readFileSync(file, 'utf8')).map((v) => ({ file: relative(process.cwd(), file), ...v }))),
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = checkDirs(['pages', 'ui', 'app'].map((d) => join(process.cwd(), 'src', d)));
  if (violations.length === 0) {
    console.log('check:i18n ✔  Ningún texto visible escrito a mano en la interfaz.');
  } else {
    for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}: ${v.match}`);
    console.error(`\ncheck:i18n ✘  ${violations.length} textos escritos a mano. Muévelos a src/i18n/es.ts y en.ts y usa t('clave').`);
    process.exit(1);
  }
}
