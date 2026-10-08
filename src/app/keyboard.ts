import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Campos que Enter recorre dentro de un formulario. */
const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';
/** Todo lo que puede recibir el foco con el teclado. */
const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled):not([type=hidden]), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';
/** Campos que usan las flechas para su propio valor: ahí las flechas no mueven el foco. */
const OWN_ARROWS = 'textarea, select, input[type=number], input[type=date], input[type=time], input[type=range], [role=tab], [contenteditable=true]';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);

/**
 * Enter en un campo de texto pasa al siguiente campo vacío del mismo formulario y solo envía cuando ya no
 * quedan vacíos; Ctrl+Enter envía desde un área de texto (AC-43). Devuelve true si atendió la tecla.
 */
export function enterToNextField(e: KeyboardEvent): boolean {
  const target = e.target;
  const form = target instanceof HTMLElement ? target.closest('form') : null;
  if (!form || e.key !== 'Enter' || e.defaultPrevented) return false;
  if (target instanceof HTMLTextAreaElement) {
    if (!(e.ctrlKey || e.metaKey)) return false;
    e.preventDefault();
    form.requestSubmit();
    return true;
  }
  if (!(target instanceof HTMLInputElement) || !target.matches(FIELDS)) return false;
  const fields = [...form.querySelectorAll<HTMLInputElement>(FIELDS)];
  const next = fields.slice(fields.indexOf(target) + 1).find((f) => !f.value);
  if (!next) return false;
  e.preventDefault();
  next.focus();
  return true;
}

const DIRECTION = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] } as const;

/**
 * Flechas en toda la app (ADR-0021): mueven el foco al elemento más cercano en esa dirección (navegación
 * espacial), en cualquier pantalla y dentro del diálogo abierto si lo hay. Enter activa lo enfocado.
 * Sin posiciones (pruebas en jsdom) se usa el orden del documento. Devuelve true si movió el foco.
 */
export function arrowToNearest(e: KeyboardEvent): boolean {
  const dir = DIRECTION[e.key as keyof typeof DIRECTION];
  if (!dir || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  const active = document.activeElement;
  // Sin foco, o con el foco en el contenedor de la pantalla, la flecha va al primer elemento del contenido.
  const from = active instanceof HTMLElement && active !== document.body && active.id !== 'contenido' ? active : null;
  if (from?.matches(OWN_ARROWS)) return false;
  // En un campo de texto, izquierda y derecha mueven el cursor.
  if (from instanceof HTMLInputElement && dir[0] !== 0) return false;
  const scope = document.querySelector<HTMLElement>('dialog[open]') ?? document.body;
  const all = [...scope.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.closest('[inert], [aria-hidden=true]'));
  const candidates = all.filter((el) => el !== from);
  if (!candidates.length) return false;
  let next: HTMLElement | undefined;
  const box = from?.getBoundingClientRect();
  const placed = box && (box.width > 0 || box.height > 0);
  if (!from) next = (document.getElementById('contenido')?.querySelector<HTMLElement>(FOCUSABLE) ?? candidates[0]) || undefined;
  else if (placed) {
    const fx = box.left + box.width / 2;
    const fy = box.top + box.height / 2;
    let best = Infinity;
    for (const el of candidates) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const dx = r.left + r.width / 2 - fx;
      const dy = r.top + r.height / 2 - fy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 1) continue;
      const across = Math.abs(dir[0] ? dy : dx);
      const score = along + across * 2;
      if (score < best) {
        best = score;
        next = el;
      }
    }
  } else {
    const i = all.indexOf(from);
    next = dir[0] + dir[1] > 0 ? all.slice(i + 1).find((el) => el !== from) : all.slice(0, i).reverse()[0];
  }
  if (!next) return false;
  e.preventDefault();
  next.focus();
  next.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  return true;
}

/**
 * Teclado en toda la app (AC-43, AC-51, ADR-0019 y ADR-0021):
 * - flechas: mueven el foco al elemento más cercano en esa dirección; Enter lo activa;
 * - Enter en un formulario pasa al siguiente campo vacío; Ctrl+Enter envía desde un área de texto;
 * - Alt+1 … Alt+6 abren cada sección; «?» muestra la ayuda (si no se está escribiendo);
 * - al cambiar de pantalla, el foco va al contenido.
 */
export function useAppKeyboard(routes: string[], openHelp: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enterToNextField(e) || arrowToNearest(e)) return;
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^Digit[1-9]$/.test(e.code)) {
        const route = routes[Number(e.code.slice(5)) - 1];
        if (route) {
          e.preventDefault();
          navigate(route);
        }
        return;
      }
      if (e.key === '?' && !isTyping(e.target) && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        openHelp();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [routes, navigate, openHelp]);

  useEffect(() => {
    document.getElementById('contenido')?.focus({ preventScroll: true });
  }, [pathname]);
}
