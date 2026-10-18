import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { z } from 'zod';
import { errorMessage } from '@/i18n';
import { fieldErrors } from './forms';

/** Foto de los valores de los campos del formulario (texto, casillas y nombres de archivos elegidos). */
function snapshot(form: HTMLFormElement | null): string {
  if (!form) return '';
  return JSON.stringify(
    [...form.elements].map((el) => {
      if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return '';
      if (el instanceof HTMLInputElement) {
        if (el.type === 'file') return [...(el.files ?? [])].map((f) => f.name);
        if (el.type === 'checkbox' || el.type === 'radio') return el.checked;
      }
      return el.value;
    }),
  );
}

/** Formularios abiertos que piden confirmar antes de salir de la pantalla si tienen cambios. */
const leaveGuards = new Set<(go: () => void) => boolean>();
let bypassGuards = false;

/**
 * Si algún formulario abierto tiene cambios, le pide confirmar y devuelve true: `go` (la salida) queda en
 * espera y solo se ejecuta si la persona elige descartar. Sin cambios devuelve false y no hace nada (H3).
 */
export function blockLeave(go: () => void): boolean {
  if (bypassGuards) return false;
  for (const ask of leaveGuards) if (ask(go)) return true;
  return false;
}

// Los enlaces internos (menú, migas, «Ir a Equipo»…) pasan por el aviso. Se escucha en captura para llegar
// antes que el enrutador; HashRouter no admite `useBlocker`, por eso se hace aquí.
if (typeof document !== 'undefined') {
  document.addEventListener(
    'click',
    (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
      const a = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null;
      const href = a?.getAttribute('href');
      if (!a || !href || a.target === '_blank' || /^[a-z][a-z\d+.-]*:/i.test(href)) return;
      const go = () => {
        bypassGuards = true;
        try {
          a.click();
        } finally {
          bypassGuards = false;
        }
      };
      if (blockLeave(go)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

/**
 * Patrón común de formulario (AC-42, AC-43), sin librerías:
 * - valida con un esquema de `forms.ts` y deja un error junto a cada campo (`errors[campo]`);
 * - lleva el foco al primer campo con error (los campos se buscan por su atributo `name`);
 * - no envía dos veces mientras espera;
 * - Esc y Cancelar llaman a `cancel`: si el formulario cambió desde que se abrió, primero piden confirmar
 *   (`discard`, se muestra con `DiscardDialog`); si está limpio, llaman a `onCancel` directo (H3).
 *   Se compara el estado del DOM del formulario, así sirve para cualquier formulario sin tocar sus campos.
 *   Lo mismo al cambiar de pantalla (enlaces y Alt+número) mientras el formulario está abierto con cambios.
 * - Enter (siguiente campo) y Ctrl+Enter (enviar) funcionan en toda la app.
 */
export function useForm<S extends z.ZodType>(schema: () => S, onCancel?: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const initial = useRef('');
  /** Salida de la pantalla en espera de confirmar; null si lo que se confirma es cancelar el formulario. */
  const leave = useRef<(() => void) | null>(null);
  useEffect(() => {
    initial.current = snapshot(ref.current);
  }, []);

  // Solo los formularios que se pueden cancelar (abiertos para una tarea concreta) avisan al salir.
  useEffect(() => {
    if (!onCancel) return;
    const ask = (go: () => void) => {
      if (snapshot(ref.current) === initial.current) return false;
      leave.current = go;
      setConfirming(true);
      return true;
    };
    leaveGuards.add(ask);
    return () => {
      leaveGuards.delete(ask);
    };
  }, [onCancel]);

  /** Cancela; si hay cambios sin enviar, pide confirmar antes de descartarlos. */
  const cancel = useCallback(() => {
    if (!onCancel) return;
    leave.current = null;
    if (snapshot(ref.current) !== initial.current) setConfirming(true);
    else onCancel();
  }, [onCancel]);
  const discard = {
    open: confirming,
    keep: () => {
      leave.current = null;
      setConfirming(false);
    },
    confirm: () => {
      const go = leave.current;
      leave.current = null;
      setConfirming(false);
      if (go) go();
      else onCancel?.();
    },
  };

  const focusField = useCallback((name: string) => {
    const el = ref.current?.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    el?.focus();
  }, []);

  /** Valida `values`; si está bien, ejecuta `action` con los datos limpios. Devuelve si se envió. */
  const submit = useCallback(
    async (values: unknown, action: (data: z.infer<S>) => Promise<void>, event?: FormEvent) => {
      event?.preventDefault();
      if (busy) return false;
      const result = fieldErrors(schema(), values);
      if (result.errors) {
        setErrors(result.errors);
        setFormError(null);
        const first = Object.keys(result.errors)[0];
        if (first) focusField(first);
        return false;
      }
      setErrors({});
      setFormError(null);
      setBusy(true);
      try {
        await action(result.data);
        return true;
      } catch (cause) {
        setFormError(errorMessage(cause));
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, schema, focusField],
  );

  // Enter y Ctrl+Enter los resuelve la capa de teclado de toda la app (src/app/keyboard.ts); aquí solo Esc.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        cancel();
      }
    },
    [onCancel, cancel],
  );

  return { ref, errors, setErrors, formError, setFormError, busy, submit, onKeyDown, cancel, discard };
}
