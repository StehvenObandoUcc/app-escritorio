import { isTauri } from '@tauri-apps/api/core';
import type { Bridge } from './contract';
import { createMockBridge } from './mock';
import { createTauriBridge } from './tauri';

/**
 * Regla: se usan los comandos reales solo si la app corre dentro de Tauri Y
 * VITE_BRIDGE=tauri. En cualquier otro caso, datos de ejemplo (y la interfaz
 * lo indica con la etiqueta "Datos de ejemplo").
 */
export function createBridge(): Bridge {
  const wantsTauri = import.meta.env.VITE_BRIDGE === 'tauri';
  return wantsTauri && isTauri() ? createTauriBridge() : createMockBridge();
}

export const bridge: Bridge = createBridge();
export * from './contract';
