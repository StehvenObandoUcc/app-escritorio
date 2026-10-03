import type { Category } from '@/bridge/contract';
import { CATEGORY_STYLE } from '@/lib/categories';
import { formatDuration } from '@/lib/time';
import { CategoryMark, ProgressBar } from '@/ui/atoms';

export interface CategoryBreakdownProps {
  /** Segundos por categoría */
  totals: Record<Category, number>;
  /** Categorías a mostrar, en orden */
  categories: Category[];
}

/** Reparto del tiempo por categoría: nombre, duración y proporción. */
export function CategoryBreakdown({ totals, categories }: CategoryBreakdownProps) {
  const sum = categories.reduce((acc, c) => acc + totals[c], 0);
  return (
    <ul className="flex flex-col gap-3">
      {categories.map((category) => {
        const style = CATEGORY_STYLE[category];
        return (
          <li key={category} className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm">
              <CategoryMark category={category} />
              <span className="text-fg">{style.label}</span>
              <span className="ml-auto text-fg-muted tabular-nums">
                {formatDuration(totals[category])}
              </span>
            </div>
            <ProgressBar
              label={style.label}
              value={sum === 0 ? 0 : totals[category] / sum}
              fill={style.fill}
            />
          </li>
        );
      })}
    </ul>
  );
}
