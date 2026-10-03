import type { Category } from '@/bridge/contract';

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
  productive: { label: 'Productivo', fill: 'bg-cat-productive', height: 'h-full' },
  ai: { label: 'Con IA', fill: 'bg-cat-ai', height: 'h-full' },
  neutral: { label: 'Neutro', fill: 'bg-cat-neutral', height: 'h-3/5' },
  distraction: { label: 'Distracción', fill: 'bg-cat-distraction', height: 'h-2/5' },
  break: { label: 'Descanso', fill: 'bg-cat-break', height: 'h-1/5' },
  idle: { label: 'Sin actividad', fill: 'bg-cat-idle', height: 'h-1' },
  paused: { label: 'En pausa', fill: 'pattern-paused', height: 'h-1/5' },
};

/** Categorías que cuentan como tiempo de trabajo en los totales */
export const WORK_CATEGORIES: Category[] = ['productive', 'ai', 'neutral', 'distraction'];
