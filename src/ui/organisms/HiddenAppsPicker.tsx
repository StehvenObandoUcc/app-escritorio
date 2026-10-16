import { t } from '@/i18n';
import { Plus, Search } from 'lucide-react';
import { useId, useMemo, useState } from 'react';
import { Button, Input } from '@/ui/atoms';

export interface AppCandidate {
  /** Nombre de proceso en minúsculas (lo que guarda el ajuste) */
  process: string;
  /** Nombre legible */
  label: string;
  /** De dónde sale: usada hace poco, abierta ahora o instalada (ADR-0010) */
  group: 'recent' | 'open' | 'installed';
}

const GROUPS: { key: AppCandidate['group'] | 'hidden'; readonly title: string }[] = (['hidden', 'recent', 'open', 'installed'] as const).map((key) => ({
  key,
  get title() {
    return t(`hiddenApps.groups.${key}`);
  },
}));

/**
 * Elegir qué apps no registrar (AC-20) marcando casillas, sin saber el nombre del proceso.
 * Las candidatas son las ocultas, las usadas hace poco, las abiertas y las instaladas, con buscador.
 * Para una app que no aparece queda «Añadir otra app». La lista nunca sale del equipo.
 */
export function HiddenAppsPicker({
  candidates,
  selected,
  onChange,
  disabled = false,
}: {
  candidates: AppCandidate[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** El equipo no permite ocultar apps (ADR-0009) */
  disabled?: boolean;
}) {
  const [other, setOther] = useState('');
  const [query, setQuery] = useState('');
  const inputId = useId();
  const searchId = useId();
  const toggle = (process: string, on: boolean) =>
    onChange(on ? [...selected, process] : selected.filter((p) => p !== process));
  const add = () => {
    const clean = other.trim().toLowerCase();
    if (clean && !selected.includes(clean)) onChange([...selected, clean]);
    setOther('');
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: AppCandidate) => !q || c.label.toLowerCase().includes(q) || c.process.includes(q);
    // Las ocultas van primero y no se repiten en los demás grupos: así se ve de un vistazo qué está oculto.
    const hiddenOnes = candidates.filter((c) => selected.includes(c.process));
    const rest = candidates.filter((c) => !selected.includes(c.process));
    const sort = (list: AppCandidate[]) => [...list].sort((a, b) => a.label.localeCompare(b.label));
    return GROUPS.map((g) => ({
      ...g,
      items: (g.key === 'hidden' ? hiddenOnes : sort(rest.filter((c) => c.group === g.key))).filter(match),
    })).filter((g) => g.items.length > 0);
  }, [candidates, selected, query]);

  return (
    <fieldset className="flex flex-col gap-3 disabled:opacity-50" disabled={disabled}>
      <legend className="text-sm font-medium text-fg">{t('hiddenApps.legend')}</legend>
      <p className="text-sm text-fg-muted">
        {t('hiddenApps.hint')}
      </p>
      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          {t('hiddenApps.search')}
        </label>
        <Search size={16} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
        <Input id={searchId} value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('hiddenApps.search')} className="pl-9" />
      </div>
      {groups.length === 0 ? (
        <p className="text-sm text-fg-muted">
          {query ? t('hiddenApps.noMatch', { query }) : t('hiddenApps.none')}
        </p>
      ) : (
        <div className="flex max-h-96 flex-col gap-4 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col gap-1">
              <p className="text-xs font-medium tracking-wide text-fg-muted uppercase">
                {g.title} · {g.items.length}
              </p>
              <ul className="grid gap-1 md:grid-cols-2" aria-label={g.title}>
                {g.items.map((c) => (
                  <li key={c.process}>
                    <label className="flex min-h-touch items-center gap-3 rounded-md px-2 hover:bg-sunken md:min-h-control">
                      <input
                        type="checkbox"
                        className="size-4 shrink-0 accent-accent"
                        checked={selected.includes(c.process)}
                        onChange={(e) => toggle(c.process, e.target.checked)}
                      />
                      <span className="min-w-0 flex-1 truncate text-fg">{c.label}</span>
                      {c.label.toLowerCase() !== c.process && <span className="truncate text-xs text-fg-muted">{c.process}</span>}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            {t('hiddenApps.addOther')}
          </label>
          <Input
            id={inputId}
            value={other}
            placeholder={t('hiddenApps.addPlaceholder')}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </div>
        <Button onClick={add} disabled={!other.trim()} icon={<Plus size={16} aria-hidden="true" />}>
          {t('hiddenApps.add')}
        </Button>
      </div>
    </fieldset>
  );
}
