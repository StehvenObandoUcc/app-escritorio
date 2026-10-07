import { useLocale } from '@/app/locale';
import { errorMessage, LOCALES, t } from '@/i18n';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { IDLE_MINUTES_MAX, IDLE_MINUTES_MIN, type Bridge, type Settings } from '@/bridge/contract';
import { displayAppName, HIDDEN_APP } from '@/lib/apps';
import { localDate } from '@/lib/time';
import { Badge, Button, Heading, Select, Surface } from '@/ui/atoms';
import { EmptyState, FormField } from '@/ui/molecules';
import { HiddenAppsPicker, type AppCandidate } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { useOptionalSession } from '@/app/session';
import { PerfilSection } from './PerfilSection';

/** Días hacia atrás de los que se sacan las apps candidatas a ocultar. */
const RECENT_DAYS = 7;

/** Apps usadas en los últimos días, de más a menos tiempo. Todo local. */
async function recentApps(bridge: Bridge): Promise<AppCandidate[]> {
  const dates = Array.from({ length: RECENT_DAYS }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - i);
    return localDate(d);
  });
  const days = await Promise.all(dates.map((date) => bridge.dayView(date).catch(() => null)));
  const time = new Map<string, number>();
  const label = new Map<string, string>();
  for (const day of days) {
    for (const b of day?.blocks ?? []) {
      if (b.appName === HIDDEN_APP || b.category === 'idle' || b.category === 'paused' || b.category === 'break') continue;
      const key = b.appName.trim().toLowerCase();
      time.set(key, (time.get(key) ?? 0) + (Date.parse(b.endedAt) - Date.parse(b.startedAt)));
      if (!label.has(key)) label.set(key, displayAppName(b.appName));
    }
  }
  return [...time.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([process]) => ({ process, label: label.get(process) ?? displayAppName(process), group: 'recent' as const }));
}

const describe = errorMessage;

/** Ajustes locales de este equipo: umbral de inactividad y apps ocultas (F1). */
export function AjustesPage({ bridge }: { bridge: Bridge }) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [minutes, setMinutes] = useState('');
  const session = useOptionalSession();
  const teamForbidsHidden = session?.activeTeam ? !session.activeTeam.allowHiddenApps : false;
  const [hidden, setHidden] = useState<string[]>([]);
  const [recent, setRecent] = useState<AppCandidate[]>([]);
  const [installed, setInstalled] = useState<AppCandidate[]>([]);
  const [toastsOff, setToastsOff] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge
      .settingsGet()
      .then((s) => {
        if (cancelled) return;
        setSaved(s);
        setMinutes(String(s.idleMinutes));
        setHidden(s.hiddenApps);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(describe(cause));
      });
    recentApps(bridge)
      .then((apps) => !cancelled && setRecent(apps))
      .catch(() => {});
    // ADR-0011: si Windows tiene las notificaciones apagadas, se explica qué pasará con los avisos.
    bridge
      .notificationsStatus()
      .then((s) => !cancelled && setToastsOff(!s.windowsToastsEnabled))
      .catch(() => {});
    // ADR-0010: apps instaladas y abiertas ahora (registro de Windows y ventanas visibles). Todo local.
    bridge
      .installedApps()
      .then(
        (apps) =>
          !cancelled &&
          setInstalled(apps.map((a) => ({ process: a.process, label: displayAppName(a.label), group: a.source === 'open' ? ('open' as const) : ('installed' as const) }))),
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // Candidatas: las usadas hace poco y, además, las que ya están ocultas (no aparecen con su nombre en los datos).
  const candidates = useMemo<AppCandidate[]>(() => {
    // Una app aparece una sola vez, en el grupo más útil: usada hace poco > abierta > instalada.
    const byProcess = new Map<string, AppCandidate>();
    for (const c of [...recent, ...installed]) if (!byProcess.has(c.process)) byProcess.set(c.process, c);
    for (const process of [...(saved?.hiddenApps ?? []), ...hidden]) {
      if (!byProcess.has(process)) byProcess.set(process, { process, label: displayAppName(process), group: 'installed' });
    }
    return [...byProcess.values()];
  }, [recent, installed, saved, hidden]);

  const sampleTag = bridge.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < IDLE_MINUTES_MIN || n > IDLE_MINUTES_MAX) {
      setFormError(t('settings.idleError', { min: IDLE_MINUTES_MIN, max: IDLE_MINUTES_MAX }));
      return;
    }
    setFormError(null);
    try {
      const next = await bridge.settingsSet({ idleMinutes: n, hiddenApps: hidden });
      setSaved(next);
      setMinutes(String(next.idleMinutes));
      setHidden(next.hiddenApps);
      setNotice(t('common.saved'));
    } catch (cause) {
      setFormError(describe(cause));
    }
  };

  return (
    <PageLayout title={t('nav.settings')} subtitle={t('settings.subtitle')} actions={sampleTag}>
      <PerfilSection />
      <LanguageSection />
      {toastsOff && (
        <p role="note" className="rounded-md bg-sunken p-3 text-sm text-fg">
          {t('settings.toastsOff')}
        </p>
      )}
      {loadError ? (
        <EmptyState
          title={t('settings.loadError')}
          description={t('settings.loadErrorHint', { error: loadError })}
        />
      ) : saved === null ? (
        <p className="text-fg-muted" role="status">
          {t('common.loading')}
        </p>
      ) : (
        <Surface as="section" aria-label={t('settings.tracking')}>
          <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
            <Heading level={2}>{t('settings.tracking')}</Heading>
            <FormField
              label={t('settings.idleMinutes')}
              type="number"
              inputMode="numeric"
              min={IDLE_MINUTES_MIN}
              max={IDLE_MINUTES_MAX}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              hint={t('settings.idleHint', { min: IDLE_MINUTES_MIN, max: IDLE_MINUTES_MAX })}
            />
            {teamForbidsHidden && (
              <p role="note" className="rounded-md bg-sunken p-3 text-sm text-fg">
                {t('settings.hiddenForbidden', { team: session?.activeTeam?.name ?? '' })}
              </p>
            )}
            <HiddenAppsPicker candidates={candidates} selected={hidden} onChange={setHidden} disabled={teamForbidsHidden} />
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-fg-muted">
                {notice}
              </p>
            )}
            <div>
              <Button type="submit" variant="primary">
                {t('common.save')}
              </Button>
            </div>
          </form>
        </Surface>
      )}
      <EmptyState
        title={t('settings.moreLater')}
        description={t('settings.moreLaterHint')}
      />
    </PageLayout>
  );
}

/** Idioma de la app y de las notificaciones de Windows (ADR-0015). El cambio es inmediato. */
function LanguageSection() {
  const { locale, change } = useLocale();
  const [error, setError] = useState<string | null>(null);
  return (
    <Surface as="section" aria-label={t('settings.language')} className="flex max-w-prose flex-col gap-2">
      <Heading level={2}>{t('settings.language')}</Heading>
      <label className="flex flex-col gap-1 text-sm font-medium text-fg">
        {t('settings.languageLabel')}
        <Select
          value={locale}
          onChange={(e) => {
            setError(null);
            change(e.target.value as (typeof LOCALES)[number]).catch((cause: unknown) => setError(errorMessage(cause)));
          }}
          options={LOCALES.map((l) => ({ value: l, label: t(`settings.languages.${l}`) }))}
        />
      </label>
      <p className="text-sm text-fg-muted">{t('settings.languageHint')}</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Surface>
  );
}
