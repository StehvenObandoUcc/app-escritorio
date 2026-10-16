/**
 * Periodos del tablero (D-1): hoy, esta semana, este mes, la semana pasada y el mes pasado.
 * Los límites son las 00:00 locales y `to` es exclusivo. Se reutilizan las cuentas de fechas de Mi semana/Mi mes.
 */
import { addDays, cloudPeriod, monthOf, weekOf, type DateRange } from '../mi-dia/range';

export const TABLERO_PERIODS = ['today', 'this_week', 'this_month', 'last_week', 'last_month'] as const;
export type TableroPeriod = (typeof TABLERO_PERIODS)[number];

/** Días (AAAA-MM-DD, ambos incluidos) del periodo respecto a `today`. */
export function periodRange(period: TableroPeriod, today: string): DateRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'this_week':
      return weekOf(today);
    case 'this_month':
      return monthOf(today);
    case 'last_week':
      return weekOf(addDays(today, -7));
    case 'last_month':
      return monthOf(addDays(monthOf(today).from, -1));
  }
}

/** Instantes `[from, to)` para `team_dashboard`, con las 00:00 en la zona horaria del perfil. */
export const dashboardPeriod = (period: TableroPeriod, today: string, timeZone: string) => cloudPeriod(periodRange(period, today), timeZone);
