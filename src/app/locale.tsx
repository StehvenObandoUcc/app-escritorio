import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Bridge } from '@/bridge/contract';
import { getLocale, isLocale, setLocale, t, type Locale } from '@/i18n';

interface LocaleValue {
  locale: Locale;
  /** Cambia el idioma de toda la app y lo guarda en los ajustes locales (Rust lo usa en las notificaciones). */
  change: (locale: Locale) => Promise<void>;
}

const LocaleContext = createContext<LocaleValue>({ locale: 'es', change: async () => {} });
export const useLocale = () => useContext(LocaleContext);

/** Marca de que el idioma ya se eligió en este equipo (a mano o tomado del sistema la primera vez). */
const CHOSEN_KEY = 'pulso.locale.chosen';

/**
 * Primer arranque: Rust siempre devuelve un idioma (español por defecto), así que la primera vez, si lo
 * guardado es ese valor por defecto, se toma el del sistema cuando es uno de los nuestros (F-03). Un idioma
 * distinto del de por defecto ya lo eligió alguien y se respeta. Solo pasa una vez.
 * ponytail: quien eligió «es» a propósito antes de esta versión, con el sistema en inglés, cambia una vez a
 * inglés; distinguirlo exigiría que Rust guarde si el idioma se eligió.
 */
function firstRunLocale(saved: Locale): Locale | null {
  try {
    if (localStorage.getItem(CHOSEN_KEY)) return null;
    localStorage.setItem(CHOSEN_KEY, '1');
  } catch {
    return null;
  }
  const system = navigator.language.slice(0, 2);
  return saved === 'es' && isLocale(system) && system !== saved ? system : null;
}

/**
 * Idioma activo (ADR-0015). Lo lee de los ajustes locales antes de pintar (sin un instante en el idioma
 * equivocado) y, al cambiarlo, vuelve a montar la app (`key`) para que todo texto se pinte en el idioma nuevo:
 * los textos se leen con `t()` al pintar. Tras el cambio, el foco vuelve al selector que se usó y se anuncia
 * el idioma nuevo a los lectores de pantalla (F-08).
 */
export function LocaleProvider({ bridge, children }: { bridge: Bridge; children: ReactNode }) {
  const [locale, set] = useState<Locale>(getLocale());
  const [ready, setReady] = useState(false);
  const [announce, setAnnounce] = useState('');
  const refocus = useRef<string | null>(null);
  useEffect(() => {
    let alive = true;
    bridge
      .settingsGet()
      .then((s) => {
        if (!alive) return;
        const first = firstRunLocale(s.language);
        if (first) bridge.settingsSet({ language: first }).catch(() => {});
        const next = first ?? s.language;
        if (next !== getLocale()) {
          setLocale(next);
          set(next);
        }
      })
      .catch(() => {})
      .finally(() => alive && setReady(true));
    return () => {
      alive = false;
    };
  }, [bridge]);
  useEffect(() => {
    document.documentElement.lang = locale;
    if (refocus.current) document.getElementById(refocus.current)?.focus();
    refocus.current = null;
  }, [locale]);
  const change = async (next: Locale) => {
    await bridge.settingsSet({ language: next });
    try {
      localStorage.setItem(CHOSEN_KEY, '1');
    } catch {
      // Sin almacenamiento solo se pierde la marca; el idioma ya quedó guardado en los ajustes.
    }
    refocus.current = document.activeElement?.id || null;
    setLocale(next);
    set(next);
    setAnnounce(t('locale.changed', { name: t(`settings.languages.${next}`) }));
  };
  return (
    <LocaleContext.Provider value={{ locale, change }}>
      <p role="status" className="sr-only">
        {announce}
      </p>
      {ready && (
        <div key={locale} className="contents">
          {children}
        </div>
      )}
    </LocaleContext.Provider>
  );
}
