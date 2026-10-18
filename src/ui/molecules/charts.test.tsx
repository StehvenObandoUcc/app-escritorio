import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HorizontalBarList } from './HorizontalBarList';
import { ResponsiveTable } from './ResponsiveTable';
import { formatHoursShort, StackedBarChart } from './StackedBarChart';

const hours = (n: number) => `${n} h`;

describe('StackedBarChart', () => {
  const data = [
    { label: 'lun', segments: [{ key: 'productive' as const, value: 3 }, { key: 'ai' as const, value: 1 }] },
    { label: 'mar', segments: [{ key: 'productive' as const, value: 0 }, { key: 'distraction' as const, value: 2 }] },
  ];

  it('la tabla equivalente tiene los mismos números que las barras (AC-16)', () => {
    render(<StackedBarChart data={data} unit="horas" formatValue={hours} label="Horas por día" />);
    const table = screen.getByRole('table', { name: 'Horas por día (horas)' });
    const header = within(table).getAllByRole('columnheader').map((h) => h.textContent);
    expect(header).toEqual(['Elemento', 'Productivo', 'Con IA', 'Distracción', 'Total']);
    const rows = within(table).getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell').map((c) => c.textContent));
    expect(rows).toEqual([
      ['3 h', '1 h', '0 h', '4 h'],
      ['0 h', '0 h', '2 h', '2 h'],
    ]);
    // El valor de cada barra también está en texto, y es el total de la tabla.
    expect(screen.getByTitle('lun: 4 h')).toBeInTheDocument();
    expect(screen.getByTitle('mar: 2 h')).toBeInTheDocument();
    expect(screen.getAllByText('4 h').length).toBeGreaterThan(1);
  });

  it('la etiqueta sobre la barra usa el formato corto; la tabla y el título, el largo', () => {
    render(<StackedBarChart data={data} unit="horas" formatValue={(n) => `${n} horas`} formatShort={(n) => `${n}h`} label="Horas por día" />);
    expect(screen.getByText('4h')).toBeInTheDocument();
    expect(screen.getByTitle('lun: 4 horas')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByText('4 horas').length).toBeGreaterThan(0);
  });

  it('formatHoursShort: un decimal con la coma del idioma', () => {
    expect(formatHoursShort(5.25)).toMatch(/^5[,.][23] h$/);
    expect(formatHoursShort(6)).toBe('6 h');
  });

  it('la tabla equivalente va en un contenedor sr-only (la tabla sola no se recorta)', () => {
    render(<StackedBarChart data={data} unit="horas" formatValue={hours} label="Horas por día" />);
    const table = screen.getByRole('table', { name: 'Horas por día (horas)' });
    expect(table.className).not.toContain('sr-only');
    expect(table.parentElement?.className).toContain('sr-only');
  });

  it('ResponsiveTable: la cabecera es sr-only en estrecho, con roles y etiqueta visible en cada celda', () => {
    render(<ResponsiveTable label="Personas" rows={[{ id: 'a', n: 'Ana', h: '2 h' }]} rowKey={(r) => r.id} columns={[{ key: 'n', header: 'Persona', render: (r) => r.n }, { key: 'h', header: 'Horas', render: (r) => r.h }]} />);
    const table = screen.getByRole('table', { name: 'Personas' });
    const head = within(table).getAllByRole('rowgroup')[0]!;
    expect(head.className).toMatch(/\bsr-only\b/);
    expect(head.className).toMatch(/\bblock\b/);
    expect(within(table).getByRole('columnheader', { name: 'Horas' })).toBeInTheDocument();
    expect(within(table).getByRole('cell')).toHaveTextContent('Horas2 h');
  });

  it('la leyenda dice las categorías con texto y la gráfica tiene un resumen', () => {
    render(<StackedBarChart data={data} unit="horas" formatValue={hours} label="Horas por día" />);
    const legend = screen.getByRole('list', { name: 'Leyenda' });
    expect(within(legend).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Productivo', 'Con IA', 'Distracción']);
    expect(screen.getByRole('img', { name: /Horas por día\. 2 barras/ })).toBeInTheDocument();
  });

  it('las alturas se miden contra la barra más alta', () => {
    const { container } = render(<StackedBarChart data={data} unit="horas" formatValue={hours} label="Horas por día" />);
    const heights = [...container.querySelectorAll<HTMLElement>('[title] > div')].map((e) => e.style.height);
    expect(heights).toEqual(['85%', '42.5%']);
  });
});

describe('HorizontalBarList', () => {
  it('dice nombre y valor de cada fila en texto, con filas anidadas', () => {
    render(
      <HorizontalBarList
        label="Tiempo por proyecto"
        formatValue={hours}
        items={[
          { key: 'p1', label: 'Pulso', value: 5 },
          { key: 'p1/t1', label: 'Gráficas', value: 3, depth: 1 },
          { key: 'p1/t2', label: 'Pruebas', value: 2, depth: 1 },
          { key: 'none', label: 'Sin tarea', value: 1 },
        ]}
      />,
    );
    const rows = within(screen.getByRole('list', { name: 'Tiempo por proyecto' })).getAllByRole('listitem');
    expect(rows.map((r) => r.textContent)).toEqual(['Pulso5 h', 'Gráficas3 h', 'Pruebas2 h', 'Sin tarea1 h']);
  });

  it('sin filas dice que no hay datos', () => {
    render(<HorizontalBarList label="Vacía" formatValue={hours} items={[]} />);
    expect(screen.getByText('Sin datos')).toBeInTheDocument();
  });
});
