/**
 * Solo para pruebas: monta una página con sesión, nube simulada, puente simulado y rutas.
 * Cada prueba recibe su propio QueryClient (sin caché compartida ni reintentos).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import type { Bridge } from '@/bridge/contract';
import { createMockBridge } from '@/bridge/mock';
import { createMockCloud, type MockCloud } from '@/cloud/mock';
import { SyncEngine } from '@/sync/engine';
import { SessionProvider } from './session';

function Where() {
  return <p data-testid="ruta">{useLocation().pathname + useLocation().search}</p>;
}

export function renderWithSession(
  page: ReactElement,
  {
    path = '/',
    route = '*',
    cloud = createMockCloud(),
    bridge = createMockBridge(),
  }: { path?: string; route?: string; cloud?: MockCloud; bridge?: Bridge } = {},
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const engine = new SyncEngine({ bridge, cloud, setTimer: () => () => {} });
  const result = render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider cloud={cloud} bridge={bridge} engine={engine}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path={route} element={page} />
          </Routes>
          <Where />
        </MemoryRouter>
      </SessionProvider>
    </QueryClientProvider>,
  );
  return { ...result, cloud, bridge, engine };
}
