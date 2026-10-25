import { Keyboard } from 'lucide-react';
import { useOpenHelp } from '@/app/keyboard';
import { useOptionalSession } from '@/app/session';
import { t } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { Button, Heading, Select, Surface } from '@/ui/atoms';
import { SyncStatus, ThemeToggle } from '@/ui/molecules';

/**
 * Tema, atajos y sincronización (F-09; antes «Cuenta y preferencias», que se confundía con el grupo Cuenta): lo que vive en el pie del menú (equipo activo, sincronización, tema y
 * atajos) también aquí, porque el pie no se ve en ventanas de menos de 640 px. Mismos componentes.
 */
export function PreferenciasSection() {
  const session = useOptionalSession();
  const openHelp = useOpenHelp();
  const { theme, cycle } = useTheme();
  const teams = session?.teams ?? [];
  const active = session?.activeTeam ?? null;
  return (
    <Surface as="section" aria-label={t('settings.preferences')} className="flex flex-col gap-4">
      <Heading level={3} className="text-lg">{t('settings.preferences')}</Heading>
      {session && active && (
        <div className="flex flex-col gap-1">
          {teams.length > 1 ? (
            <label className="flex flex-col gap-1 text-sm font-medium text-fg">
              {t('nav.activeTeam')}
              <Select value={active.id} onChange={(e) => session.selectTeam(e.target.value)} options={teams.map((x) => ({ value: x.id, label: x.name }))} />
            </label>
          ) : (
            <p className="text-sm text-fg">
              <span className="font-medium">{t('nav.activeTeam')}:</span> {active.name}
            </p>
          )}
        </div>
      )}
      {session && <SyncStatus phase={session.sync.phase} message={session.sync.message} lastSyncedAt={session.sync.lastSyncedAt} />}
      <div className="flex flex-wrap items-center gap-2">
        <ThemeToggle theme={theme} onCycle={cycle} />
        {openHelp && (
          <Button variant="ghost" size="sm" onClick={openHelp} title={t('keyboard.title')} icon={<Keyboard size={16} aria-hidden="true" />}>
            {t('keyboard.open')}
          </Button>
        )}
      </div>
    </Surface>
  );
}
