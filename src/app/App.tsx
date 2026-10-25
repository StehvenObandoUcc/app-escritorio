import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ChartColumn, FolderKanban, Keyboard, LayoutDashboard, ListChecks, Settings, Sun, Users } from 'lucide-react';
import { useCallback, useState } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router';
import { bridge } from '@/bridge';
import { createCloud } from '@/cloud';
import { GaleriaPage } from '@/dev/GaleriaPage';
import { t } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { AccesoPage } from '@/pages/acceso/AccesoPage';
import { AjustesPage } from '@/pages/ajustes/AjustesPage';
import { EquipoPage } from '@/pages/equipo/EquipoPage';
import { PrivacidadPage } from '@/pages/equipo/PrivacidadPage';
import { MiDiaPage } from '@/pages/mi-dia/MiDiaPage';
import { ReportesPage } from '@/pages/reportes/ReportesPage';
import { TableroPage } from '@/pages/tablero/TableroPage';
import { ProyectoPage } from '@/pages/proyectos/ProyectoPage';
import { TareaPage } from '@/pages/proyectos/TareaPage';
import { ProyectosPage } from '@/pages/proyectos/ProyectosPage';
import { MisTareasPage } from '@/pages/tareas/MisTareasPage';
import { Button, Select } from '@/ui/atoms';
import { KeyboardHelp, RunningTimer, SyncStatus, ThemeToggle } from '@/ui/molecules';
import { AlertBanner, AppNav, TaskNoticeBanner, type NavItem } from '@/ui/organisms';
import { AppShell } from '@/ui/templates';
import { useNotAllowedAlerts } from './alerts';
import { useRunningTimer } from './runningTimer';
import { useTaskNotices } from './taskNotices';
import { HelpContext, useAppKeyboard } from './keyboard';
import { LocaleProvider } from './locale';
import { SessionProvider, useSession } from './session';

export const nav = (): NavItem[] => [
  { to: '/mi-dia', label: t('nav.myDay'), icon: Sun },
  { to: '/tareas', label: t('nav.myTasks'), icon: ListChecks },
  { to: '/proyectos', label: t('nav.projects'), icon: FolderKanban },
  { to: '/equipo', label: t('nav.team'), icon: Users },
  { to: '/tablero', label: t('nav.dashboard'), icon: LayoutDashboard },
  { to: '/reportes', label: t('nav.reports'), icon: ChartColumn },
  { to: '/ajustes', label: t('nav.settings'), icon: Settings },
];

const cloud = createCloud(bridge);

/** Rutas de la navegación en el mismo orden: Alt+1 … Alt+n abre la n-ésima (`nav()` y esta lista deben coincidir). */
export const ROUTES = ['/mi-dia', '/tareas', '/proyectos', '/equipo', '/tablero', '/reportes', '/ajustes'];

/** Pie de la navegación: equipo activo (D1), sincronización, tema y ayuda de teclado (F-13). El idioma va en Ajustes y en el acceso. */
function NavFooter({ onHelp }: { onHelp: () => void }) {
  const { theme, cycle } = useTheme();
  const { sync, teams, activeTeam, selectTeam } = useSession();
  return (
    // En la barra lateral todo alineado a la izquierda; estirados, los botones centraban su texto (Atajos).
    <div className="flex flex-col items-center gap-3 lg:items-start">
      {teams.length > 1 && activeTeam && (
        <div className="hidden lg:block lg:self-stretch">
          <Select
            size="sm"
            aria-label={t('nav.activeTeam')}
            className="w-full"
            value={activeTeam.id}
            onChange={(e) => selectTeam(e.target.value)}
            options={teams.map((x) => ({ value: x.id, label: x.name }))}
          />
        </div>
      )}
      <SyncStatus phase={sync.phase} message={sync.message} lastSyncedAt={sync.lastSyncedAt} compact />
      <ThemeToggle theme={theme} onCycle={cycle} />
      {/* Volvió con F-13 (se quitó en ADR-0021): sin él, los atajos solo se descubrían con «?». */}
      <Button variant="ghost" size="sm" onClick={onHelp} title={t('keyboard.title')} icon={<Keyboard size={16} aria-hidden="true" />}>
        <span className="md:sr-only lg:not-sr-only">{t('keyboard.open')}</span>
      </Button>
    </div>
  );
}

/** Temporizador en marcha en la navegación: se ve y se detiene desde cualquier pantalla. */
function NavTimer() {
  const timer = useRunningTimer();
  if (!timer) return null;
  // Si no se pudo detener, sigue a la vista: el temporizador continúa y se puede reintentar.
  return <RunningTimer elapsedSeconds={timer.elapsedSeconds} taskTitle={timer.taskTitle} href={timer.href} onStop={() => void timer.stop().catch(() => {})} />;
}

/**
 * Sin sesión no se entra a la app: se muestra solo la pantalla de acceso, sin navegación.
 * El sensor de Rust sigue registrando en el equipo; nada se sube sin sesión ni consentimiento.
 */
function Gate() {
  const { user } = useSession();
  const { alerts, dismiss } = useNotAllowedAlerts(bridge);
  const taskNotices = useTaskNotices();
  const [help, setHelp] = useState(false);
  const openHelp = useCallback(() => setHelp(true), []);
  useAppKeyboard(ROUTES, openHelp);
  if (user === undefined) {
    return (
      <div className="flex h-dvh items-center justify-center bg-canvas">
        <p role="status" className="text-fg-muted">
          {t('app.opening')}
        </p>
      </div>
    );
  }
  if (user === null) return <AccesoPage />;
  return (
    <HelpContext.Provider value={openHelp}>
      <AppShell nav={<AppNav items={nav()} timer={<NavTimer />} footer={<NavFooter onHelp={openHelp} />} />}>
        <AlertBanner alerts={alerts} onDismiss={dismiss} />
        <TaskNoticeBanner notices={taskNotices.notices} onDismiss={taskNotices.dismiss} />
        <KeyboardHelp open={help} onClose={() => setHelp(false)} sectionCount={ROUTES.length} />
        <Routes>
          <Route path="/" element={<Navigate to="/mi-dia" replace />} />
          <Route path="/mi-dia" element={<MiDiaPage bridge={bridge} />} />
          <Route path="/tareas" element={<MisTareasPage />} />
          <Route path="/proyectos" element={<ProyectosPage />} />
          <Route path="/proyectos/:id" element={<ProyectoPage />} />
          <Route path="/proyectos/:id/tareas/:tarea" element={<TareaPage />} />
          <Route path="/equipo" element={<EquipoPage />} />
          <Route path="/equipo/privacidad" element={<PrivacidadPage />} />
          <Route path="/tablero" element={<TableroPage />} />
          <Route path="/reportes" element={<ReportesPage />} />
          <Route path="/ajustes" element={<AjustesPage bridge={bridge} />} />
          {import.meta.env.DEV && <Route path="/dev/galeria" element={<GaleriaPage />} />}
          <Route path="*" element={<Navigate to="/mi-dia" replace />} />
        </Routes>
      </AppShell>
    </HelpContext.Provider>
  );
}

export function App() {
  // Los datos remotos se vuelven a pedir al enfocar la ventana; sin red, se reintenta poco.
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 30_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider cloud={cloud} bridge={bridge}>
        <LocaleProvider bridge={bridge}>
          <HashRouter>
            <Gate />
          </HashRouter>
        </LocaleProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
