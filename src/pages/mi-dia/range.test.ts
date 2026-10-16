import { describe, expect, it } from 'vitest';
import type { TimeByTask } from '@/cloud/contract';
import { cloudPeriod, daysOf, groupByProject, monthOf, rangeOf, rangeTotals, shiftRange, weekOf } from './range';

describe('periodos de Mi semana y Mi mes', () => {
  it('la semana va de lunes a domingo, también si la fecha es domingo o lunes', () => {
    expect(weekOf('2026-10-07')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekOf('2026-10-11')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekOf('2026-10-05')).toEqual({ from: '2026-10-05', to: '2026-10-11' });
    expect(weekOf('2026-11-01')).toEqual({ from: '2026-10-26', to: '2026-11-01' });
  });

  it('el mes va del día 1 al último, con febrero bisiesto y no bisiesto', () => {
    expect(monthOf('2028-02-15')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(monthOf('2027-02-28')).toEqual({ from: '2027-02-01', to: '2027-02-28' });
    expect(monthOf('2026-12-31')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(daysOf(rangeOf('month', '2028-02-10'))).toHaveLength(29);
  });

  it('anterior y siguiente cruzan meses y años', () => {
    expect(shiftRange('week', weekOf('2026-10-07'), -1)).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    expect(shiftRange('week', weekOf('2026-12-30'), 1)).toEqual({ from: '2027-01-04', to: '2027-01-10' });
    expect(shiftRange('month', monthOf('2026-01-10'), -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(shiftRange('month', monthOf('2026-12-10'), 1)).toEqual({ from: '2027-01-01', to: '2027-01-31' });
  });

  it('el periodo de la nube es exclusivo: 00:00 del primer día y 00:00 del día siguiente al último', () => {
    expect(cloudPeriod({ from: '2026-10-05', to: '2026-10-11' }, 'America/Bogota')).toEqual({
      from: '2026-10-05T05:00:00.000Z',
      to: '2026-10-12T05:00:00.000Z',
    });
  });

  it('las 00:00 son las de la zona del perfil, también en un día de cambio de hora', () => {
    // Madrid pasa de CEST (+2) a CET (+1) el 2026-10-25 a las 03:00: el día 26 empieza a las 23:00Z del 25.
    expect(cloudPeriod({ from: '2026-10-24', to: '2026-10-25' }, 'Europe/Madrid')).toEqual({
      from: '2026-10-23T22:00:00.000Z',
      to: '2026-10-25T23:00:00.000Z',
    });
    expect(cloudPeriod({ from: '2026-10-25', to: '2026-10-25' }, 'Europe/Madrid')).toEqual({
      from: '2026-10-24T22:00:00.000Z',
      to: '2026-10-25T23:00:00.000Z',
    });
    expect(cloudPeriod({ from: '2026-10-05', to: '2026-10-05' }, 'UTC')).toEqual({ from: '2026-10-05T00:00:00.000Z', to: '2026-10-06T00:00:00.000Z' });
    // Zona que no existe: se usa la del dispositivo en lugar de fallar.
    expect(() => cloudPeriod({ from: '2026-10-05', to: '2026-10-05' }, 'No/Existe')).not.toThrow();
  });

  it('los totales suman los días; «productivas» incluye la IA solo si el equipo lo pide (D-7)', () => {
    const view = {
      from: '2026-10-05',
      to: '2026-10-06',
      days: [
        { date: '2026-10-05', totals: { productive: 3600, neutral: 600, distraction: 0, ai: 1800, break: 900, idle: 100, paused: 0 } },
        { date: '2026-10-06', totals: { productive: 600, neutral: 0, distraction: 300, ai: 0, break: 0, idle: 0, paused: 0 } },
      ],
    };
    expect(rangeTotals(view, false)).toEqual({ active: 6900, productive: 4200, ai: 1800 });
    expect(rangeTotals(view, true)).toEqual({ active: 6900, productive: 6000, ai: 1800 });
  });
});

describe('groupByProject', () => {
  const row = (over: Partial<TimeByTask>): TimeByTask => ({ projectId: null, projectName: null, taskId: null, taskTitle: null, seconds: 0, ...over });
  it('agrupa por proyecto, ordena y deja «Sin tarea» al final', () => {
    const groups = groupByProject(
      [
        row({ seconds: 9000 }),
        row({ projectId: 'a', projectName: 'Alfa', taskId: 't1', taskTitle: 'Uno', seconds: 600 }),
        row({ projectId: 'b', projectName: 'Beta', taskId: 't2', taskTitle: 'Dos', seconds: 1200 }),
        row({ projectId: 'a', projectName: 'Alfa', taskId: 't3', taskTitle: 'Tres', seconds: 1800 }),
      ],
      'Sin tarea',
    );
    expect(groups.map((g) => [g.projectName, g.seconds])).toEqual([['Alfa', 2400], ['Beta', 1200], [null, 9000]]);
    expect(groups[0]!.tasks.map((x) => x.title)).toEqual(['Tres', 'Uno']);
    expect(groups[2]!.tasks).toEqual([]);
  });
});
