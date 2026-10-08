import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { AiConfig, Bridge } from '@/bridge/contract';
import { errorMessage, t } from '@/i18n';
import { Button, Heading, Select, Surface } from '@/ui/atoms';
import { FormField, PasswordField } from '@/ui/molecules';

/** Proveedores de docs/IA.md §1 (formato OpenAI). El modelo lo escribe la persona: cambian cada pocos meses. */
const PROVIDERS = [
  ['openrouter', 'https://openrouter.ai/api/v1'],
  ['openai', 'https://api.openai.com/v1'],
  ['gemini', 'https://generativelanguage.googleapis.com/v1beta/openai'],
  ['deepseek', 'https://api.deepseek.com'],
  ['groq', 'https://api.groq.com/openai/v1'],
  ['ollama', 'http://localhost:11434/v1'],
  ['other', ''],
] as const;
type Provider = (typeof PROVIDERS)[number][0];
const providerOf = (url: string | null): Provider => PROVIDERS.find(([, u]) => u && u === url)?.[0] ?? (url ? 'other' : 'openrouter');

/** Mensaje mínimo para *Probar conexión* (AC-18). Pide JSON porque algunos proveedores lo exigen en ese modo. */
const PING = [{ role: 'user' as const, content: 'Responde solo con este JSON: {"ok": true}' }];

/** *Ajustes → IA* (RI-06, D-11): proveedor, URL, modelo y clave. La clave nunca vuelve de Rust (AC-19). */
export function AiSection({ bridge }: { bridge: Bridge }) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const load = useCallback(() => bridge.aiConfigGet().then(setConfig), [bridge]);
  useEffect(() => {
    void load().catch(() => setConfig({ baseUrl: null, model: null, hasKey: false }));
  }, [load]);
  if (!config) return null;
  // Los campos se inician con la primera lectura; después solo cambian `hasKey` y si hay configuración.
  return <AiForm bridge={bridge} initial={config} onChanged={load} />;
}

function AiForm({ bridge, initial, onChanged }: { bridge: Bridge; initial: AiConfig; onChanged: () => Promise<void> }) {
  const [provider, setProvider] = useState<Provider>(providerOf(initial.baseUrl));
  const [baseUrl, setBaseUrl] = useState(initial.baseUrl ?? PROVIDERS[0][1]);
  const [model, setModel] = useState(initial.model ?? '');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const act = async (label: string, run: () => Promise<string>) => {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      setNotice(await run());
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(null);
    }
  };
  const refresh = onChanged;

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!baseUrl.trim() || !model.trim()) return setError(t('aiSettings.required'));
    void act(t('aiSettings.save'), async () => {
      await bridge.aiConfigSet(baseUrl, model, key || undefined);
      setKey('');
      await refresh();
      return t('aiSettings.saved');
    });
  };
  const test = () =>
    void act(t('aiSettings.testing'), async () => {
      await bridge.aiChat(PING).catch((cause: unknown) => {
        throw new Error(t('aiSettings.testFailed', { error: errorMessage(cause) }));
      });
      return t('aiSettings.testOk');
    });
  const clear = () =>
    void act(t('aiSettings.clear'), async () => {
      await bridge.aiConfigClear();
      setModel('');
      setKey('');
      await refresh();
      return t('aiSettings.cleared');
    });

  return (
    <Surface as="section" aria-label={t('aiSettings.title')}>
      <form onSubmit={save} className="flex max-w-prose flex-col gap-4" noValidate>
        <div>
          <Heading level={2}>{t('aiSettings.title')}</Heading>
          <p className="mt-1 text-sm text-fg-muted">{t('aiSettings.hint')}</p>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium text-fg">
          {t('aiSettings.provider')}
          <Select
            value={provider}
            onChange={(e) => {
              const next = e.target.value as Provider;
              setProvider(next);
              const url = PROVIDERS.find(([p]) => p === next)?.[1];
              if (url) setBaseUrl(url);
            }}
            options={PROVIDERS.map(([p]) => ({ value: p, label: t(`aiSettings.providers.${p}`) }))}
          />
        </label>
        <FormField name="baseUrl" label={t('aiSettings.baseUrl')} hint={t('aiSettings.baseUrlHint')} value={baseUrl} maxLength={300} onChange={(e) => setBaseUrl(e.target.value)} />
        <FormField name="model" label={t('aiSettings.model')} hint={t('aiSettings.modelHint')} value={model} maxLength={200} onChange={(e) => setModel(e.target.value)} />
        <PasswordField
          name="key"
          label={t('aiSettings.key')}
          hint={initial.hasKey ? t('aiSettings.keySaved') : t('aiSettings.keyHint')}
          value={key}
          maxLength={500}
          autoComplete="off"
          onChange={(e) => setKey(e.target.value)}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-fg-muted">
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={Boolean(busy)}>
            {t('aiSettings.save')}
          </Button>
          <Button onClick={test} disabled={Boolean(busy) || !initial.baseUrl}>
            {busy === t('aiSettings.testing') ? t('aiSettings.testing') : t('aiSettings.test')}
          </Button>
          {(initial.baseUrl || initial.hasKey) && (
            <Button variant="ghost" onClick={clear} disabled={Boolean(busy)}>
              {t('aiSettings.clear')}
            </Button>
          )}
        </div>
      </form>
    </Surface>
  );
}
