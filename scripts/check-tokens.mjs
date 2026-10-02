#!/usr/bin/env node
/**
 * Guardián de design tokens.
 * Falla si en src/ (fuera de src/ui/tokens) aparece:
 *   - un color escrito a mano (#hex, rgb(), hsl(), oklch())
 *   - una clase de la paleta por defecto de Tailwind (bg-blue-500, text-gray-700…)
 *   - un valor arbitrario de Tailwind (w-[13px], bg-[#fff], text-[14px]…)
 * Uso: npm run check:tokens
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';

export const RULES = [
  { name: 'color escrito a mano', re: /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab)\(/g },
  {
    name: 'paleta por defecto de Tailwind',
    re: new RegExp(
      `\\b(?:bg|text|border|ring|outline|fill|stroke|from|via|to|divide|shadow|accent|caret|decoration)-(?:${PALETTE})(?:-\\d{2,3})?\\b`,
      'g',
    ),
  },
  { name: 'valor arbitrario de Tailwind', re: /\b[a-z][a-z0-9:-]*-\[[^\]]+\]/g },
];

/** Devuelve las infracciones de un texto: [{ line, rule, match }] */
export function findViolations(text) {
  const found = [];
  text.split('\n').forEach((content, i) => {
    for (const { name, re } of RULES) {
      for (const m of content.matchAll(re)) found.push({ line: i + 1, rule: name, match: m[0] });
    }
  });
  return found;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|css)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

export function checkDir(root) {
  const tokensDir = join(root, 'ui', 'tokens') + sep;
  return walk(root)
    .filter((file) => !file.startsWith(tokensDir))
    .flatMap((file) =>
      findViolations(readFileSync(file, 'utf8')).map((v) => ({ file: relative(process.cwd(), file), ...v })),
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = checkDir(join(process.cwd(), 'src'));
  if (violations.length === 0) {
    console.log('check:tokens ✔  Ningún valor de diseño fuera de src/ui/tokens.');
  } else {
    for (const v of violations) console.error(`${v.file}:${v.line}  ${v.rule}: ${v.match}`);
    console.error(`\ncheck:tokens ✘  ${violations.length} infracción(es). Usa un token (docs/DISENO.md).`);
    process.exit(1);
  }
}
