import { Monitor, Moon, Sun } from 'lucide-react';
import { t } from '@/i18n';
import { Button } from '@/ui/atoms';

type Theme = 'system' | 'light' | 'dark';

const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle({ theme, onCycle }: { theme: Theme; onCycle: () => void }) {
  const Icon = ICON[theme];
  return (
    <Button variant="ghost" size="sm" onClick={onCycle} title={t('theme.change')} icon={<Icon size={16} aria-hidden="true" />}>
      <span className="md:sr-only lg:not-sr-only">{t(`theme.${theme}`)}</span>
    </Button>
  );
}
