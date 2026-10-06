/** Jornada del equipo (A-1): días ISO (1 = lunes … 7 = domingo) y horas locales "HH:MM". */
export interface WorkdayWindow {
  days: number[];
  start: string;
  end: string;
}

const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Día ISO y minuto del día de un instante en una zona horaria. Una zona inválida usa la del sistema. */
export function localDayAndMinute(iso: string, timeZone: string): { day: number; minute: number } {
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  } catch {
    format = new Intl.DateTimeFormat('en-US', { weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  }
  const parts = Object.fromEntries(format.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return {
    day: WEEKDAYS[parts.weekday ?? ''] ?? 0,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const toMinute = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** ¿El instante cae dentro de la jornada, en la zona horaria de la persona? Fin excluido. */
export function isWithinWorkday(iso: string, workday: WorkdayWindow, timeZone: string): boolean {
  const { day, minute } = localDayAndMinute(iso, timeZone);
  return workday.days.includes(day) && minute >= toMinute(workday.start) && minute < toMinute(workday.end);
}
