import { cx } from '@/lib/cx';

export interface ProgressBarProps {
  /** Valor entre 0 y 1 */
  value: number;
  label: string;
  /** Clase de color de relleno (token). Por defecto, el acento. */
  fill?: string;
}

export function ProgressBar({ value, label, fill = 'bg-accent' }: ProgressBarProps) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-sunken"
    >
      <div className={cx('h-full rounded-full', fill)} style={{ width: `${percent}%` }} />
    </div>
  );
}
