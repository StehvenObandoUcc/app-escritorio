import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'pulso.theme';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Preferencia de tema. Solo guarda una preferencia visual: nada sensible. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(read);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Sin almacenamiento disponible: el tema dura lo que dure la sesión.
    }
  }, [theme]);

  const cycle = useCallback(
    () => setTheme((t) => ORDER[(ORDER.indexOf(t) + 1) % ORDER.length] ?? 'system'),
    [],
  );
  return { theme, cycle };
}
