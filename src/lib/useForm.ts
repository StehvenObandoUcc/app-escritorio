import { useCallback, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { z } from 'zod';
import { errorMessage } from '@/i18n';
import { fieldErrors } from './forms';

/**
 * Patrón común de formulario (AC-42, AC-43), sin librerías:
 * - valida con un esquema de `forms.ts` y deja un error junto a cada campo (`errors[campo]`);
 * - lleva el foco al primer campo con error (los campos se buscan por su atributo `name`);
 * - no envía dos veces mientras espera;
 * - Esc llama a `onCancel`. Enter (siguiente campo) y Ctrl+Enter (enviar) funcionan en toda la app.
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

  // Enter y Ctrl+Enter los resuelve la capa de teclado de toda la app (src/app/keyboard.ts); aquí solo Esc.
  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLFormElement>) => {
      if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    },
    [onCancel],
  );

  return { ref, errors, setErrors, formError, setFormError, busy, submit, onKeyDown };
}
