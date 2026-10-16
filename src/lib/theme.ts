import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'pulso.theme';

function read(): ThemeChoice {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}

/** Tema que se ve en pantalla: el elegido, o el del sistema si no se eligió ninguno. */
export function visibleTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

function apply(theme: ThemeChoice) {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/**
 * Aplica el tema guardado antes de montar React (C4, AC-46): si se esperara al primer efecto, la primera
 * pintura saldría con el tema de Windows y luego cambiaría.
 */
export function applyStoredTheme() {
  apply(read());
}

/** Preferencia de tema. Solo guarda una preferencia visual: nada sensible. */
export function useTheme() {
  const [theme, setTheme] = useState<ThemeChoice>(read);

  useEffect(() => {
    apply(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      // Sin almacenamiento disponible: el tema dura lo que dure la sesión.
    }
  }, [theme]);

  // Cada clic pasa al tema contrario al que se ve. «Sistema» solo es el punto de partida:
  // antes, pasar de «oscuro» a «sistema» con Windows en oscuro no cambiaba nada y obligaba a un 2.º clic.
  const cycle = useCallback(() => setTheme((t) => (visibleTheme(t) === 'dark' ? 'light' : 'dark')), []);
  return { theme, cycle };
}
