import type { Bridge } from '@/bridge/contract';
import type { Cloud } from './contract';
import { createMockCloud } from './mock';
import { createSupabaseCloud } from './supabase';

/**
 * Regla: se usa Supabase solo con el puente real (la app de escritorio) Y con
 * VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en `.env`. En cualquier otro caso, la nube
 * simulada: así los datos de ejemplo del navegador nunca llegan al proyecto real.
 */
export function createCloud(bridge: Bridge): Cloud {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (bridge.source === 'tauri' && typeof url === 'string' && url && typeof key === 'string' && key) {
    return createSupabaseCloud(bridge, url, key);
  }
  return createMockCloud();
}

export * from './contract';
