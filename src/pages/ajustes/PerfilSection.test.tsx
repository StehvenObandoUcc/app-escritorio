import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithSession } from '@/app/testing';
import { createMockCloud } from '@/cloud/mock';
import { systemTimezone } from '@/lib/time';
import { PerfilSection } from './PerfilSection';

describe('Perfil: zona horaria (F-16)', () => {
  it('se elige de una lista; una zona guardada que no existe no se ofrece ni se vuelve a guardar', async () => {
    const cloud = createMockCloud();
    cloud.debug.addAccount('ana@pulso.test', 'secreto-123', 'Ana');
    await cloud.signIn('ana@pulso.test', 'secreto-123');
    await cloud.ensureProfile('UTC');
    await cloud.saveProfile('Ana', 'Marte/Base');
    const save = vi.spyOn(cloud, 'saveProfile');
    renderWithSession(<PerfilSection />, { cloud });

    const zone = await screen.findByLabelText<HTMLSelectElement>('Zona horaria');
    // La zona inexistente no está en la lista; viene marcada la del sistema. (Consultas directas al DOM:
    // con ~420 opciones, las búsquedas por rol de jsdom tardan segundos.)
    const values = [...zone.options].map((o) => o.value);
    expect(values).not.toContain('Marte/Base');
    expect(values.length).toBeGreaterThan(100);
    expect(zone).toHaveValue(systemTimezone());

    fireEvent.change(zone, { target: { value: 'America/Bogota' } });
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(save).toHaveBeenCalledWith('Ana', 'America/Bogota'));
  });
});
