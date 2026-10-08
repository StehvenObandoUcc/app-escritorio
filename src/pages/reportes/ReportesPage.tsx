import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useSession } from '@/app/session';
import { REPORT_MODES, REPORT_PERIODS, TrialError, type ReportFacts, type ReportMode, type ReportPeriod, type ReportRequest, type ReportRun } from '@/cloud/contract';
import { errorMessage, getLocale, t } from '@/i18n';
import { describeError, downloadText, finishManual, generateWithOwnKey, ManualAnswerError, prepareManual, toCsv, toJson, toMarkdown, type ValidationError } from '@/lib/reports';
import { Badge, Button, Heading, Select, Surface } from '@/ui/atoms';
import { EmptyState, Toast } from '@/ui/molecules';
import { ReportHistory, ReportView, type ExportFormat } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { useWork } from '../proyectos/useWork';

const EXTENSION: Record<Exclude<ExportFormat, 'pdf'>, [string, string]> = {
  markdown: ['md', 'text/markdown'],
  json: ['json', 'application/json'],
  csv: ['csv', 'text/csv'],
};

/**
 * Reportes (spec F4): generar (personal, de proyecto o de equipo según el rol, D-1), ver, historial y exportar.
 * Antes de generar «hoy» se suben los datos pendientes (D-18). El `viewer` solo ve los de equipo ya generados.
 */
export function ReportesPage() {
  const { cloud, bridge, user, activeTeam, sync, syncNow } = useSession();
  const queryClient = useQueryClient();
  const teamId = activeTeam?.id ?? null;
  const role = activeTeam?.role ?? null;
  const canGenerate = role !== null && role !== 'viewer';
  const work = useWork(cloud, bridge, canGenerate ? teamId : null, sync.lastSyncedAt);
  const history = useQuery({ queryKey: ['reports', teamId], queryFn: () => cloud.reports(teamId!), enabled: teamId !== null });
  const aiConfig = useQuery({ queryKey: ['ai-config'], queryFn: () => bridge.aiConfigGet() });

  const [about, setAbout] = useState('personal');
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [mode, setMode] = useState<ReportMode>('free');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReportRun | null>(null);
  const [manual, setManual] = useState<{ req: ReportRequest; facts: ReportFacts; prompt: string } | null>(null);
  const [answer, setAnswer] = useState('');
  const [answerErrors, setAnswerErrors] = useState<ValidationError[] | null>(null);

  if (!user) return null;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;
  if (!activeTeam || !teamId) {
    return (
      <PageLayout title={t('reports.title')} actions={sampleTag}>
        <EmptyState title={t('reports.title')} description={t('reports.noTeam')} />
      </PageLayout>
    );
  }

  const projects = work.data?.work.projects ?? [];
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const aboutOptions = [
    { value: 'personal', label: t('reports.scopes.personal') },
    ...projects.filter((p) => !p.archivedAt && p.myRole !== 'contributor').map((p) => ({ value: `project:${p.id}`, label: t('reports.scopes.project', { name: p.name }) })),
    ...(role === 'owner' || role === 'admin' ? [{ value: 'team', label: t('reports.scopes.team', { name: activeTeam.name }) }] : []),
  ];
  const request = (): ReportRequest =>
    about === 'team'
      ? { teamId, scope: 'team', subjectId: teamId, period }
      : about.startsWith('project:')
        ? { teamId, scope: 'project', subjectId: about.slice('project:'.length), period }
        : { teamId, scope: 'personal', subjectId: user.id, period };
  const titleOf = (r: ReportRun) =>
    r.scope === 'team'
      ? t('reports.scopes.team', { name: activeTeam.name })
      : r.scope === 'project'
        ? t('reports.scopes.project', { name: projectName.get(r.subjectId) ?? t('reports.scopeKind.project') })
        : t('reports.scopes.personal');
  const ownKeyReady = Boolean(aiConfig.data?.baseUrl && aiConfig.data.model);
  const language = getLocale();

  const show = (report: ReportRun, cached: boolean) => {
    setSelected(report);
    setManual(null);
    setNotice(cached ? t('reports.cached') : null);
    void queryClient.invalidateQueries({ queryKey: ['reports', teamId] });
  };

  const generate = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setNotice(null);
    setAnswerErrors(null);
    const req = request();
    try {
      if (req.period === 'today') {
        setBusy(t('reports.generate.syncing'));
        await syncNow();
      }
      setBusy(t('reports.generate.busy'));
      if (mode === 'free') {
        const { report, cached } = await cloud.generateFreeReport(req, language);
        show(report, cached);
      } else if (mode === 'own_key') {
        const { report, cached } = await generateWithOwnKey(cloud, bridge, req, language);
        show(report, cached);
      } else {
        const prepared = await prepareManual(cloud, req, language);
        if (prepared.cached) show(prepared.cached, true);
        else {
          setManual({ req, facts: prepared.facts, prompt: prepared.prompt });
          setAnswer('');
        }
      }
    } catch (cause) {
      setError(cause instanceof TrialError && cause.reason in TRIAL_MESSAGE ? TRIAL_MESSAGE[cause.reason]!() : t('reports.failed', { error: errorMessage(cause) }));
    } finally {
      setBusy(null);
    }
  };

  const submitManual = async (e: FormEvent) => {
    e.preventDefault();
    if (!manual || busy) return;
    if (!answer.trim()) return setAnswerErrors([{ code: 'no_json' }]);
    setBusy(t('reports.generate.busy'));
    setError(null);
    try {
      show(await finishManual(cloud, manual.req, manual.facts, answer, language), false);
      setAnswerErrors(null);
    } catch (cause) {
      if (cause instanceof ManualAnswerError) setAnswerErrors(cause.errors);
      else setError(t('reports.failed', { error: errorMessage(cause) }));
    } finally {
      setBusy(null);
    }
  };

  const exportReport = (format: ExportFormat) => {
    if (!selected) return;
    if (format === 'pdf') return window.print();
    const [ext, type] = EXTENSION[format];
    const name = `pulso-${selected.scope}-${selected.periodFrom}.${ext}`;
    const content = format === 'markdown' ? toMarkdown(selected, titleOf(selected)) : format === 'json' ? toJson(selected) : toCsv(selected);
    downloadText(name, content, type);
    setNotice(t('reports.export.saved', { name }));
  };

  return (
    <PageLayout title={t('reports.title')} subtitle={t('reports.subtitle')} actions={sampleTag}>
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 print:hidden">
          {canGenerate ? (
            <Surface as="section" aria-label={t('reports.generate.title')} className="flex flex-col gap-4">
              <Heading level={2}>{t('reports.generate.title')}</Heading>
              <form onSubmit={(e) => void generate(e)} className="flex flex-col gap-3">
                <Labeled label={t('reports.generate.about')}>
                  <Select value={about} onChange={(e) => setAbout(e.target.value)} options={aboutOptions} />
                </Labeled>
                <Labeled label={t('reports.generate.period')}>
                  <Select value={period} onChange={(e) => setPeriod(e.target.value as ReportPeriod)} options={REPORT_PERIODS.map((p) => ({ value: p, label: t(`reports.periods.${p}`) }))} />
                </Labeled>
                <Labeled label={t('reports.generate.mode')}>
                  <Select value={mode} onChange={(e) => setMode(e.target.value as ReportMode)} options={REPORT_MODES.map((m) => ({ value: m, label: t(`reports.modes.${m}`) }))} />
                </Labeled>
                <p className="text-sm text-fg-muted">{t(`reports.modeHint.${mode}`)}</p>
                {mode === 'own_key' && !ownKeyReady && <p className="text-sm text-danger">{t('reports.ownKeyMissing')}</p>}
                <Button type="submit" variant="primary" disabled={Boolean(busy) || (mode === 'own_key' && !ownKeyReady)}>
                  {busy ?? t('reports.generate.submit')}
                </Button>
                {error && (
                  <p role="alert" className="text-sm text-danger">
                    {error}
                  </p>
                )}
              </form>
            </Surface>
          ) : (
            <p className="text-sm text-fg-muted">{t('reports.viewerNote')}</p>
          )}

          <Surface as="section" aria-label={t('reports.history.title')} className="flex flex-col gap-3">
            <Heading level={2}>{t('reports.history.title')}</Heading>
            {history.isError ? (
              <p role="alert" className="text-sm text-danger">
                {errorMessage(history.error)}
              </p>
            ) : history.data ? (
              <ReportHistory reports={history.data} selectedId={selected?.id ?? null} titleOf={titleOf} onOpen={(r) => show(r, false)} />
            ) : (
              <p role="status" className="text-sm text-fg-muted">
                {t('common.loading')}
              </p>
            )}
          </Surface>
        </div>

        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          {manual && (
            <Surface as="section" aria-label={t('reports.manual.title')} className="flex flex-col gap-3 print:hidden">
              <Heading level={2}>{t('reports.manual.title')}</Heading>
              <p className="text-sm text-fg">{t('reports.manual.step1')}</p>
              <textarea
                readOnly
                aria-label={t('reports.manual.prompt')}
                rows={6}
                value={manual.prompt}
                className="w-full rounded-md border border-line-strong bg-sunken px-3 py-2 font-mono text-sm text-fg"
              />
              <div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy size={16} aria-hidden="true" />}
                  onClick={() => void navigator.clipboard.writeText(manual.prompt).then(() => setNotice(t('reports.manual.copied')))}
                >
                  {t('reports.manual.copy')}
                </Button>
              </div>
              <form onSubmit={(e) => void submitManual(e)} className="flex flex-col gap-2">
                <label className="flex flex-col gap-1 text-sm text-fg">
                  {t('reports.manual.step2')}
                  <textarea
                    aria-label={t('reports.manual.answer')}
                    rows={8}
                    value={answer}
                    aria-invalid={answerErrors ? true : undefined}
                    onChange={(e) => setAnswer(e.target.value)}
                    className={`w-full rounded-md border bg-surface px-3 py-2 font-mono text-sm text-fg ${answerErrors ? 'border-danger' : 'border-line-strong'}`}
                  />
                </label>
                {answerErrors && (
                  <div role="alert" className="flex flex-col gap-1 text-sm text-danger">
                    <p>{answer.trim() ? t('reports.manual.invalid') : t('reports.manual.empty')}</p>
                    {answer.trim() && (
                      <ul className="list-disc pl-5">
                        {answerErrors.slice(0, 8).map((err, i) => (
                          <li key={i}>{describeError(err)}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div>
                  <Button type="submit" variant="primary" disabled={Boolean(busy)}>
                    {t('reports.manual.submit')}
                  </Button>
                </div>
              </form>
            </Surface>
          )}
          {selected && (
            <Surface>
              <ReportView report={selected} title={titleOf(selected)} onExport={exportReport} />
            </Surface>
          )}
        </div>
      </div>
      <Toast message={notice} onDone={() => setNotice(null)} />
    </PageLayout>
  );
}

/** Mensajes de los motivos del modo Gratis (docs/IA.md §4). */
const TRIAL_MESSAGE: Partial<Record<TrialError['reason'], () => string>> = {
  cooldown: () => t('reports.trial.cooldown'),
  user_limit: () => t('reports.trial.user_limit'),
  team_limit: () => t('reports.trial.team_limit'),
  global_limit: () => t('reports.trial.global_limit'),
  disabled: () => t('reports.trial.disabled'),
  provider: () => t('reports.trial.provider'),
  changed: () => t('reports.trial.changed'),
};

function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium text-fg">
      {label}
      {children}
    </label>
  );
}
