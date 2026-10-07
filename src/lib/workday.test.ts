import { describe, expect, it } from 'vitest';
import { isWithinWorkday, localDayAndMinute } from './workday';

const WEEK = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };

describe('jornada del equipo (A-1)', () => {
  it('usa la zona horaria de la persona, no la del equipo de cómputo', () => {
    // Martes 6 de octubre de 2026, 13:30 UTC = 08:30 en Bogotá (UTC-5).
    expect(localDayAndMinute('2026-10-06T13:30:00Z', 'America/Bogota')).toEqual({ day: 2, minute: 8 * 60 + 30 });
    expect(isWithinWorkday('2026-10-06T13:30:00Z', WEEK, 'America/Bogota')).toBe(true);
    // 12:30 UTC = 07:30 en Bogotá: antes de la jornada.
    expect(isWithinWorkday('2026-10-06T12:30:00Z', WEEK, 'America/Bogota')).toBe(false);
  });

  it('el fin de la jornada queda fuera y el fin de semana también', () => {
    expect(isWithinWorkday('2026-10-06T22:59:00Z', WEEK, 'America/Bogota')).toBe(true); // 17:59
    expect(isWithinWorkday('2026-10-06T23:00:00Z', WEEK, 'America/Bogota')).toBe(false); // 18:00
    expect(isWithinWorkday('2026-10-10T15:00:00Z', WEEK, 'America/Bogota')).toBe(false); // sábado
  });

  it('una zona horaria inválida no rompe: usa la del sistema', () => {
    expect(() => isWithinWorkday('2026-10-06T15:00:00Z', WEEK, 'Zona/Inventada')).not.toThrow();
  });
});
