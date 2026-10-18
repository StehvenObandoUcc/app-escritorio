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

/**
 * Patrón común de formulario (AC-42, AC-43), sin librerías:
 * - valida con un esquema de `forms.ts` y deja un error junto a cada campo (`errors[campo]`);
 * - lleva el foco al primer campo con error (los campos se buscan por su atributo `name`);
 * - no envía dos veces mientras espera;
 * - Esc y Cancelar llaman a `cancel`: si el formulario cambió desde que se abrió, primero piden confirmar
 *   (`discard`, se muestra con `DiscardDialog`); si está limpio, llaman a `onCancel` directo (H3).
 *   Se compara el estado del DOM del formulario, así sirve para cualquier formulario sin tocar sus campos.
 * - Enter (siguiente campo) y Ctrl+Enter (enviar) funcionan en toda la app.
 */
export function useForm<S extends z.ZodType>(schema: () => S, onCancel?: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const initial = useRef('');
  useEffect(() => {
    initial.current = snapshot(ref.current);
  }, []);

  /** Cancela; si hay cambios sin enviar, pide confirmar antes de descartarlos. */
  const cancel = useCallback(() => {
    if (!onCancel) return;
    if (snapshot(ref.current) !== initial.current) setConfirming(true);
    else onCancel();
  }, [onCancel]);
  const discard = {
    open: confirming,
    keep: () => setConfirming(false),
    confirm: () => {
      setConfirming(false);
      onCancel?.();
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
