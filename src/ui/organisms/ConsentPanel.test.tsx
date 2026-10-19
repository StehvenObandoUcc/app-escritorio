import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { CONSENT_POINTS } from '@/lib/consent';
import { ConsentPanel } from './ConsentPanel';

describe('ConsentPanel (F-18)', () => {
  it('resume en tres líneas, deja el texto íntegro plegado y explica por qué el botón está desactivado', async () => {
    const { container } = render(<ConsentPanel teamName="Equipo A" acceptLabel="Aceptar y empezar" onAccept={() => {}} />);
    const summary = screen.getByRole('region', { name: 'Resumen' });
    expect(within(summary).getAllByRole('listitem').map((li) => li.textContent?.split(':')[0])).toEqual(['Se mide', 'Nunca', 'Lo ve']);

    // El detalle sigue completo, con los seis puntos, pero empieza plegado.
    const details = container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    for (const p of CONSENT_POINTS) expect(within(details).getByText(p.text)).toBeInTheDocument();

    const accept = screen.getByRole('button', { name: 'Aceptar y empezar' });
    expect(accept).toBeDisabled();
    expect(accept).toHaveAccessibleDescription('Marca la casilla para continuar.');
    await userEvent.click(screen.getByRole('checkbox'));
    expect(accept).toBeEnabled();
    expect(accept).not.toHaveAccessibleDescription();
    expect(screen.queryByText('Marca la casilla para continuar.')).not.toBeInTheDocument();
  });
});
