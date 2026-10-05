import { ChartColumn, ListChecks, Settings, Sun, Users } from 'lucide-react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { bridge } from '@/bridge';
import { GaleriaPage } from '@/dev/GaleriaPage';
import { useTheme } from '@/lib/theme';
import { MiDiaPage } from '@/pages/mi-dia/MiDiaPage';
import { PendingPage } from '@/pages/PendingPage';
import { ThemeToggle } from '@/ui/molecules';
import { AppNav, type NavItem } from '@/ui/organisms';
import { AppShell } from '@/ui/templates';

const NAV: NavItem[] = [
  { to: '/mi-dia', label: 'Mi día', icon: Sun },
  { to: '/tareas', label: 'Tareas', icon: ListChecks },
  { to: '/equipo', label: 'Equipo', icon: Users },
  { to: '/reportes', label: 'Reportes', icon: ChartColumn },
  { to: '/ajustes', label: 'Ajustes', icon: Settings },
];

export function App() {
  const { theme, cycle } = useTheme();
  return (
    <HashRouter>
      <AppShell nav={<AppNav items={NAV} footer={<ThemeToggle theme={theme} onCycle={cycle} />} />}>
        <Routes>
          <Route path="/" element={<Navigate to="/mi-dia" replace />} />
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
          <Route
            path="/equipo"
            element={
              <PendingPage
                title="Equipo"
                phase="F2"
                what="Crear equipo, invitar personas y asignar roles. El tablero del equipo llega en F5."
              />
            }
          />
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
          <Route
            path="/ajustes"
            element={
              <PendingPage
                title="Ajustes"
                phase="F2"
                what="Perfil, privacidad, proveedor de IA y preferencias de notificación."
              />
            }
          />
          {import.meta.env.DEV && <Route path="/dev/galeria" element={<GaleriaPage />} />}
          <Route path="*" element={<Navigate to="/mi-dia" replace />} />
        </Routes>
      </AppShell>
    </HashRouter>
  );
}
