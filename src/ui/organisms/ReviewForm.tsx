import { useId, useState, type FormEvent } from 'react';
import { MAX_EVIDENCE_BYTES, type ReviewField, type ReviewSubmission, type Task } from '@/cloud/contract';
import { t } from '@/i18n';
import { Button, Input, Select, type SelectOption } from '@/ui/atoms';

const URL_RE = /^https?:\/\/\S+$/;

/**
 * Enviar una tarea a revisión (fila 27, ADR-0014), al estilo de un PR: el formulario de entrega del proyecto,
 * los criterios de aceptación marcados, enlaces y archivos de evidencia, y un revisor opcional.
 * Valida lo mismo que `submit_for_review` para avisar antes de enviar; la base vuelve a comprobarlo.
 */
export function ReviewForm({
  task,
  template,
  reviewers,
  onSubmit,
  onCancel,
}: {
  task: Pick<Task, 'criteria'>;
  template: ReviewField[];
  /** Otras personas del proyecto que pueden revisar. */
  reviewers: SelectOption[];
  onSubmit: (submission: ReviewSubmission) => Promise<void>;
  onCancel: () => void;
}) {
  const id = useId();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [met, setMet] = useState<string[]>([]);
  const [links, setLinks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [reviewer, setReviewer] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const answer = (key: string, value: string) => setAnswers((a) => ({ ...a, [key]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    for (const f of template) {
      const value = (answers[f.key] ?? '').trim();
      if (f.required && (value === '' || (f.kind === 'checklist' && value !== 'true'))) return setError(t('review.errorRequired', { field: f.label }));
      if (f.kind === 'url' && value !== '' && !URL_RE.test(value)) return setError(t('review.errorUrl', { field: f.label }));
    }
    if (task.criteria.some((c) => !met.includes(c.id))) return setError(t('review.errorCriteria'));
    const list = links.split('\n').map((l) => l.trim()).filter(Boolean);
    if (list.length > 10 || list.some((l) => !URL_RE.test(l))) return setError(t('review.errorLinks'));
    if (files.some((f) => f.size > MAX_EVIDENCE_BYTES)) return setError(t('review.errorFileSize'));
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ answers, links: list, reviewerId: reviewer || null, criteriaMet: met, files });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate aria-label={t('review.formLabel')}>
      {template.map((f) => {
        const fieldId = `${id}-${f.key}`;
        const label = f.required ? `${f.label} *` : f.label;
        if (f.kind === 'checklist') {
          return (
            <label key={f.key} className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={answers[f.key] === 'true'} onChange={(e) => answer(f.key, e.target.checked ? 'true' : 'false')} />
              {label}
            </label>
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
                rows={3}
                maxLength={5000}
                value={answers[f.key] ?? ''}
                onChange={(e) => answer(f.key, e.target.value)}
                className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
              />
            ) : (
              <Input id={fieldId} type="url" inputMode="url" value={answers[f.key] ?? ''} onChange={(e) => answer(f.key, e.target.value)} />
            )}
          </div>
        );
      })}

      {task.criteria.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-sm font-medium text-fg">{t('review.criteria')}</legend>
          {task.criteria.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" checked={met.includes(c.id)} onChange={(e) => setMet((m) => (e.target.checked ? [...m, c.id] : m.filter((x) => x !== c.id)))} />
              {c.text}
            </label>
          ))}
        </fieldset>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-links`} className="text-sm font-medium text-fg">
          {t('review.links')}
        </label>
        <textarea
          id={`${id}-links`}
          rows={2}
          value={links}
          onChange={(e) => setLinks(e.target.value)}
          className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
        />
        <p className="text-sm text-fg-muted">{t('review.linksHint')}</p>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-files`} className="text-sm font-medium text-fg">
          {t('review.files')}
        </label>
        <input id={`${id}-files`} type="file" multiple onChange={(e) => setFiles([...(e.target.files ?? [])])} className="text-sm text-fg" />
        <p className="text-sm text-fg-muted">{t('review.filesHint')}</p>
      </div>

      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {t('review.reviewer')}
        <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)} options={[{ value: '', label: t('review.anyReviewer') }, ...reviewers]} />
      </label>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={busy}>
          {t('review.submit')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
