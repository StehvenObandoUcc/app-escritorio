import type { Category } from '@/bridge/contract';
import { CATEGORY_STYLE } from '@/lib/categories';
import { cx } from '@/lib/cx';

/** Marca de color de una categoría. Siempre va acompañada de su nombre en texto. */
export function CategoryMark({ category }: { category: Category }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block size-3 shrink-0 rounded-xs', CATEGORY_STYLE[category].fill)}
    />
  );
}
