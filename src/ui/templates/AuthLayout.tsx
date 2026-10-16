import { t } from '@/i18n';
import { Activity, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';

const PROMISES = [
  { icon: Activity, key: 'pulse' as const },
  { icon: EyeOff, key: 'private' as const },
  { icon: ShieldCheck, key: 'consent' as const },
  { icon: Sparkles, key: 'ai' as const },
];

/** Latido decorativo: picos altos (foco), bajos (distracción) y línea base (pausa). */
function Heartbeat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 64" fill="none" aria-hidden="true" className={className}>
      <path
        d="M0 40 H40 L52 40 L60 12 L70 56 L78 40 H120 L128 40 L134 28 L140 48 L146 40 H190 L198 40 L208 6 L220 58 L230 40 H272 L278 34 L284 44 L290 40 H320"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Pantalla de acceso, fuera de la app (sin navegación). En ventanas anchas, a la izquierda la
 * marca y lo que promete Pulso; en estrechas, solo la marca arriba del formulario.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  corner,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Arriba a la derecha (p. ej. el botón de tema) */
  corner?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-canvas text-fg">
      <aside className="hidden flex-col justify-between gap-8 border-r border-line bg-accent-soft p-10 lg:flex lg:w-1/2">
        <div className="flex items-center gap-2 text-accent-text">
          <Activity size={26} aria-hidden="true" />
          <span className="font-display text-xl font-semibold tracking-tight text-fg">Pulso</span>
        </div>
        <div className="flex flex-col gap-6">
          <Heartbeat className="w-full max-w-content text-accent" />
          <p className="max-w-prose font-display text-2xl font-semibold tracking-tight text-fg">
            {t('auth.promise')}
          </p>
          <ul className="flex flex-col gap-4">
            {PROMISES.map(({ icon: Icon, key }) => (
              <li key={key} className="flex max-w-prose items-start gap-3 text-fg">
                <Icon size={20} aria-hidden="true" className="mt-1 shrink-0 text-accent-text" />
                <span>{t(`auth.promises.${key}`)}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-fg-muted">{t('auth.dataStays')}</p>
      </aside>

      <main className="relative flex flex-1 items-center justify-center overflow-y-auto p-4 md:p-8">
        {corner && <div className="absolute top-4 right-4">{corner}</div>}
        <div className="flex w-full max-w-auth flex-col gap-6 py-12">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 text-accent-text lg:hidden">
              <Activity size={24} aria-hidden="true" />
              <span className="font-display text-lg font-semibold tracking-tight text-fg">Pulso</span>
            </div>
            <Heartbeat className="w-full text-accent lg:hidden" />
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight text-fg">{title}</h1>
              <p className="mt-1 text-fg-muted">{subtitle}</p>
            </div>
          </div>
          {children}
          {footer}
        </div>
      </main>
    </div>
  );
}
