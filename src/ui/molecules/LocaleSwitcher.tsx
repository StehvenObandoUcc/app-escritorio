import { LOCALES, t, type Locale } from '@/i18n';
import { Select } from '@/ui/atoms';

/**
 * Selector compacto de idioma para el acceso y el pie del menú (F-03). Cada idioma se nombra en sí mismo
 * («Español», «English») y el nombre accesible lleva los dos idiomas, así se encuentra sin leer el actual.
 */
export function LocaleSwitcher({ id, locale, onChange }: { id: string; locale: Locale; onChange: (locale: Locale) => void }) {
  return (
    <Select
      id={id}
      size="sm"
      aria-label={t('locale.label')}
      title={t('locale.label')}
      value={locale}
      onChange={(e) => onChange(e.target.value as Locale)}
      options={LOCALES.map((l) => ({ value: l, label: t(`settings.languages.${l}`) }))}
    />
  );
}
