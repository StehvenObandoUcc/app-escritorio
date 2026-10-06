import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartColumn, ListChecks, Settings, Sun, Users } from 'lucide-react';
import { useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { bridge } from '@/bridge';
import { createCloud } from '@/cloud';
import { GaleriaPage } from '@/dev/GaleriaPage';
import { useTheme } from '@/lib/theme';
import { AccesoPage } from '@/pages/acceso/AccesoPage';
import { AjustesPage } from '@/pages/ajustes/AjustesPage';
import { EquipoPage } from '@/pages/equipo/EquipoPage';
import { PrivacidadPage } from '@/pages/equipo/PrivacidadPage';
import { MiDiaPage } from '@/pages/mi-dia/MiDiaPage';
import { PendingPage } from '@/pages/PendingPage';
import { SyncStatus, ThemeToggle } from '@/ui/molecules';
import { AppNav, type NavItem } from '@/ui/organisms';
import { AppShell } from '@/ui/templates';
import { SessionProvider, useSession } from './session';

const NAV: NavItem[] = [
  { to: '/mi-dia', label: 'Mi día', icon: Sun },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/equipo', label: 'Equipo', icon: Users },
  { to: '/reportes', label: 'Reportes', icon: ChartColumn },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

const cloud = createCloud(bridge);

function NavFooter() {
  const { theme, cycle } = useTheme();
  const { sync } = useSession();
  return (
    <div className="flex flex-col items-center gap-3 lg:items-start">
      <SyncStatus phase={sync.phase} message={sync.message} lastSyncedAt={sync.lastSyncedAt} compact />
      <ThemeToggle theme={theme} onCycle={cycle} />
    </div>
  );
}

export function App() {
  // Los datos remotos se vuelven a pedir al enfocar la ventana; sin red, se reintenta poco.
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider cloud={cloud} bridge={bridge}>
        <HashRouter>
          <AppShell nav={<AppNav items={NAV} footer={<NavFooter />} />}>
            <Routes>
              <Route path="/" element={<Navigate to="/mi-dia" replace />} />
              <Route path="/acceso" element={<AccesoPage />} />
              <Route path="/mi-dia" element={<MiDiaPage bridge={bridge} />} />
              <Route
                path="/tareas"
                element={
                  <PendingPage
                    title="Tareas"
                    phase="F3"
                    what="Proyectos, tareas en lista y tablero, y tiempo ligado a cada tarea."
                  />
                }
              />
              <Route path="/equipo" element={<EquipoPage />} />
              <Route path="/equipo/privacidad" element={<PrivacidadPage />} />
              <Route
                path="/reportes"
                element={
                  <PendingPage
                    title="Reportes"
                    phase="F4"
                    what="Resúmenes con IA a partir de cifras calculadas, y exportación a Markdown y PDF."
                  />
                }
              />
              <Route path="/ajustes" element={<AjustesPage bridge={bridge} />} />
              {import.meta.env.DEV && <Route path="/dev/galeria" element={<GaleriaPage />} />}
              <Route path="*" element={<Navigate to="/mi-dia" replace />} />
            </Routes>
          </AppShell>
        </HashRouter>
      </SessionProvider>
    </QueryClientProvider>
  );
}
