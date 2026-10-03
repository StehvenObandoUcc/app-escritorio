import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@/ui/atoms';

type Theme = 'system' | 'light' | 'dark';

const LABEL: Record<Theme, string> = {
  system: 'Tema del sistema',
  light: 'Tema claro',
  dark: 'Tema oscuro',
};
const ICON = { system: Monitor, light: Sun, dark: Moon } as const;

export function ThemeToggle({ theme, onCycle }: { theme: Theme; onCycle: () => void }) {
  const Icon = ICON[theme];
  return (
    <Button variant="ghost" size="sm" onClick={onCycle} title="Cambiar tema" icon={<Icon size={16} aria-hidden="true" />}>
      <span className="md:sr-only lg:not-sr-only">{LABEL[theme]}</span>
    </Button>
  );
}
