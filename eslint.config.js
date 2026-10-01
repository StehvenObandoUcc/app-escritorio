import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Reglas de atomic design: cada capa solo puede importar de las capas inferiores.
 * tokens → atoms → molecules → organisms → templates → pages
 * Solo las páginas (src/pages, src/dev, src/app) hablan con el puente (src/bridge).
 */
const layer = (name) => [`@/ui/${name}`, `@/ui/${name}/*`, `**/${name}/*`];
const forbid = (layers, extra = []) => ({
  '@typescript-eslint/no-restricted-imports': [
    'error',
    {
      patterns: [
        ...layers.map((name) => ({
          group: layer(name),
          message: `Atomic design: esta capa no puede importar de "${name}". Ver docs/DISENO.md.`,
        })),
        ...extra,
      ],
    },
  ],
});
const noBridge = {
  group: ['@/bridge', '@/bridge/*', '**/bridge/*'],
  allowTypeImports: true,
  message: 'Los componentes de src/ui reciben datos por props. Solo las páginas usan el puente.',
};
const noPages = {
  group: ['@/pages/*', '@/dev/*', '@/app/*'],
  message: 'src/ui no puede depender de páginas.',
};

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'src-tauri']),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  { files: ['scripts/**/*.mjs', '*.config.{js,ts}'], languageOptions: { globals: globals.node } },
  {
    files: ['src/ui/atoms/**/*.{ts,tsx}'],
    rules: forbid(['molecules', 'organisms', 'templates'], [noBridge, noPages]),
  },
  {
    files: ['src/ui/molecules/**/*.{ts,tsx}'],
    rules: forbid(['organisms', 'templates'], [noBridge, noPages]),
  },
  {
    files: ['src/ui/organisms/**/*.{ts,tsx}'],
    rules: forbid(['templates'], [noBridge, noPages]),
  },
  { files: ['src/ui/templates/**/*.{ts,tsx}'], rules: forbid([], [noBridge, noPages]) },
  // Las pruebas sí pueden usar los datos de ejemplo del puente simulado.
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: { '@typescript-eslint/no-restricted-imports': 'off' },
  },
]);
