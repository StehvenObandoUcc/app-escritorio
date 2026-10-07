import { describe, expect, it } from 'vitest';
import type { ActivityBlock, Category } from '@/bridge/contract';
import { aiToolTotals, appTotals, buildTimeline, domainTotals, groupConsecutive } from './activity';
import { appColor, cleanTitle, displayAppName } from './apps';
import { formatShortDuration } from './time';

let n = 0;
/** Bloque de prueba: minutos desde las 10:00 UTC. */
function block(
  app: string,
  from: number,
  to: number,
  category: Category = 'neutral',
  title: string | null = null,
  aiTool: string | null = null,
  domain: string | null = null,
): ActivityBlock {
  const at = (m: number) => new Date(Date.UTC(2026, 9, 6, 10, 0, 0) + m * 60_000).toISOString();
  n += 1;
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`, startedAt: at(from), endedAt: at(to), appName: app, title, category, aiTool, domain };
}

const total = (xs: { seconds: number }[]) => xs.reduce((s, x) => s + x.seconds, 0);

describe('agrupar la actividad', () => {
  it('une bloques seguidos de la misma app y categoría, y guarda sus títulos', () => {
    const blocks = [block('brave', 0, 2, 'neutral', 'S3'), block('brave', 2, 5, 'neutral', 'IAM'), block('code', 5, 9, 'productive')];
    const segments = groupConsecutive(blocks);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ appName: 'brave', seconds: 300, titles: ['S3', 'IAM'] });
    expect(total(segments)).toBe(9 * 60);
  });

  it('no une si cambia la categoría (p. ej. Brave con IA y Brave neutro)', () => {
    const segments = groupConsecutive([block('brave', 0, 2), block('brave', 2, 3, 'ai', 'Claude', 'Claude')]);
    expect(segments).toHaveLength(2);
  });

  it('junta las rachas de cambios cortos en una fila y conserva el total', () => {
    const blocks = [
      block('code', 0, 10, 'productive'),
      block('pulso', 10, 10.3),
      block('App oculta', 10.3, 10.6),
      block('pulso', 10.6, 10.9),
      block('brave', 10.9, 20),
      block('explorer', 20, 20.2),
    ];
    const rows = buildTimeline(blocks);
    expect(rows.map((r) => r.kind)).toEqual(['segment', 'quick', 'segment', 'segment']);
    const quick = rows[1]!;
    expect(quick.kind === 'quick' && quick.segments).toHaveLength(3);
    // El tramo corto aislado del final se ve tal cual.
    expect(rows[3]!.kind === 'segment' && rows[3]!.segment.appName).toBe('explorer');
    const sum = rows.reduce((s, r) => s + (r.kind === 'quick' ? r.seconds : r.segment.seconds), 0);
    expect(sum).toBe(total(groupConsecutive(blocks)));
  });

  it('el resumen por app suma por app, ordena de más a menos y deja fuera inactividad y pausas', () => {
    const totals = appTotals([
      block('brave', 0, 10),
      block('brave', 10, 14, 'ai', 'Claude', 'Claude'),
      block('code', 14, 20, 'productive'),
      block('Sin actividad', 20, 50, 'idle'),
      block('Pulso', 50, 55, 'paused'),
    ]);
    expect(totals.map((t) => t.appName)).toEqual(['brave', 'code']);
    expect(totals[0]).toMatchObject({ seconds: 14 * 60, mainCategory: 'neutral', aiTools: ['Claude'], byCategory: { neutral: 600, ai: 240 } });
  });
});

describe('tiempo por sitio (ADR-0009)', () => {
  it('suma por dominio y deja fuera lo que no es un sitio web', () => {
    const totals = domainTotals([
      block('brave', 0, 5, 'ai', 'Buscar', 'Perplexity', 'perplexity.ai'),
      block('chrome', 5, 7, 'ai', 'Otra', 'Perplexity', 'perplexity.ai'),
      block('brave', 7, 8, 'distraction', 'Video', null, 'youtube.com'),
      block('code', 8, 20, 'productive'),
    ]);
    expect(totals.map((t) => [t.appName, t.seconds])).toEqual([
      ['perplexity.ai', 420],
      ['youtube.com', 60],
    ]);
  });
});

describe('IA usadas', () => {
  it('suma el tiempo por herramienta de IA, de más a menos', () => {
    expect(
      aiToolTotals([
        block('brave', 0, 2, 'ai', 'Claude', 'Claude'),
        block('brave', 2, 7, 'ai', 'Perplexity', 'Perplexity'),
        block('chrome', 7, 9, 'ai', 'Claude', 'Claude'),
        block('code', 9, 20, 'productive'),
      ]),
    ).toEqual([
      { tool: 'Perplexity', seconds: 300 },
      { tool: 'Claude', seconds: 240 },
    ]);
  });
});

describe('nombres y duraciones legibles', () => {
  it('traduce nombres de proceso y deja los desconocidos con mayúscula inicial', () => {
    expect(displayAppName('brave')).toBe('Brave');
    expect(displayAppName('WhatsApp.Root')).toBe('WhatsApp');
    expect(displayAppName('explorer')).toBe('Explorador de archivos');
    expect(displayAppName('miapp')).toBe('Miapp');
    expect(displayAppName('App oculta')).toBe('App oculta');
  });

  it('limpia el sufijo del navegador y descarta títulos que repiten la app', () => {
    expect(cleanTitle('Roles | IAM | Global - Brave', 'brave')).toBe('Roles | IAM | Global');
    expect(cleanTitle('Pulso', 'pulso')).toBeNull();
    expect(cleanTitle(null, 'brave')).toBeNull();
  });

  it('cada app tiene un color de la paleta, el mismo siempre; las ocultas, gris neutro', () => {
    expect(appColor('brave')).toMatch(/^bg-app-[1-8]$/);
    expect(appColor('brave')).toBe(appColor('Brave'));
    expect(new Set(['brave', 'code', 'explorer', 'WhatsApp.Root', 'pulso', 'firefox'].map(appColor)).size).toBeGreaterThan(2);
    expect(appColor('App oculta')).toBe('bg-cat-neutral');
  });

  it('las duraciones cortas se dicen en segundos en vez de «0 min»', () => {
    expect(formatShortDuration(0)).toBe('0 s');
    expect(formatShortDuration(45)).toBe('45 s');
    expect(formatShortDuration(59.6)).toBe('1 min');
    expect(formatShortDuration(125)).toBe('2 min');
    expect(formatShortDuration(3725)).toBe('1 h 02 min');
  });
});
