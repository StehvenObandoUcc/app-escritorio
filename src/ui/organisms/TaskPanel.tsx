import { CheckCircle2, Circle, ExternalLink, History, Play, Square } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { ManualStatus, NewTaskExtras, Project, ReviewSubmission, Task, TaskHistory, TaskInput } from '@/cloud/contract';
import { formatDate, t, type TKey } from '@/i18n';
import {
  canChangeStatus,
  canManagePeople,
  canManageProject,
  canReview,
  canSubmit,
  formatMinutes,
  STATUS_LABEL,
  timeRatio,
  TYPE_LABEL,
} from '@/lib/tasks';
import { Badge, Button, Heading, Input, ProgressBar, Select, type SelectOption } from '@/ui/atoms';
import { TaskForm } from '@/ui/molecules';
import { ReviewForm } from './ReviewForm';
import { TaskStatusControl } from './TaskList';

export interface TaskPanelProps {
  task: Task;
  project: Pick<Project, 'myRole' | 'archivedAt' | 'reviewTemplate'>;
  /** Subtareas (vacío si la tarea ya es una subtarea). */
  subtasks: Task[];
  parentTitle: string | null;
  me: string;
  nameOf: (userId: string | null) => string | null;
  /** A quién se puede asignar o añadir como apoyo. */
  people: SelectOption[];
  /** Personas del proyecto (revisores posibles). */
  projectPeople: SelectOption[];
  /** Sin red: solo lectura. */
  readOnly: boolean;
  timer: { running: boolean; onThis: boolean };
  history: TaskHistory | null;
  today: string;
  onLoadHistory: () => void;
  onEdit: (input: TaskInput) => Promise<void>;
  onStatus: (status: ManualStatus) => void;
  onCollaborators: (userIds: string[]) => Promise<void>;
  onCriteria: (texts: string[]) => Promise<void>;
  onAddSubtask: (input: TaskInput, extras: NewTaskExtras) => Promise<void>;
  onSubmitReview: (submission: ReviewSubmission) => Promise<void>;
  onDecide: (approve: boolean, comment: string | null) => Promise<void>;
  onTimer: () => void;
  onOpenEvidence: (path: string) => void;
  onOpenTask: (taskId: string) => void;
  onClose: () => void;
}

const when = (iso: string) => formatDate(iso, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });

/** Panel de una tarea (ADR-0014). Muestra a cada quien solo lo que puede hacer; la base vuelve a comprobarlo todo. */
export function TaskPanel(p: TaskPanelProps) {
  const { task, project, me } = p;
  const [mode, setMode] = useState<'view' | 'edit' | 'review' | 'people' | 'criteria'>('view');
  const [error, setError] = useState<string | null>(null);
  const writable = !p.readOnly && !project.archivedAt;
  const manage = writable && canManageProject(project);
  const ratio = timeRatio(task.loggedSeconds, task.estimateMinutes);
  const run = async (action: () => Promise<void>, next: typeof mode = 'view') => {
    setError(null);
    try {
      await action();
      setMode(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  if (mode === 'edit') {
    return (
      <section aria-label={t('tasks.panel.label', { title: task.title })} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4 md:p-5">
        <Heading level={2}>{t('tasks.panel.editTitle')}</Heading>
        <TaskForm initial={task} people={p.people} manage isNew={false} submitLabel={t('common.save')} onCancel={() => setMode('view')} onSubmit={(input) => run(() => p.onEdit(input))} />
      </section>
    );
  }

  return (
    <section aria-label={t('tasks.panel.label', { title: task.title })} className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          {p.parentTitle && <p className="text-sm text-fg-muted">{t('tasks.subtaskOf', { title: p.parentTitle })}</p>}
          <Heading level={2}>{task.title}</Heading>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge>{TYPE_LABEL[task.type]}</Badge>
            <TaskStatusControl task={task} editable={writable && canChangeStatus(project, task, me)} onChange={p.onStatus} />
            {task.dueDate && <span className="text-sm text-fg-muted">{t('tasks.due', { date: formatDate(task.dueDate, { day: 'numeric', month: 'long' }) })}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {manage && (
            <Button size="sm" onClick={() => setMode('edit')}>
              {t('tasks.panel.edit')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={p.onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {task.description && <p className="whitespace-pre-line text-fg">{task.description}</p>}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((l) => (
            <Badge key={l}>{l}</Badge>
          ))}
        </div>
      )}

      <People {...p} editing={mode === 'people'} canEdit={writable && canManagePeople(project, task, me)} onEditing={(on) => setMode(on ? 'people' : 'view')} run={run} />
      <Criteria {...p} editing={mode === 'criteria'} canEdit={manage} onEditing={(on) => setMode(on ? 'criteria' : 'view')} run={run} />

      <div className="flex flex-col gap-2">
        <p className="text-sm text-fg">
          {task.estimateMinutes
            ? t('tasks.timeOf', { logged: formatMinutes(task.loggedSeconds / 60), estimate: formatMinutes(task.estimateMinutes) })
            : t('tasks.panel.logged', { logged: formatMinutes(task.loggedSeconds / 60) })}
        </p>
        {ratio !== null && <ProgressBar value={ratio} label={t('tasks.panel.timeVsEstimate')} fill={ratio > 1 ? 'bg-cat-distraction' : 'bg-accent'} />}
        {writable && task.status !== 'done' && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={p.timer.onThis ? 'primary' : 'secondary'}
              icon={p.timer.onThis ? <Square size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              onClick={p.onTimer}
            >
              {p.timer.onThis ? t('tasks.panel.stopTimer') : p.timer.running ? t('tasks.panel.moveTimer') : t('tasks.panel.startTimer')}
            </Button>
            <p className="text-sm text-fg-muted">{t('tasks.panel.timerHint')}</p>
          </div>
        )}
      </div>

      {!p.parentTitle && <Subtasks {...p} writable={writable} run={run} />}

      <Review {...p} mode={mode} writable={writable} onMode={setMode} run={run} />

      <div className="flex flex-col gap-2">
        {p.history ? (
          <HistoryList history={p.history} />
        ) : (
          <div>
            <Button size="sm" variant="ghost" icon={<History size={16} aria-hidden="true" />} onClick={p.onLoadHistory}>
              {t('tasks.panel.showHistory')}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

type Run = (action: () => Promise<void>, next?: 'view') => Promise<void>;

function People(p: TaskPanelProps & { editing: boolean; canEdit: boolean; onEditing: (on: boolean) => void; run: Run }) {
  const [picked, setPicked] = useState<string[]>(p.task.collaborators);
  const names = p.task.collaborators.map((c) => p.nameOf(c) ?? t('common.exMember'));
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg">
        <span className="font-medium">{t('tasks.panel.assignee')}</span> {p.nameOf(p.task.assigneeId) ?? t('tasks.noAssignee')}
        {' · '}
        <span className="font-medium">{t('tasks.panel.helpers')}</span> {names.length ? names.join(', ') : t('tasks.panel.noHelpers')}
      </p>
      {p.editing ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {p.people
              .filter((o) => o.value !== p.task.assigneeId)
              .map((o) => (
                <label key={o.value} className="flex items-center gap-2 text-sm text-fg">
                  <input type="checkbox" checked={picked.includes(o.value)} onChange={(e) => setPicked((x) => (e.target.checked ? [...x, o.value] : x.filter((v) => v !== o.value)))} />
                  {o.label}
                </label>
              ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void p.run(() => p.onCollaborators(picked))}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => p.onEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      ) : (
        p.canEdit && (
          <div>
            <Button size="sm" variant="ghost" onClick={() => p.onEditing(true)}>
              {t('tasks.panel.manageHelpers')}
            </Button>
          </div>
        )
      )}
    </div>
  );
}

function Criteria(p: TaskPanelProps & { editing: boolean; canEdit: boolean; onEditing: (on: boolean) => void; run: Run }) {
  const [text, setText] = useState(p.task.criteria.map((c) => c.text).join('\n'));
  if (!p.editing && p.task.criteria.length === 0 && !p.canEdit) return null;
  return (
    <div className="flex flex-col gap-2">
      <Heading level={3}>{t('tasks.panel.criteria')}</Heading>
      {p.editing ? (
        <>
          <textarea
            aria-label={t('tasks.form.criteria')}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
          />
          <p className="text-sm text-fg-muted">{t('tasks.form.criteriaHint')}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => void p.run(() => p.onCriteria(text.split('\n').map((c) => c.trim()).filter(Boolean)))}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => p.onEditing(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </>
      ) : (
        <>
          {p.task.criteria.length === 0 ? (
            <p className="text-sm text-fg-muted">{t('tasks.panel.noCriteria')}</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {p.task.criteria.map((c) => (
                <li key={c.id} className="flex items-center gap-2 text-sm text-fg">
                  {c.met ? <CheckCircle2 size={16} className="text-accent-text" aria-label={t('tasks.panel.met')} /> : <Circle size={16} className="text-fg-muted" aria-label={t('tasks.panel.notMet')} />}
                  {c.text}
                </li>
              ))}
            </ul>
          )}
          {p.canEdit && (
            <div>
              <Button size="sm" variant="ghost" onClick={() => p.onEditing(true)}>
                {t('tasks.panel.editCriteria')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Subtasks(p: TaskPanelProps & { writable: boolean; run: Run }) {
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    void p.run(async () => {
      await p.onAddSubtask(
        { title: title.trim(), description: '', type: p.task.type, assigneeId: assignee || null, assigneeCanManage: false, status: 'todo', dueDate: null, labels: [], estimateMinutes: null },
        { parentId: p.task.id },
      );
      setTitle('');
      setAssignee('');
    });
  };
  const done = p.subtasks.filter((s) => s.status === 'done').length;
  return (
    <div className="flex flex-col gap-2">
      <Heading level={3}>{p.subtasks.length ? t('tasks.panel.subtasksCount', { done, n: p.subtasks.length }) : t('tasks.panel.subtasks')}</Heading>
      {p.subtasks.length > 0 && (
        <ul className="flex flex-col gap-1">
          {p.subtasks.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-2 text-sm">
              <button type="button" onClick={() => p.onOpenTask(s.id)} className={`text-left hover:underline ${s.status === 'done' ? 'text-fg-muted line-through' : 'text-fg'}`}>
                {s.title}
              </button>
              <Badge tone={s.status === 'done' ? 'accent' : 'neutral'}>{STATUS_LABEL[s.status]}</Badge>
              <span className="text-fg-muted">{p.nameOf(s.assigneeId) ?? t('tasks.noAssignee')}</span>
            </li>
          ))}
        </ul>
      )}
      {p.writable && (
        <form onSubmit={add} className="flex flex-wrap items-center gap-2">
          <Input className="min-w-40 flex-1" aria-label={t('tasks.panel.newSubtask')} placeholder={t('tasks.panel.newSubtask')} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
          <Select size="sm" aria-label={t('tasks.form.assignee')} value={assignee} onChange={(e) => setAssignee(e.target.value)} options={[{ value: '', label: t('tasks.noAssignee') }, ...(canManageProject(p.project) ? p.people : p.people.filter((o) => o.value === p.me))]} />
          <Button type="submit" size="sm" disabled={!title.trim()}>
            {t('tasks.panel.addSubtask')}
          </Button>
        </form>
      )}
    </div>
  );
}

function Review(p: TaskPanelProps & { mode: string; writable: boolean; onMode: (m: 'view' | 'review') => void; run: Run }) {
  const [comment, setComment] = useState('');
  const r = p.task.pendingReview;
  const fieldLabel = (key: string) => p.project.reviewTemplate.find((f) => f.key === key)?.label ?? key;
  if (p.mode === 'review') {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
        <Heading level={3}>{t('review.title')}</Heading>
        <ReviewForm
          task={p.task}
          template={p.project.reviewTemplate}
          reviewers={p.projectPeople.filter((o) => o.value !== p.me)}
          onCancel={() => p.onMode('view')}
          onSubmit={(sub) => p.run(() => p.onSubmitReview(sub))}
        />
      </div>
    );
  }
  if (r) {
    const decide = canReview(p.project, p.task, p.me) && p.writable;
    return (
      <div className="flex flex-col gap-2 rounded-md border border-line p-3">
        <Heading level={3}>{t('review.pending')}</Heading>
        <p className="text-sm text-fg-muted">
          {t('review.submittedBy', { name: p.nameOf(r.submittedBy) ?? t('common.exMember'), date: when(r.createdAt) })}
          {r.reviewerId && ` · ${t('review.requestedReviewer', { name: p.nameOf(r.reviewerId) ?? t('common.exMember') })}`}
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
        {r.links.length > 0 && (
          <ul className="flex flex-col gap-1">
            {r.links.map((l) => (
              <li key={l}>
                <a href={l} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 text-sm text-accent-text underline">
                  <ExternalLink size={14} aria-hidden="true" />
                  {l}
                </a>
              </li>
            ))}
          </ul>
        )}
        {r.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {r.attachments.map((a) => (
              <li key={a.id}>
                <Button size="sm" variant="ghost" icon={<ExternalLink size={14} aria-hidden="true" />} onClick={() => p.onOpenEvidence(a.path)}>
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
              rows={2}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-base text-fg"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" onClick={() => void p.run(() => p.onDecide(true, comment.trim() || null))}>
                {t('review.approve')}
              </Button>
              <Button size="sm" variant="danger" onClick={() => void p.run(() => p.onDecide(false, comment.trim() || null))}>
                {t('review.requestChanges')}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }
  if (p.writable && canSubmit(p.project, p.task, p.me)) {
    return (
      <div>
        <Button variant="primary" onClick={() => p.onMode('review')}>
          {t('review.open')}
        </Button>
      </div>
    );
  }
  return null;
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

function HistoryList({ history }: { history: TaskHistory }) {
  return (
    <div className="flex flex-col gap-2">
      <Heading level={3}>{t('history.title')}</Heading>
      <ol aria-label={t('history.title')} className="flex flex-col gap-1">
        {history.events.map((e, i) => {
          const details = e.details as { from?: string; to?: string; comment?: string };
          const statusChange = e.kind === 'status_changed' && details.from && details.to;
          return (
            <li key={i} className="text-sm text-fg">
              <span className="text-fg-muted tabular-nums">{when(e.createdAt)}</span> · {e.actorName ?? t('common.noName')} ·{' '}
              {KIND_KEY[e.kind] ? t(KIND_KEY[e.kind]!) : e.kind}
              {statusChange && ` (${STATUS_LABEL[details.from as Task['status']] ?? details.from} → ${STATUS_LABEL[details.to as Task['status']] ?? details.to})`}
              {details.comment && <span className="text-fg-muted"> — «{details.comment}»</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
