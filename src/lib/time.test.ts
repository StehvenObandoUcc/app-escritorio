import { describe, expect, it } from 'vitest';
import {
  formatClock,
  formatDuration,
  formatHour,
  localDate,
  localDateTimeToIso,
  minutesOfDay,
} from './time';

describe('formatDuration', () => {
  it('muestra solo minutos por debajo de una hora', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(540)).toBe('9 min');
  });
  it('muestra horas y minutos con dos dígitos', () => {
    expect(formatDuration(3725)).toBe('1 h 02 min');
    expect(formatDuration(7200)).toBe('2 h 00 min');
  });
  it('nunca devuelve valores negativos', () => {
    expect(formatDuration(-50)).toBe('0 min');
  });
});

describe('formatClock', () => {
  it('formatea HH:MM:SS', () => {
    expect(formatClock(0)).toBe('00:00:00');
    expect(formatClock(3725)).toBe('01:02:05');
    expect(formatClock(5048.7)).toBe('01:24:08');
  });
});

describe('fechas locales', () => {
  it('lee hora y minutos locales', () => {
    const iso = new Date('2026-10-01T08:12:00').toISOString();
    expect(formatHour(iso)).toBe('08:12');
    expect(minutesOfDay(iso)).toBe(8 * 60 + 12);
  });
  it('devuelve el día local AAAA-MM-DD', () => {
    expect(localDate(new Date('2026-10-01T23:30:00'))).toBe('2026-10-01');
  });
});

describe('localDateTimeToIso', () => {
  it('interpreta día y hora como hora local y devuelve un instante ISO', () => {
    const iso = localDateTimeToIso('2026-10-01', '09:30');
    expect(iso).toMatch(/Z$/);
    expect(formatHour(iso)).toBe('09:30');
    expect(localDate(new Date(iso))).toBe('2026-10-01');
  });
  it('lanza si la fecha no es válida', () => {
    expect(() => localDateTimeToIso('', '09:30')).toThrow(RangeError);
  });
});
