import type { KeyboardEvent } from 'react';

/** Atributo que marca los elementos recorribles con flechas dentro de una lista o un tablero. */
export const NAV_ITEM = 'data-nav-item';
/** Atributo de cada columna de un tablero. */
export const NAV_COLUMN = 'data-nav-column';

/**
 * Flechas dentro de una lista o un tablero (AC-44). Arriba y abajo recorren los elementos de la misma
 * columna; izquierda y derecha saltan a la columna vecina (si hay columnas). Inicio y Fin van al primero
 * y al último. Enter lo resuelve cada elemento (son botones o enlaces).
 */
export function arrowNav(e: KeyboardEvent<HTMLElement>) {
  const current = (e.target as HTMLElement).closest<HTMLElement>(`[${NAV_ITEM}]`);
  if (!current) return;
  const root = e.currentTarget;
  const column = current.closest<HTMLElement>(`[${NAV_COLUMN}]`);
  const scope = column ?? root;
  const items = [...scope.querySelectorAll<HTMLElement>(`[${NAV_ITEM}]`)];
  const i = items.indexOf(current);
  let next: HTMLElement | undefined;
  if (e.key === 'ArrowDown') next = items[i + 1];
  else if (e.key === 'ArrowUp') next = items[i - 1];
  else if (e.key === 'Home') next = items[0];
  else if (e.key === 'End') next = items.at(-1);
  else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && column) {
    const columns = [...root.querySelectorAll<HTMLElement>(`[${NAV_COLUMN}]`)];
    const step = e.key === 'ArrowRight' ? 1 : -1;
    for (let c = columns.indexOf(column) + step; c >= 0 && c < columns.length; c += step) {
      const candidates = [...columns[c]!.querySelectorAll<HTMLElement>(`[${NAV_ITEM}]`)];
      if (candidates.length) {
        next = candidates[Math.min(i, candidates.length - 1)];
        break;
      }
    }
  } else return;
  if (next) {
    e.preventDefault();
    next.focus();
  }
}
