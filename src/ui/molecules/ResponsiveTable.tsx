import type { ReactNode } from 'react';

export interface ResponsiveTableColumn<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
}

export interface ResponsiveTableProps<T> {
  /** Nombre accesible de la tabla. */
  label: string;
  rows: T[];
  rowKey: (row: T) => string;
  /** La primera columna es el encabezado de cada fila (la persona). */
  columns: ResponsiveTableColumn<T>[];
}

/**
 * Tabla que en ancho estrecho (< 640 px, el punto `md:` = 40rem) se dibuja como una tarjeta por fila, con el nombre de cada columna
 * delante del valor. Es una sola estructura en el DOM: lector de pantalla y teclado ven siempre la misma tabla.
 * Los roles ARIA son explícitos porque cambiar el `display` de una tabla hace que algunos navegadores pierdan su semántica.
 */
export function ResponsiveTable<T>({ label, rows, rowKey, columns }: ResponsiveTableProps<T>) {
  const [first, ...rest] = columns;
  if (!first) return null;
  return (
    <table role="table" aria-label={label} className="block w-full border-collapse text-left md:table">
      {/* En estrecho la cabecera es un bloque `sr-only` (recortado de verdad: en `display: table-*` el recorte no aplica); desde `md:` vuelve a ser cabecera de tabla. */}
      <thead role="rowgroup" className="sr-only block md:not-sr-only md:table-header-group">
        <tr role="row" className="block md:table-row">
          <th role="columnheader" scope="col" className="px-3 py-2 text-sm font-medium text-fg-muted">
            {first.header}
          </th>
          {rest.map((c) => (
            <th key={c.key} role="columnheader" scope="col" className="px-3 py-2 text-sm font-medium text-fg-muted">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody role="rowgroup" className="flex flex-col gap-3 md:table-row-group">
        {rows.map((row) => (
          <tr key={rowKey(row)} role="row" className="flex flex-col gap-1 rounded-md border border-line p-3 md:table-row md:rounded-none md:border-0 md:border-t md:p-0">
            <th role="rowheader" scope="row" className="text-left font-medium text-fg md:px-3 md:py-3 md:align-top">
              {first.render(row)}
            </th>
            {rest.map((c) => (
              <td key={c.key} role="cell" className="flex items-baseline justify-between gap-3 text-sm text-fg md:table-cell md:px-3 md:py-3 md:align-top">
                <span aria-hidden="true" className="text-fg-muted md:hidden">
                  {c.header}
                </span>
                <span className="min-w-0 text-right md:text-left">{c.render(row)}</span>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
