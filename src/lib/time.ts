/** Utilidades de tiempo. Sin dependencias: fáciles de probar. */
import { formatDate } from '@/i18n';

/** 3725 → "1 h 02 min" · 540 → "9 min" · 0 → "0 min" */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.round(Math.max(0, totalSeconds) / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : `${h} h ${String(m).padStart(2, '0')} min`;
}

/** Como formatDuration, pero lo que dura menos de un minuto se dice en segundos: 45 → "45 s". */
export function formatShortDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return s < 60 ? `${s} s` : formatDuration(s);
}

/** 3725 → "01:02:05" */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const parts = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return parts.map((n) => String(n).padStart(2, '0')).join(':');
}

/** Reloj para poco ancho (riel de navegación): "03:18" bajo una hora, "1h05" desde ahí. */
export function formatCompactClock(totalSeconds: number): string {
  const clock = formatClock(totalSeconds);
  const h = Math.floor(Math.max(0, totalSeconds) / 3600);
  return h === 0 ? clock.slice(3) : `${h}h${clock.slice(3, 5)}`;
}

/** Hora local "08:12" a partir de una fecha ISO */
export function formatHour(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Minutos transcurridos desde la medianoche local */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

/** Día local en formato AAAA-MM-DD */
export function localDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Zona horaria del sistema (IANA), con «UTC» de respaldo; la misma que se guarda en el perfil al crearlo. */
export function systemTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/**
 * Zonas horarias IANA para elegir de una lista (F-16), con `extra` (la guardada y la del sistema) siempre
 * incluidas aunque el motor no las liste (p. ej. «UTC»). Sin `Intl.supportedValuesOf` (motores anteriores a
 * Chromium 99) la lista queda solo con esas.
 */
export function timeZones(...extra: string[]): string[] {
  const all = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return [...new Set([...all, ...extra.filter(Boolean)])].sort();
}

/** Desfase (ms) de `timeZone` en el instante `ms`: hora de pared de esa zona menos el instante, ambos como UTC. */
function zoneOffsetMs(ms: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
  }).formatToParts(new Date(ms));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ms / 1000) * 1000;
}

/**
 * Instante ISO (UTC) de las 00:00 de `date` (AAAA-MM-DD) en la zona horaria IANA dada, solo con `Intl`.
 * Respeta los cambios de hora. Si la zona no es válida, usa la del dispositivo.
 */
export function startOfDayIso(date: string, timeZone: string): string {
  try {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    const wall = Date.UTC(y, m - 1, d);
    let utc = wall - zoneOffsetMs(wall, timeZone);
    utc = wall - zoneOffsetMs(utc, timeZone);
    return new Date(utc).toISOString();
  } catch {
    return localDateTimeToIso(date, '00:00');
  }
}

/** "2026-10-01" → "jueves, 1 de octubre" (o «Thursday, October 1» en inglés) */
export function formatLongDate(date: string): string {
  return formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' });
}

/** Fecha "2026-10-01" y hora local "09:30" → instante ISO (UTC). Lanza RangeError si no son válidas. */
export function localDateTimeToIso(date: string, hhmm: string): string {
  return new Date(`${date}T${hhmm}:00`).toISOString();
}
