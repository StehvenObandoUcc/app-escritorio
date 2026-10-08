import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

/** Campos que Enter recorre dentro de un formulario. */
const FIELDS = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=submit]):not([type=button]):not(:disabled), select:not(:disabled), textarea:not(:disabled)';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);

/**
 * Enter en un campo de texto pasa al siguiente campo vacío del mismo formulario y solo envía cuando ya no
 * quedan vacíos; Ctrl+Enter envía desde un área de texto (AC-43). Funciona en todos los formularios de la app.
 * Devuelve true si atendió la tecla.
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

/**
 * Teclado en toda la app (AC-43, AC-44, ADR-0019):
 * - Enter avanza entre campos de cualquier formulario; Ctrl+Enter envía desde un área de texto.
 * - Alt+1 … Alt+6 abren cada sección de la navegación.
 * - «?» abre la ayuda de atajos (si no se está escribiendo).
 * - Al cambiar de pantalla, el foco va al contenido para seguir con Tab desde ahí.
 */
export function useAppKeyboard(routes: string[], openHelp: () => void) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (enterToNextField(e)) return;
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
