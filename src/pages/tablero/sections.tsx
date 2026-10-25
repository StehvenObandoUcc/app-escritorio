import type { ReactNode } from 'react';
import type { DashboardLeadMember, DashboardMember, DashboardTask, DashboardTotals, DashboardDay, Presence } from '@/cloud/contract';
import { t, type TKey } from '@/i18n';
import { AI_USAGES } from '@/lib/categories';
import { formatDuration, formatHour } from '@/lib/time';
import { Badge, Heading, Surface } from '@/ui/atoms';
import { formatHoursShort, HorizontalBarList, ResponsiveTable, StackedBarChart, type HorizontalBarItem } from '@/ui/molecules';

/** Horas (decimales, como llegan del JSON) escritas como duración: 1.5 → «1 h 30 min». Solo formato. */
export const formatHours = (hours: number) => formatDuration(hours * 3600);

const CHART_CATEGORIES = ['productive', 'ai', 'neutral', 'distraction'] as const;
const KNOWN_TOOLS = new Set(['chatgpt', 'claude', 'gemini', 'deepseek', 'copilot', 'ollama', 'lmstudio', 'other']);

export const personName = (name: string | null) => name ?? t('dashboard.noName');

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Surface as="section" aria-label={title} className="flex flex-col gap-3">
      <div>
        <Heading level={2}>{title}</Heading>
        {hint && <p className="mt-1 text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </Surface>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-fg-muted">{label}</dt>
      <dd className="font-display text-xl font-semibold text-fg tabular-nums">{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}

/** Un grupo de cifras con su título: así se leen juntas las que hablan de lo mismo. */
function StatGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface className="flex flex-col gap-4">
      <Heading level={2}>{title}</Heading>
      <dl className="grid grid-cols-2 gap-4 md:grid-cols-3">{children}</dl>
    </Surface>
  );
}

const sessions = (n: number) => t('dashboard.sessions', { n });

export function TotalsSection({ totals }: { totals: DashboardTotals }) {
  return (
    // Dos grupos (tiempo y trabajo) en vez de seis tarjetas iguales que no decían qué va con qué.
    <section aria-label={t('dashboard.totals.title')} className="grid gap-3 lg:grid-cols-2">
      <StatGroup title={t('dashboard.totals.time')}>
        <Stat label={t('dashboard.totals.active')} value={formatHours(totals.hoursActive)} />
        <Stat label={t('dashboard.totals.productive')} value={formatHours(totals.hoursProductive)} />
        <Stat label={t('dashboard.totals.ai')} value={formatHours(totals.aiHours)} hint={sessions(totals.aiSessions)} />
      </StatGroup>
      <StatGroup title={t('dashboard.totals.work')}>
        <Stat label={t('dashboard.totals.doing')} value={String(totals.tasksDoing)} />
        <Stat label={t('dashboard.totals.done')} value={String(totals.tasksDone)} />
        <Stat label={t('dashboard.totals.members')} value={String(totals.members)} />
      </StatGroup>
    </section>
  );
}

export function PerDaySection({ perDay, label }: { perDay: DashboardDay[]; label: string }) {
  const data = perDay.map((d) => ({
    label: d.day.slice(8).replace(/^0/, ''),
    segments: CHART_CATEGORIES.map((key) => ({ key, value: d.hoursCategory[key] })),
  }));
  return (
    <Section title={t('dashboard.perDay.title')}>
      <StackedBarChart data={data} unit={t('dashboard.perDay.unit')} formatValue={formatHours} formatShort={formatHoursShort} label={label} />
    </Section>
  );
}

export function AiSection({ totals }: { totals: DashboardTotals }) {
  const tools: HorizontalBarItem[] = Object.entries(totals.aiTool)
    .filter(([, hours]) => hours > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, value]) => ({ key, label: t(`reports.tools.${KNOWN_TOOLS.has(key) ? key : 'other'}` as TKey), value }));
  const usages: HorizontalBarItem[] = [...AI_USAGES, 'untagged' as const]
    .map((key) => ({ key, label: t(`aiUsage.${key}`), value: totals.aiUsage[key] }))
    .filter((i) => i.value > 0);
  return (
    <Section title={t('dashboard.ai.title')}>
      {tools.length === 0 && usages.length === 0 ? (
        <p className="text-fg-muted">{t('dashboard.ai.none')}</p>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Heading level={3}>{t('dashboard.ai.byTool')}</Heading>
            <HorizontalBarList items={tools} label={t('dashboard.ai.byTool')} formatValue={formatHours} fill="bg-cat-ai" />
          </div>
          <div className="flex flex-col gap-2">
            <Heading level={3}>{t('dashboard.ai.byUsage')}</Heading>
            <HorizontalBarList items={usages} label={t('dashboard.ai.byUsage')} formatValue={formatHours} fill="bg-cat-ai" />
          </div>
        </div>
      )}
    </Section>
  );
}

export function PresenceSection({ people }: { people: Presence[] }) {
  return (
    <Section title={t('dashboard.presence.title')} hint={t('dashboard.presence.hint')}>
      {people.length === 0 ? (
        <p className="text-fg-muted">{t('dashboard.presence.empty')}</p>
      ) : (
        <ul aria-label={t('dashboard.presence.title')} className="grid gap-2 md:grid-cols-2">
          {people.map((p) => (
            <li key={p.userId} className="flex items-center gap-3 rounded-md bg-sunken px-3 py-2">
              <span className="min-w-0 flex-1 truncate font-medium text-fg">{personName(p.name)}</span>
              <Badge tone={p.state === 'active' ? 'success' : 'neutral'}>{t(`dashboard.presence.states.${p.state}`)}</Badge>
              {p.since && <span className="shrink-0 text-sm text-fg-muted tabular-nums">{t('dashboard.presence.since', { time: formatHour(p.since) })}</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

function TaskList({ tasks }: { tasks: DashboardTask[] }) {
  if (tasks.length === 0) return <span className="text-fg-muted">{t('dashboard.people.noDoing')}</span>;
  return (
    <ul className="flex flex-col gap-1">
      {tasks.map((task) => (
        <li key={task.id}>{t('dashboard.people.taskIn', { title: task.title, project: task.projectName })}</li>
      ))}
    </ul>
  );
}

export function PeopleSection({ members }: { members: DashboardMember[] }) {
  return (
    <Section title={t('dashboard.people.title')} hint={t('dashboard.people.hint')}>
      {members.length === 0 ? (
        <p className="text-fg-muted">{t('dashboard.people.empty')}</p>
      ) : (
        <ResponsiveTable
          label={t('dashboard.people.title')}
          rows={members}
          rowKey={(m) => m.userId}
          columns={[
            {
              key: 'name',
              header: t('dashboard.people.name'),
              render: (m) => (
                <span className="flex flex-wrap items-center gap-2">
                  {personName(m.name)}
                  {!m.shareAppNames && <Badge>{t('dashboard.people.onlyCategories')}</Badge>}
                </span>
              ),
            },
            { key: 'active', header: t('dashboard.people.active'), render: (m) => formatHours(m.hoursActive) },
            { key: 'productive', header: t('dashboard.people.productive'), render: (m) => formatHours(m.hoursProductive) },
            {
              key: 'ai',
              header: t('dashboard.people.ai'),
              render: (m) => (
                <>
                  {formatHours(m.aiHours)}
                  <span className="block text-xs text-fg-muted">{sessions(m.aiSessions)}</span>
                </>
              ),
            },
            {
              key: 'capacity',
              header: t('dashboard.people.capacity'),
              render: (m) => (
                <>
                  {m.capacityShare === null ? '—' : t('dashboard.people.share', { n: m.capacityShare })}
                  <span className="block text-xs text-fg-muted">{t('dashboard.people.capacityOf', { hours: formatHours(m.capacityHours) })}</span>
                </>
              ),
            },
            { key: 'doing', header: t('dashboard.people.doing'), render: (m) => <TaskList tasks={m.tasksDoing} /> },
          ]}
        />
      )}
    </Section>
  );
}

export function AppsSection({ apps }: { apps: { appName: string; hours: number }[] }) {
  return (
    <Section title={t('dashboard.apps.title')}>
      {apps.length === 0 ? (
        <p className="text-fg-muted">{t('dashboard.apps.empty')}</p>
      ) : (
        <HorizontalBarList items={apps.map((a) => ({ key: a.appName, label: a.appName, value: a.hours }))} label={t('dashboard.apps.title')} formatValue={formatHours} />
      )}
    </Section>
  );
}

export function LeadSection({ members }: { members: DashboardLeadMember[] }) {
  return (
    <Section title={t('dashboard.lead.title')} hint={t('dashboard.lead.hint')}>
      <ResponsiveTable
        label={t('dashboard.lead.title')}
        rows={members}
        rowKey={(m) => m.userId}
        columns={[
          { key: 'name', header: t('dashboard.lead.name'), render: (m) => personName(m.name) },
          { key: 'hours', header: t('dashboard.lead.projectHours'), render: (m) => formatHours(m.projectHours) },
          { key: 'ai', header: t('dashboard.lead.aiHours'), render: (m) => formatHours(m.aiHoursInProjects) },
          { key: 'doing', header: t('dashboard.lead.doing'), render: (m) => <TaskList tasks={m.tasksDoing} /> },
        ]}
      />
    </Section>
  );
}
