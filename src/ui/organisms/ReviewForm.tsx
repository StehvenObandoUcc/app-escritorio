import { useCallback, useId, useState } from 'react';
import { z } from 'zod';
import type { ReviewField, ReviewSubmission, Task } from '@/cloud/contract';
import { t } from '@/i18n';
import { fileProblem, isHttpUrl } from '@/lib/forms';
import { EVIDENCE_TYPES, LIMITS } from '@/lib/limits';
import { useForm } from '@/lib/useForm';
import { Button, Input, Select, type SelectOption } from '@/ui/atoms';

const textarea = 'w-full rounded-md border bg-surface px-3 py-2 text-base text-fg';
const IMAGE_TYPES = EVIDENCE_TYPES.filter((type) => type.startsWith('image/'));
const isUpload = (f: ReviewField) => f.kind === 'image' || f.kind === 'file';

/** Esquema del formulario de entrega del proyecto: cada campo según su tipo, más los criterios (AC-24, AC-50). */
function deliverySchema(template: ReviewField[], criteria: Task['criteria']) {
  const fields: Record<string, z.ZodType> = {};
  for (const f of template) {
    const required = t('review.errorRequired', { field: f.label });
    if (isUpload(f)) {
      fields[f.key] = z
        .array(z.instanceof(File))
        .refine((files) => !f.required || files.length > 0, required)
        .refine((files) => f.kind !== 'image' || files.every((x) => x.type.startsWith('image/')), t('review.errorImage', { field: f.label }))
        .refine((files) => fileProblem(files) === null, { error: (issue) => fileProblem(issue.input as File[]) ?? '' });
    } else {
      fields[f.key] = z
        .string()
        .max(LIMITS.answer.length, t('forms.max', { max: LIMITS.answer.length }))
        .refine((v) => !f.required || (f.kind === 'checklist' ? v === 'true' : v.trim() !== ''), required)
        .refine((v) => f.kind !== 'url' || v.trim() === '' || isHttpUrl(v.trim()), t('review.errorUrl', { field: f.label }));
    }
  }
  return z.object({ ...fields, criteria: z.array(z.string()).refine((met) => criteria.every((c) => met.includes(c.id)), t('review.errorCriteria')) });
}

/**
 * Formulario de entrega (filas 27 y 32, ADR-0014, ADR-0016 y ADR-0018). Lo define el proyecto: cada campo es
 * texto, enlace (http/https), casilla, imágenes o archivos, y se pide según su tipo. `mode = 'submit'` envía a
 * revisión (con revisor opcional); `mode = 'complete'` lo usa quien gestiona para completar directamente.
 */
export function ReviewForm({
  mode,
  task,
  template,
  reviewers,
  onSubmit,
  onCancel,
}: {
  mode: 'submit' | 'complete';
  task: Pick<Task, 'criteria'>;
  template: ReviewField[];
  /** Otras personas del proyecto que pueden revisar (solo en modo `submit`). */
  reviewers: SelectOption[];
  onSubmit: (submission: ReviewSubmission) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File[]>>({});
  const [met, setMet] = useState<string[]>([]);
  const [reviewer, setReviewer] = useState('');
  const schema = useCallback(() => deliverySchema(template, task.criteria), [template, task.criteria]);
  const { ref, errors: err, formError, busy, submit, onKeyDown } = useForm(schema, onCancel);
  const answer = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));
  const values = { ...Object.fromEntries(template.map((f) => [f.key, isUpload(f) ? (files[f.key] ?? []) : (answers[f.key] ?? '')])), criteria: met };

  return (
    <form
      ref={ref}
      onKeyDown={onKeyDown}
      onSubmit={(e) =>
        void submit(
          values,
          () =>
            onSubmit({
              answers: Object.fromEntries(template.filter((f) => !isUpload(f)).map((f) => [f.key, (answers[f.key] ?? '').trim()])),
              files: Object.fromEntries(template.filter(isUpload).map((f) => [f.key, files[f.key] ?? []])),
              reviewerId: reviewer || null,
              criteriaMet: met,
            }),
          e,
        )
      }
      className="flex flex-col gap-4"
      noValidate
      aria-label={mode === 'submit' ? t('review.formLabel') : t('review.completeLabel')}
    >
      {mode === 'complete' && <p className="text-sm text-fg-muted">{t('review.completeHint')}</p>}
      {template.map((f, i) => {
        const fieldId = `${id}-${f.key}`;
        const label = f.required ? `${f.label} *` : f.label;
        const error = err[f.key];
        const help = error ? <p id={`${fieldId}-help`} className="text-sm text-danger">{error}</p> : null;
        if (f.kind === 'checklist') {
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label className="flex items-center gap-2 text-sm text-fg">
                <input type="checkbox" name={f.key} checked={answers[f.key] === 'true'} onChange={(e) => answer(f.key, e.target.checked ? 'true' : 'false')} />
                {label}
              </label>
              {help}
            </div>
          );
        }
        if (isUpload(f)) {
          const chosen = files[f.key] ?? [];
          return (
            <div key={f.key} className="flex flex-col gap-1">
              <label htmlFor={fieldId} className="text-sm font-medium text-fg">
                {label}
              </label>
              <input
                id={fieldId}
                name={f.key}
                type="file"
                multiple
                accept={(f.kind === 'image' ? IMAGE_TYPES : EVIDENCE_TYPES).join(',')}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={`${fieldId}-help`}
                onChange={(e) => setFiles((x) => ({ ...x, [f.key]: [...(e.target.files ?? [])] }))}
                className="rounded-md text-sm text-fg file:mr-3 file:h-control-sm file:rounded-md file:border file:border-line-strong file:bg-surface file:px-3 file:text-fg hover:file:bg-sunken"
              />
              {chosen.length > 0 && <p className="text-sm text-fg">{chosen.map((x) => x.name).join(', ')}</p>}
              {help ?? (
                <p id={`${fieldId}-help`} className="text-sm text-fg-muted">
                  {f.kind === 'image' ? t('review.imageHint') : t('review.fileHint')}
                </p>
              )}
            </div>
          );
        }
        return (
          <div key={f.key} className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="text-sm font-medium text-fg">
              {label}
            </label>
            {f.kind === 'text' ? (
              <textarea
                id={fieldId}
                name={f.key}
                rows={4}
                autoFocus={i === 0}
                maxLength={LIMITS.answer.length}
                value={answers[f.key] ?? ''}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? `${fieldId}-help` : undefined}
                onChange={(e) => answer(f.key, e.target.value)}
                className={`${textarea} ${error ? 'border-danger' : 'border-line-strong'}`}
              />
            ) : (
              <Input
                id={fieldId}
                name={f.key}
                type="url"
                inputMode="url"
                placeholder="https://"
                maxLength={LIMITS.links.length}
                invalid={Boolean(error)}
                aria-describedby={error ? `${fieldId}-help` : undefined}
                value={answers[f.key] ?? ''}
                onChange={(e) => answer(f.key, e.target.value)}
              />
            )}
            {help}
          </div>
        );
      })}

      {task.criteria.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-fg">{t('review.criteria')} *</legend>
          {task.criteria.map((c, i) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                name={i === 0 ? 'criteria' : undefined}
                checked={met.includes(c.id)}
                onChange={(e) => setMet((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))}
              />
              {c.text}
            </label>
          ))}
          {err.criteria && <p className="text-sm text-danger">{err.criteria}</p>}
        </fieldset>
      )}

      {mode === 'submit' && (
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('review.reviewer')}
          <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)} options={[{ value: '', label: t('review.anyReviewer') }, ...reviewers]} />
        </label>
      )}

      {formError && (
        <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" disabled={busy}>
          {mode === 'submit' ? t('review.submit') : t('review.complete')}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <span className="text-xs text-fg-muted">{t('forms.keysHint')}</span>
      </div>
    </form>
  );
}
