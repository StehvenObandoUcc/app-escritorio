import type { Category } from '@/bridge/contract';
import { t } from '@/i18n';

/**
 * Presentación de cada categoría. Único lugar donde una categoría se asocia a
 * un nombre visible, un color (token) y una altura en la franja de pulso.
 * La altura repite la información del color: nada depende solo del color.
 */
export interface CategoryStyle {
  label: string;
  /** Clase de fondo (token semántico) */
  fill: string;
  /** Altura relativa en la franja de pulso */
  height: string;
}

export const CATEGORY_STYLE: Record<Category, CategoryStyle> = {
  productive: { get label() { return t('categories.productive'); }, fill: 'bg-cat-productive', height: 'h-full' },
  ai: { get label() { return t('categories.ai'); }, fill: 'bg-cat-ai', height: 'h-full' },
  neutral: { get label() { return t('categories.neutral'); }, fill: 'bg-cat-neutral', height: 'h-3/5' },
  distraction: { get label() { return t('categories.distraction'); }, fill: 'bg-cat-distraction', height: 'h-2/5' },
  break: { get label() { return t('categories.break'); }, fill: 'bg-cat-break', height: 'h-1/5' },
  idle: { get label() { return t('categories.idle'); }, fill: 'bg-cat-idle', height: 'h-1' },
  paused: { get label() { return t('categories.paused'); }, fill: 'pattern-paused', height: 'h-1/5' },
};

/** Categorías que cuentan como tiempo de trabajo en los totales */
export const WORK_CATEGORIES: Category[] = ['productive', 'ai', 'neutral', 'distraction'];
