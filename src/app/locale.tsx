import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Bridge } from '@/bridge/contract';
import { getLocale, setLocale, type Locale } from '@/i18n';

interface LocaleValue {
  locale: Locale;
  /** Cambia el idioma de toda la app y lo guarda en los ajustes locales (Rust lo usa en las notificaciones). */
  change: (locale: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleValue>({ locale: 'es', change: async () => {} });
export const useLocale = () => useContext(LocaleContext);

/**
 * Idioma activo (ADR-0015). Lo lee de los ajustes locales al abrir y, al cambiarlo, vuelve a montar la app
 * (`key`) para que todo texto se pinte en el idioma nuevo: los textos se leen con `t()` al pintar.
 */
export function LocaleProvider({ bridge, children }: { bridge: Bridge; children: ReactNode }) {
  const [locale, set] = useState<Locale>(getLocale());
  useEffect(() => {
    let alive = true;
    bridge
      .settingsGet()
      .then((s) => {
        if (alive && s.language !== getLocale()) {
          setLocale(s.language);
          set(s.language);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bridge]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const change = async (next: Locale) => {
    await bridge.settingsSet({ language: next });
    setLocale(next);
    set(next);
  };
  return (
    <LocaleContext.Provider value={{ locale, change }}>
      <div key={locale} className="contents">
        {children}
      </div>
    </LocaleContext.Provider>
  );
}
