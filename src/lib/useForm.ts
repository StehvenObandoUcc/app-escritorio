import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { z } from 'zod';
import { errorMessage } from '@/i18n';
import { fieldErrors } from './forms';

/**
 * Patrón común de formulario (AC-42, AC-43), sin librerías:
 * - valida con un esquema de `forms.ts` y deja un error junto a cada campo (`errors[campo]`);
 * - lleva el foco al primer campo con error (los campos se buscan por su atributo `name`);
 * - no envía dos veces mientras espera;
 * - Enter pasa al siguiente campo y solo envía desde el último; Ctrl+Enter envía desde un área de texto;
 *   Esc llama a `onCancel`.
 */
export function useForm<S extends z.ZodType>(schema: () => S, onCancel?: () => void) {
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      const target = e.target as HTMLElement;
      if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Enter') return;
      if (target instanceof HTMLTextAreaElement) {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          ref.current?.requestSubmit();
        }
        return;
      }
      if (!(target instanceof HTMLInputElement) || target.type === 'checkbox' || target.type === 'file') return;
      const fields = [...(ref.current?.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=file]):not(:disabled), select:not(:disabled), textarea:not(:disabled)') ?? [])];
      const next = fields.slice(fields.indexOf(target) + 1).find((f) => !(f as HTMLInputElement).value);
      // Con campos vacíos por delante, Enter avanza; si todo está lleno, envía (arregla C5).
      if (next) {
        e.preventDefault();
        next.focus();
      }
    },
    [onCancel],
  );

  return { ref, errors, setErrors, formError, setFormError, busy, submit, onKeyDown };
}
