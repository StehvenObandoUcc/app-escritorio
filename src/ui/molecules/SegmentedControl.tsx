import { cx } from '@/lib/cx';

export interface Segment<T extends string> {
  value: T;
  label: string;
}

/** Selector de pocas opciones excluyentes (pestañas). Se usa con teclado como un grupo de botones. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Segment<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'h-control-sm rounded-md px-3 text-sm font-medium transition-colors',
            value === o.value ? 'border border-line bg-surface text-fg' : 'text-fg-muted hover:text-fg',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
