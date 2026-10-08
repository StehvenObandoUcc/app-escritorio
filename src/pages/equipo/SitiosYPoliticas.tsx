import { errorMessage, t } from '@/i18n';
import { LIMITS } from '@/lib/limits';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSession } from '@/app/session';
import { ALERT_REPEATS } from '@/bridge/contract';
import type { MyTeam } from '@/cloud/contract';
import { appColor } from '@/lib/apps';
import { formatShortDuration } from '@/lib/time';
import { Button, Heading, ProgressBar, Select, Surface } from '@/ui/atoms';
import { FormField, SegmentedControl } from '@/ui/molecules';


/** Lo que se escribe como sitio: se acepta una URL y se queda solo el dominio. */
export function toDomain(input: string): string | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;
  const rest = text.includes('://') ? text.split('://')[1]! : text;
  const host = (rest.split(/[/?#]/)[0] ?? '').split('@').pop()!.split(':')[0]!.replace(/^www\./, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

const REPEAT_LABEL = (m: number) => (m === 0 ? t('sites.onEnter') : t('sites.every', { n: m }));

type Range = 'hoy' | 'semana';
const ranges = (): { value: Range; label: string }[] => [
  { value: 'hoy', label: t('sites.today') },
  { value: 'semana', label: t('sites.last7') },
];

/**
 * Sitios y políticas del equipo (ADR-0009), solo para owner y admin:
 * - permitir o no que cada persona oculte apps;
 * - sitios no permitidos (se marcan como distracción, no se bloquean);
 * - tiempo por sitio y persona.
 */
export function SitiosYPoliticas({ team }: { team: MyTeam }) {
  const { cloud, refresh } = useSession();
  const queryClient = useQueryClient();
  const [domain, setDomain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState<Range>('hoy');

  const rules = useQuery({ queryKey: ['domain-rules', team.id], queryFn: () => cloud.domainRules(team.id) });
  const members = useQuery({ queryKey: ['members', team.id], queryFn: () => cloud.members(team.id) });
  const period = useMemo(() => {
    const to = new Date();
    const from = new Date(to);
    if (range === 'hoy') from.setHours(0, 0, 0, 0);
    else from.setDate(from.getDate() - 7);
    return { from: from.toISOString(), to: to.toISOString() };
  }, [range]);
  const usage = useQuery({
    queryKey: ['domain-usage', team.id, range],
    queryFn: () => cloud.teamDomainSummary(team.id, period.from, period.to),
  });

  const [domainError, setDomainError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const d = toDomain(domain);
    if (!d) {
      setDomainError(t('sites.domainError'));
      document.querySelector<HTMLInputElement>('input[name="domain"]')?.focus();
      return;
    }
    setDomainError(null);
    void run(async () => {
      await cloud.addNotAllowedDomain(team.id, d);
      setDomain('');
      // Las reglas se reenvían a Rust al instante (session.tsx), sin esperar al siguiente ciclo.
      await queryClient.invalidateQueries({ queryKey: ['domain-rules'] });
      await queryClient.invalidateQueries({ queryKey: ['team-rules'] });
    });
  };

  const names = new Map((members.data ?? []).map((m) => [m.userId, m.displayName ?? t('common.noName')]));
  const byPerson = useMemo(() => {
    const map = new Map<string, { domain: string; seconds: number }[]>();
    for (const u of usage.data ?? []) {
      const list = map.get(u.userId) ?? [];
      const found = list.find((x) => x.domain === u.domain);
      if (found) found.seconds += u.seconds;
      else list.push({ domain: u.domain, seconds: u.seconds });
      map.set(u.userId, list);
    }
    for (const list of map.values()) list.sort((a, b) => b.seconds - a.seconds);
    return [...map.entries()];
  }, [usage.data]);
  const notAllowed = new Set((rules.data ?? []).filter((r) => r.notAllowed).map((r) => r.domain));

  return (
    <Surface as="section" aria-label={t('sites.title')} className="flex flex-col gap-5">
      <div>
        <Heading level={2}>{t('sites.title')}</Heading>
        <p className="mt-1 text-sm text-fg-muted">{t('sites.hint')}</p>
      </div>

      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 accent-accent"
          checked={team.allowHiddenApps}
          disabled={busy}
          onChange={(e) =>
            void run(async () => {
              await cloud.setTeamPolicy(team.id, e.target.checked);
              await refresh();
            })
          }
        />
        <span>
          <span className="block font-medium text-fg">{t('sites.allowHidden')}</span>
          <span className="block text-sm text-fg-muted">
            {t('sites.allowHiddenHint')}
          </span>
        </span>
      </label>

      <div className="flex flex-col gap-3">
        <Heading level={3}>{t('sites.notAllowed')}</Heading>
        <p className="text-sm text-fg-muted">{t('sites.notAllowedHint')}</p>
        <div className="flex flex-col gap-2 rounded-md bg-sunken p-3">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              className="mt-1 size-4 accent-accent"
              checked={team.alertNotAllowed}
              disabled={busy}
              onChange={(e) =>
                void run(async () => {
                  await cloud.setAlertPolicy(team.id, e.target.checked, team.alertRepeatMinutes);
                  await refresh();
                })
              }
            />
            <span>
              <span className="block font-medium text-fg">{t('sites.alert')}</span>
              <span className="block text-sm text-fg-muted">{t('sites.alertHint')}</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-2 pl-7">
            <span className="text-sm text-fg">{t('sites.repeatLabel')}</span>
            <Select
              size="sm"
              aria-label={t('sites.repeat')}
              value={String(team.alertRepeatMinutes)}
              disabled={busy || !team.alertNotAllowed}
              onChange={(e) =>
                void run(async () => {
                  await cloud.setAlertPolicy(team.id, team.alertNotAllowed, Number(e.target.value));
                  await refresh();
                })
              }
              options={ALERT_REPEATS.map((m) => ({ value: String(m), label: REPEAT_LABEL(m) }))}
            />
          </div>
        </div>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2" noValidate>
          <div className="min-w-0 flex-1">
            <FormField name="domain" label={t('sites.site')} placeholder="youtube.com" maxLength={LIMITS.links.length} value={domain} error={domainError ?? undefined} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy}>
            {t('sites.mark')}
          </Button>
        </form>
        {(rules.data ?? []).filter((r) => r.notAllowed).length > 0 && (
          <ul className="flex flex-col divide-y divide-line" aria-label={t('sites.notAllowed')}>
            {(rules.data ?? [])
              .filter((r) => r.notAllowed)
              .map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-fg">{r.domain}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    icon={<Trash2 size={16} aria-hidden="true" />}
                    onClick={() =>
                      void run(async () => {
                        await cloud.removeDomainRule(r.id);
                        await queryClient.invalidateQueries({ queryKey: ['domain-rules'] });
                        await queryClient.invalidateQueries({ queryKey: ['team-rules'] });
                      })
                    }
                  >
                    {t('common.remove')}
                  </Button>
                </li>
              ))}
          </ul>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Heading level={3}>{t('sites.usage')}</Heading>
          <SegmentedControl label={t('sites.period')} options={ranges()} value={range} onChange={setRange} />
        </div>
        {usage.isPending ? (
          <p role="status" className="text-fg-muted">
            {t('common.loading')}
          </p>
        ) : usage.error ? (
          <p role="alert" className="text-sm text-danger">
            {errorMessage(usage.error)}
          </p>
        ) : byPerson.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('sites.noUsage')}</p>
        ) : (
          <ul className="flex flex-col gap-4" aria-label={t('sites.usage')}>
            {byPerson.map(([userId, sites]) => (
              <li key={userId} className="flex flex-col gap-2">
                <p className="font-medium text-fg">{names.get(userId) ?? t('common.noName')}</p>
                <ul className="flex flex-col gap-2">
                  {sites.slice(0, 8).map((s) => (
                    <li key={s.domain} className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="min-w-0 flex-1 truncate text-fg">{s.domain}</span>
                        {notAllowed.has(s.domain) && <span className="text-xs font-medium text-danger">{t('activity.notAllowed')}</span>}
                        <span className="text-fg-muted tabular-nums">{formatShortDuration(s.seconds)}</span>
                      </div>
                      <ProgressBar value={sites[0]!.seconds ? s.seconds / sites[0]!.seconds : 0} label={`${s.domain}: ${formatShortDuration(s.seconds)}`} fill={appColor(s.domain)} />
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Surface>
  );
}
