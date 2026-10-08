import { ExternalLink, History } from 'lucide-react';
import { useState } from 'react';
import type { Project, Task, TaskHistory } from '@/cloud/contract';
import { formatDate, t, type TKey } from '@/i18n';
import { fieldErrors, forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { canReview, STATUS_LABEL } from '@/lib/tasks';
import { Button, Heading } from '@/ui/atoms';

const when = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/**
 * Revisión pendiente de una tarea (fila 28): respuestas del formulario, enlaces y archivos de evidencia, y la
 * decisión (aprobar o pedir cambios, con comentario obligatorio para pedir cambios).
 */
export function TaskReview({
  task,
  project,
  me,
  readOnly,
  nameOf,
  onDecide,
  onOpenLink,
  onOpenEvidence,
}: {
  task: Task;
  project: Pick<Project, 'myRole' | 'archivedAt' | 'reviewTemplate'>;
  me: string;
  readOnly: boolean;
  nameOf: (userId: string | null) => string | null;
  onDecide: (approve: boolean, comment: string | null) => Promise<void>;
  onOpenLink: (url: string) => void;
  onOpenEvidence: (path: string) => void;
}) {
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const r = task.pendingReview;
  if (!r) return null;
  const fieldLabel = (key: string) => project.reviewTemplate.find((f) => f.key === key)?.label ?? key;
  const decide = !readOnly && canReview(project, task, me);

  const send = async (approve: boolean) => {
    const result = fieldErrors(forms.reviewComment(!approve), { comment });
    if (result.errors) return setError(result.errors.comment ?? null);
    setBusy(true);
    setError(null);
    try {
      await onDecide(approve, result.data.comment || null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={t('review.pending')} className="flex flex-col gap-3 rounded-lg border border-line p-4">
      <Heading level={2}>{t('review.pending')}</Heading>
      <p className="text-sm text-fg-muted">
        {t('review.submittedBy', { name: nameOf(r.submittedBy) ?? t('common.exMember'), date: when(r.createdAt) })}
        {r.reviewerId && ` · ${t('review.requestedReviewer', { name: nameOf(r.reviewerId) ?? t('common.exMember') })}`}
      </p>
      <dl className="flex flex-col gap-2">
        {Object.entries(r.answers)
          .filter(([, v]) => v.trim() !== '')
          .map(([k, v]) => (
            <div key={k}>
              <dt className="text-sm font-medium text-fg">{fieldLabel(k)}</dt>
              <dd className="text-sm whitespace-pre-line text-fg-muted">{v === 'true' ? t('review.yes') : v}</dd>
            </div>
          ))}
      </dl>
      {(r.links.length > 0 || r.attachments.length > 0) && (
        <ul className="flex flex-wrap gap-2">
          {r.links.map((l) => (
            <li key={l}>
              <Button size="sm" variant="ghost" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => onOpenLink(l)}>
                <span className="max-w-64 truncate">{l}</span>
              </Button>
            </li>
          ))}
          {r.attachments.map((a) => (
            <li key={a.id}>
              <Button size="sm" variant="ghost" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => onOpenEvidence(a.path)}>
                {a.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {decide && (
        <div className="flex flex-col gap-2">
          <textarea
            aria-label={t('review.comment')}
            placeholder={t('review.commentPlaceholder')}
            rows={3}
            maxLength={LIMITS.reviewComment.max}
            value={comment}
            aria-invalid={Boolean(error) || undefined}
            onChange={(e) => setComment(e.target.value)}
            className={`w-full rounded-md border bg-surface px-3 py-2 text-base text-fg ${error ? 'border-danger' : 'border-line-strong'}`}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void send(true)}>
              {t('review.approve')}
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void send(false)}>
              {t('review.requestChanges')}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

const KIND_KEY: Record<string, TKey> = {
  created: 'history.created',
  edited: 'history.edited',
  status_changed: 'history.status_changed',
  assignee_changed: 'history.assignee_changed',
  collaborators_changed: 'history.collaborators_changed',
  estimate_changed: 'history.estimate_changed',
  criteria_changed: 'history.criteria_changed',
  review_submitted: 'history.review_submitted',
  review_approved: 'history.review_approved',
  changes_requested: 'history.changes_requested',
  evidence_added: 'history.evidence_added',
};

/** Historial de la tarea (AC-27). Se carga al pedirlo. */
export function TaskHistoryList({ history, onLoad }: { history: TaskHistory | null; onLoad: () => void }) {
  if (!history) {
    return (
      <div>
        <Button size="sm" variant="ghost" icon={<History size={16} aria-hidden="true" />} onClick={onLoad}>
          {t('tasks.panel.showHistory')}
        </Button>
      </div>
    );
  }
  return (
    <section aria-label={t('history.title')} className="flex flex-col gap-2">
      <Heading level={2}>{t('history.title')}</Heading>
      <ol className="flex flex-col gap-1">
        {history.events.map((e, i) => {
          const details = e.details as { from?: string; to?: string; comment?: string; direct?: boolean };
          const statusChange = e.kind === 'status_changed' && details.from && details.to;
          return (
            <li key={i} className="text-sm text-fg">
              <span className="text-fg-muted tabular-nums">{when(e.createdAt)}</span> · {e.actorName ?? t('common.noName')} ·{' '}
              {KIND_KEY[e.kind] ? t(KIND_KEY[e.kind]!) : e.kind}
              {details.direct && e.kind === 'review_approved' && ` (${t('history.direct')})`}
              {statusChange && ` (${STATUS_LABEL[details.from as Task['status']] ?? details.from} → ${STATUS_LABEL[details.to as Task['status']] ?? details.to})`}
              {details.comment && <span className="text-fg-muted"> — «{details.comment}»</span>}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
