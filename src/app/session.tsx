/**
 * Sesión de la app: persona, perfil, equipos, equipo activo y sincronización.
 *
 * Reglas que se aplican aquí:
 * - El equipo activo solo se comunica a Rust (`active_team_set`) si la persona dio su consentimiento
 *   en ese equipo (PS-02, ADR-0007). Sin consentimiento, lo nuevo queda sin equipo y no se sube.
 * - Si los equipos no se pudieron leer (sin red), no se toca el equipo activo de Rust: el registro
 *   sigue asignándose al último equipo conocido y se sube al volver la red.
 * - El equipo elegido se recuerda en este equipo (localStorage): es una preferencia, no un dato sensible.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Bridge } from '@/bridge/contract';
import type { Cloud, CloudUser, MyTeam, Profile } from '@/cloud/contract';
import { CONSENT_VERSION } from '@/lib/consent';
import { SyncEngine, type SyncState } from '@/sync/engine';

const TEAM_KEY = 'pulso.equipo-activo';
/** Cada cuánto se vuelven a leer las reglas del equipo (sitios no permitidos, etc.). */
export const RULES_REFRESH_MS = 5 * 60_000;

const systemTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Bogota';
  } catch {
    return 'America/Bogota';
  }
};

const readStoredTeam = () => {
  try {
    return localStorage.getItem(TEAM_KEY);
  } catch {
    return null;
  }
};

const storeTeam = (id: string | null) => {
  try {
    if (id) localStorage.setItem(TEAM_KEY, id);
    else localStorage.removeItem(TEAM_KEY);
  } catch {
    // Sin almacenamiento, el equipo elegido simplemente no se recuerda.
  }
};

export interface SessionValue {
  cloud: Cloud;
  bridge: Bridge;
  /** undefined mientras se comprueba si hay sesión */
  user: CloudUser | null | undefined;
  profile: Profile | null;
  teams: MyTeam[];
  teamsLoading: boolean;
  teamsError: string | null;
  activeTeam: MyTeam | null;
  selectTeam: (teamId: string) => void;
  /** Vuelve a leer equipos y perfil (tras crear, aceptar, salir…) */
  refresh: () => Promise<void>;
  sync: SyncState;
  syncNow: () => void;
  /** Dominios que el equipo activo marcó como no permitidos (ADR-0009). */
  notAllowedDomains: string[];
  /** El equipo activo pide aceptar una versión nueva del consentimiento. */
  needsNewConsent: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession necesita <SessionProvider>');
  return value;
}

/** Para piezas que también funcionan sin sesión (p. ej. Ajustes en las pruebas de F1). */
export function useOptionalSession(): SessionValue | null {
  return useContext(SessionContext);
}

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

export function SessionProvider({
  cloud,
  bridge,
  engine: givenEngine,
  children,
}: {
  cloud: Cloud;
  bridge: Bridge;
  engine?: SyncEngine;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const [engine] = useState(() => givenEngine ?? new SyncEngine({ bridge, cloud }));
  const [user, setUser] = useState<CloudUser | null | undefined>(undefined);
  const [chosenTeam, setChosenTeam] = useState<string | null>(readStoredTeam);

  useEffect(() => {
    let alive = true;
    cloud
      .currentUser()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null));
    const stop = cloud.onUserChange((u) => setUser(u));
    return () => {
      alive = false;
      stop();
    };
  }, [cloud]);

  const userId = user?.id ?? null;

  const profileQuery = useQuery({
    queryKey: ['profile', userId],
    queryFn: () => cloud.ensureProfile(systemTimezone()),
    enabled: userId !== null,
  });

  const teamsQuery = useQuery({
    queryKey: ['teams', userId],
    queryFn: () => cloud.myTeams(),
    enabled: userId !== null,
  });

  const teams = useMemo(() => teamsQuery.data ?? [], [teamsQuery.data]);
  const activeTeam = useMemo(() => {
    if (!teams.length) return null;
    return teams.find((t) => t.id === chosenTeam) ?? teams.find((t) => t.consentAt) ?? teams[0] ?? null;
  }, [teams, chosenTeam]);

  // Un consentimiento de una versión anterior no vale: la subida se pausa hasta aceptar la nueva (ADR-0009).
  const consented = activeTeam?.consentAt && activeTeam.consentVersion === CONSENT_VERSION ? activeTeam : null;
  const needsNewConsent = Boolean(activeTeam?.consentAt) && !consented;
  // El observador no registra actividad (docs/ROLES.md fila 10): no se le asigna equipo en Rust ni se sube nada.
  // Lo que registró antes como miembro queda en su equipo de cómputo sin subirse.
  const isViewer = activeTeam?.role === 'viewer';
  const uploading = consented && !isViewer ? consented : null;

  const domainRulesQuery = useQuery({
    queryKey: ['domain-rules', activeTeam?.id],
    queryFn: () => cloud.domainRules(activeTeam!.id),
    enabled: Boolean(activeTeam),
  });
  const notAllowedDomains = useMemo(
    () => (domainRulesQuery.data ?? []).filter((r) => r.notAllowed).map((r) => r.domain),
    [domainRulesQuery.data],
  );
  const profile = profileQuery.data ?? null;

  // Equipo activo en Rust y política del equipo (apps ocultas y avisos, ADR-0009/0010).
  useEffect(() => {
    if (user === undefined) return;
    if (user === null) {
      void bridge.activeTeamSet(null).catch(() => {});
      return;
    }
    if (!teamsQuery.isSuccess) return; // sin red: se conserva el último equipo conocido
    void bridge.activeTeamSet(uploading?.id ?? null).catch(() => {});
    // La política se aplica aunque no haya consentimiento: ocultar o avisar es local.
    void bridge
      .teamPolicySet({
        allowHiddenApps: activeTeam?.allowHiddenApps ?? true,
        alertNotAllowed: activeTeam?.alertNotAllowed ?? true,
        alertRepeatMinutes: activeTeam?.alertRepeatMinutes ?? 10,
      })
      .catch(() => {});
  }, [bridge, user, teamsQuery.isSuccess, uploading?.id, activeTeam?.allowHiddenApps, activeTeam?.alertNotAllowed, activeTeam?.alertRepeatMinutes]);

  // Reglas del equipo para el clasificador: se vuelven a leer cada 5 min y al enfocar la ventana, y se
  // envían a Rust cada vez que cambian. Antes solo se enviaban al arrancar y una regla nueva no llegaba.
  const rulesQuery = useQuery({
    queryKey: ['team-rules', uploading?.id],
    queryFn: () => cloud.teamRules(uploading!.id),
    enabled: Boolean(uploading),
    refetchInterval: RULES_REFRESH_MS,
    refetchOnWindowFocus: true,
  });
  useEffect(() => {
    if (rulesQuery.data) void bridge.rulesSet(rulesQuery.data).catch(() => {});
  }, [bridge, rulesQuery.data]);

  // Contexto del motor de sincronización.
  useEffect(() => {
    if (user && uploading) {
      engine.setContext({
        userId: user.id,
        teamId: uploading.id,
        workday: uploading.workday,
        timezone: profile?.timezone ?? systemTimezone(),
      });
      void engine.syncNow();
    } else if (user === null || (user && teamsQuery.isSuccess && !uploading)) {
      engine.setContext(null);
    }
  }, [engine, user, uploading, profile?.timezone, teamsQuery.isSuccess]);

  useEffect(() => engine.start(), [engine]);

  const engineState = useSyncExternalStore(engine.subscribe, engine.getState);
  const sync = useMemo<SyncState>(
    () =>
      isViewer
        ? { ...engineState, phase: 'off', message: 'Como observador, tu actividad no se comparte con el equipo.' }
        : engineState,
    [engineState, isViewer],
  );

  const selectTeam = useCallback((teamId: string) => {
    storeTeam(teamId);
    setChosenTeam(teamId);
  }, []);

  const refresh = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['teams'] }),
      queryClient.invalidateQueries({ queryKey: ['profile'] }),
    ]);
  }, [queryClient]);

  const value: SessionValue = {
    cloud,
    bridge,
    user,
    profile,
    teams,
    teamsLoading: teamsQuery.isPending && userId !== null,
    teamsError: teamsQuery.error ? describe(teamsQuery.error) : null,
    activeTeam,
    selectTeam,
    refresh,
    sync,
    syncNow: () => void engine.syncNow(),
    notAllowedDomains,
    needsNewConsent,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
