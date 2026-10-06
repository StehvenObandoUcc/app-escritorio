import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from './theme';

// jsdom no trae matchMedia: se simula la preferencia del sistema.
const systemPrefers = (dark: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: dark && query.includes('dark') }) as MediaQueryList);

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('cambio de tema', () => {
  it.each([true, false])('cada clic cambia lo que se ve (sistema en oscuro: %s)', (dark) => {
    systemPrefers(dark);
    const { result } = renderHook(() => useTheme());
    const seen = () => document.documentElement.getAttribute('data-theme');
    act(() => result.current.cycle());
    expect(seen()).toBe(dark ? 'light' : 'dark');
    act(() => result.current.cycle());
    expect(seen()).toBe(dark ? 'dark' : 'light');
    act(() => result.current.cycle());
    expect(seen()).toBe(dark ? 'light' : 'dark');
  });
});
