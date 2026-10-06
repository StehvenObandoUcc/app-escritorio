import { Plus } from 'lucide-react';
import { useId, useState } from 'react';
import { Button, Input } from '@/ui/atoms';

export interface AppCandidate {
  /** Nombre de proceso en minúsculas (lo que guarda el ajuste) */
  process: string;
  /** Nombre legible */
  label: string;
}

/**
 * Elegir qué apps no registrar (AC-20) marcando casillas, sin tener que saber el nombre del proceso.
 * Las candidatas son las apps usadas hace poco más las que ya están ocultas. Para una app que aún no
 * aparece, queda el campo «Añadir otra app».
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
  const inputId = useId();
  const toggle = (process: string, on: boolean) =>
    onChange(on ? [...selected, process] : selected.filter((p) => p !== process));
  const add = () => {
    const clean = other.trim().toLowerCase();
    if (clean && !selected.includes(clean)) onChange([...selected, clean]);
    setOther('');
  };

  return (
    <fieldset className="flex flex-col gap-3 disabled:opacity-50" disabled={disabled}>
      <legend className="text-sm font-medium text-fg">Apps ocultas</legend>
      <p className="text-sm text-fg-muted">
        Marca las apps que no quieres registrar. Pulso las guarda como «App oculta», sin nombre ni título, desde que las marcas.
      </p>
      {candidates.length === 0 ? (
        <p className="text-sm text-fg-muted">Aún no hay apps registradas en los últimos días. Puedes añadir una abajo.</p>
      ) : (
        <ul className="grid gap-1 md:grid-cols-2" aria-label="Apps para ocultar">
          {candidates.map((c) => {
            const checked = selected.includes(c.process);
            return (
              <li key={c.process}>
                <label className="flex min-h-touch items-center gap-3 rounded-md px-2 hover:bg-sunken md:min-h-control">
                  <input type="checkbox" className="size-4 shrink-0 accent-accent" checked={checked} onChange={(e) => toggle(c.process, e.target.checked)} />
                  <span className="min-w-0 flex-1 truncate text-fg">{c.label}</span>
                  {c.label.toLowerCase() !== c.process && <span className="truncate text-xs text-fg-muted">{c.process}</span>}
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor={inputId} className="text-sm font-medium text-fg">
            Añadir otra app
          </label>
          <Input
            id={inputId}
            value={other}
            placeholder="Nombre del programa, por ejemplo keepass"
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
          Añadir
        </Button>
      </div>
    </fieldset>
  );
}
