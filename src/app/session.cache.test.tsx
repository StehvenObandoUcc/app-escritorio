import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud } from '@/cloud/mock';
import { SyncEngine } from '@/sync/engine';
import { SessionProvider, useSession } from './session';

function Who() {
  const { user } = useSession();
  return <p data-testid="quien">{user === undefined ? '...' : (user?.id ?? 'nadie')}</p>;
}

describe('caché de datos al cambiar de persona', () => {
  it('al cerrar sesión y entrar otra persona, no queda nada de la anterior en la caché', async () => {
    const cloud = createMockCloud();
    const bridge = createMockBridge();
    await cloud.signUp('beto@pulso.test', 'secreto-123', 'Beto');
    await cloud.signOut();
    await cloud.signUp('ana@pulso.test', 'secreto-123', 'Ana');
    const ana = (await cloud.currentUser())!.id;

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider cloud={cloud} bridge={bridge} engine={engine}>
          <Who />
        </SessionProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent(ana));
    queryClient.setQueryData(['reports', 'equipo-a'], ['informe de Ana']);

    await act(() => cloud.signOut());
    await waitFor(() => expect(screen.getByTestId('quien')).toHaveTextContent('nadie'));
    await act(() => cloud.signIn('beto@pulso.test', 'secreto-123'));
    await waitFor(() => expect(screen.getByTestId('quien')).not.toHaveTextContent('nadie'));

    expect(queryClient.getQueryData(['reports', 'equipo-a'])).toBeUndefined();
  });
});
