import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { TaskForm } from './TaskForm';

const renderForm = () =>
  render(<TaskForm people={[{ value: 'u1', label: 'Ana' }]} manage isNew submitLabel="Crear tarea" onSubmit={async () => {}} onCancel={() => {}} />);

describe('TaskForm (Lote 4)', () => {
  it('el asterisco se explica y el título es obligatorio también para el lector de pantalla (F-17)', () => {
    renderForm();
    expect(screen.getByText('Los campos con * son obligatorios.')).toBeInTheDocument();
    expect(screen.getByLabelText('Título *')).toBeRequired();
  });

  it('el texto de ayuda o error de un área de texto queda asociado al campo (A-04)', () => {
    renderForm();
    expect(screen.getByLabelText('Criterios de aceptación')).toHaveAccessibleDescription(
      'Uno por línea. Hay que marcarlos todos para enviar la tarea a revisión.',
    );
  });

  it('«Evidencia requerida» empieza plegada y cuenta lo marcado (F-17)', async () => {
    const { container } = renderForm();
    const summary = container.querySelector('summary')!;
    expect(summary).toHaveTextContent('Evidencia requerida');
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(summary).toHaveTextContent('(0 seleccionadas)');
    await userEvent.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    await userEvent.click(screen.getAllByRole('checkbox').at(-1)!);
    expect(summary).toHaveTextContent('(1 seleccionada)');
  });

  it('al crear, «Más detalles» empieza plegado; un error ahí lo abre y enfoca el campo (distill)', async () => {
    renderForm();
    const more = screen.getByRole('button', { name: 'Más detalles' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByLabelText('Etiquetas')).not.toBeVisible();
    await userEvent.type(screen.getByLabelText('Título *'), 'Informe');
    fireEvent.change(screen.getByLabelText('Etiquetas'), { target: { value: 'x'.repeat(300) } });
    await userEvent.click(screen.getByRole('button', { name: 'Crear tarea' }));
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Etiquetas')).toHaveFocus();
  });
});
