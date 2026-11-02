import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import { AiSection } from './AiSection';

describe('IA: lo que leen otras pantallas', () => {
  it('guardar y quitar la configuración invalida la copia que usa Reportes', async () => {
    const bridge = createMockBridge();
    const queryClient = new QueryClient();
    queryClient.setQueryData(['ai-config'], { baseUrl: null, model: null, hasKey: false });
    const stale = () => queryClient.getQueryState(['ai-config'])!.isInvalidated;
    render(
      <QueryClientProvider client={queryClient}>
        <AiSection bridge={bridge} />
      </QueryClientProvider>,
    );
    await userEvent.type(await screen.findByLabelText(/^Modelo/), 'modelo-x');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(stale()).toBe(true));

    queryClient.setQueryData(['ai-config'], { baseUrl: 'x', model: 'modelo-x', hasKey: false });
    expect(stale()).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'Borrar configuración' }));
    await waitFor(() => expect(stale()).toBe(true));
  });
});
