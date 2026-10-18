import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSession } from '@/app/session';
import { RULE_CATEGORIES, normalizeProcessPattern, type MyTeam, type ProcessRule, type RuleCategory } from '@/cloud/contract';
import { errorMessage, t } from '@/i18n';
import { CATEGORY_STYLE } from '@/lib/categories';
import { LIMITS } from '@/lib/limits';
import { useAction } from '@/app/useAction';
import { Button, Heading, Select, Surface } from '@/ui/atoms';
import { ConfirmDialog, FormField } from '@/ui/molecules';

/**
 * Reglas por app (TA-11, F5 D-13), solo para owner y admin: elegir una app de `installedApps()` o escribir el
 * nombre del proceso, elegir categoría y guardar. Aplica solo a lo que se registre desde ahora.
 */
export function ReglasPorApp({ team }: { team: MyTeam }) {
  const { cloud, bridge } = useSession();
  const queryClient = useQueryClient();
  const action = useAction();
  const [pattern, setPattern] = useState('');
  const [category, setCategory] = useState<RuleCategory>('distraction');
  const [patternError, setPatternError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<ProcessRule | null>(null);

  const rules = useQuery({ queryKey: ['process-rules', team.id], queryFn: () => cloud.processRules(team.id) });
  // Si Rust no puede listar las apps, queda el texto libre.
  const apps = useQuery({ queryKey: ['installed-apps'], queryFn: () => bridge.installedApps(), retry: false, staleTime: 60_000 });
  // Una misma app puede venir abierta e instalada: se ofrece una sola vez por proceso.
  const installed = [...new Map((apps.data ?? []).map((a) => [a.process, a])).values()];
  const normalized = normalizeProcessPattern(pattern);

  /** Las reglas se reenvían a Rust al instante: `session.tsx` vuelve a llamar a `rulesSet` con la consulta `team-rules`. */
  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['process-rules'] });
    await queryClient.invalidateQueries({ queryKey: ['team-rules'] });
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!normalized) {
      setPatternError(t('rules.processError'));
      document.querySelector<HTMLInputElement>('input[name="process"]')?.focus();
      return;
    }
    setPatternError(null);
    void action.run(async () => {
      await cloud.addProcessRule(team.id, pattern, category);
      setPattern('');
      await reload();
    });
  };

  return (
    <Surface as="section" aria-label={t('rules.title')} className="flex flex-col gap-4">
      <div>
        <Heading level={2}>{t('rules.title')}</Heading>
        <p className="mt-1 text-sm text-fg-muted">{t('rules.hint')}</p>
      </div>

      <form onSubmit={add} className="flex flex-col gap-3" noValidate>
        {installed.length > 0 && (
          <div className="flex flex-col gap-1">
            <label htmlFor="rules-installed" className="text-sm font-medium text-fg">
              {t('rules.installed')}
            </label>
            <Select
              id="rules-installed"
              value=""
              onChange={(e) => {
                if (!e.target.value) return;
                setPattern(e.target.value);
                setPatternError(null);
              }}
              options={[{ value: '', label: t('rules.pick') }, ...installed.map((a) => ({ value: a.process, label: a.label }))]}
            />
          </div>
        )}
        {apps.isError && <p className="text-sm text-fg-muted">{t('rules.installedError')}</p>}
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <FormField
              name="process"
              label={t('rules.process')}
              hint={normalized ? t('rules.willSave', { pattern: normalized }) : t('rules.processHint')}
              maxLength={LIMITS.processPattern.max}
              autoComplete="off"
              value={pattern}
              error={patternError ?? undefined}
              onChange={(e) => setPattern(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="rules-category" className="text-sm font-medium text-fg">
              {t('rules.category')}
            </label>
            <Select
              id="rules-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as RuleCategory)}
              options={RULE_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_STYLE[c].label }))}
            />
          </div>
        </div>
        {action.error && !removing && (
          <p role="alert" className="text-sm text-danger">
            {action.error}
          </p>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={action.busy}>
            {t('rules.add')}
          </Button>
        </div>
      </form>

      {rules.isPending ? (
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      ) : rules.error ? (
        <p role="alert" className="text-sm text-danger">
          {t('rules.loadError', { error: errorMessage(rules.error) })}
        </p>
      ) : (rules.data ?? []).length === 0 ? (
        <p className="text-sm text-fg-muted">{t('rules.empty')}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line" aria-label={t('rules.list')}>
          {(rules.data ?? []).map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1 truncate text-fg">{r.pattern}</span>
              <span className="text-sm text-fg-muted">{CATEGORY_STYLE[r.category].label}</span>
              <Button size="sm" variant="ghost" disabled={action.busy} icon={<Trash2 size={16} aria-hidden="true" />} onClick={() => setRemoving(r)}>
                {t('common.remove')}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={t('rules.removeTitle')}
        message={removing ? t('rules.removeQuestion', { pattern: removing.pattern }) : ''}
        confirmLabel={t('rules.removeConfirm')}
        danger
        busy={action.busy}
        error={removing ? action.error : null}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          void action.run(async () => {
            if (!removing) return;
            await cloud.removeDomainRule(removing.id);
            setRemoving(null);
            await reload();
          })
        }
      />
    </Surface>
  );
}
