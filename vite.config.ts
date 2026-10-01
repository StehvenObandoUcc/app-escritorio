import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

// El puerto 1420 es el que espera Tauri (src-tauri/tauri.conf.json → build.devUrl).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': src } },
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**'] } },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'ui',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
          setupFiles: ['src/test-setup.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['supabase/tests/**/*.test.ts'],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
