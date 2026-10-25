import { Ban, Eye, Users } from 'lucide-react';
import { t } from '@/i18n';
import { useId, useState, type ReactNode } from 'react';
import { CONSENT_POINTS, CONSENT_VERSION } from '@/lib/consent';
import { Button, Checkbox, Heading, Surface } from '@/ui/atoms';

const SUMMARY = [
  { key: 'measured', icon: Eye },
  { key: 'never', icon: Ban },
  { key: 'who', icon: Users },
] as const;

/**
 * Consentimiento explícito al unirse a un equipo o al crearlo (PS-02). Sin marcar la casilla,
 * el botón de aceptar no se activa. El texto y su versión viven en `lib/consent.ts`.
 */
export function ConsentPanel({
  teamName,
  acceptLabel,
  onAccept,
  secondary,
  busy = false,
  error,
  children,
}: {
  teamName: string;
  /** Texto del botón, p. ej. «Aceptar y unirme» */
  acceptLabel: string;
  onAccept: () => void;
  /** Acción secundaria (rechazar la invitación, volver) */
  secondary?: ReactNode;
  busy?: boolean;
  error?: string | null;
  /** Campos que van antes de la casilla de aceptación (p. ej. el código de invitación) */
  children?: ReactNode;
}) {
  const [agreed, setAgreed] = useState(false);
  const checkId = useId();
  const reasonId = useId();
  return (
    <Surface as="section" aria-label={t('consentPanel.label', { team: teamName })} className="flex flex-col gap-4">
      <div>
        <Heading level={2}>{t('consentPanel.title', { team: teamName })}</Heading>
        <p className="mt-1 text-sm text-fg-muted">{t('consentPanel.version', { version: CONSENT_VERSION })}</p>
      </div>
      {/* F-18: primero un resumen de tres líneas; el texto íntegro sigue igual, plegado debajo. */}
      <section aria-label={t('consentPanel.summaryLabel')} className="rounded-md bg-sunken p-3">
        {/* Cada punto con su icono y su etiqueta arriba: se recorre de un vistazo. El texto no cambia (va versionado). */}
        <ul className="flex flex-col gap-3 text-sm text-fg">
          {SUMMARY.map(({ key, icon: Icon }) => (
            <li key={key} className="flex gap-3">
              <Icon size={18} aria-hidden="true" className="mt-px shrink-0 text-fg-muted" />
              <div className="max-w-prose">
                <p className="font-semibold">{t(`consentPanel.summary.${key}Label`)}</p>
                <p>{t(`consentPanel.summary.${key}`)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <details>
        <summary className="cursor-pointer rounded-xs text-sm font-medium text-accent-text">{t('consentPanel.details', { n: CONSENT_POINTS.length })}</summary>
        <dl className="mt-3 flex flex-col gap-3">
          {CONSENT_POINTS.map((p) => (
            <div key={p.title}>
              <dt className="font-medium text-fg">{p.title}</dt>
              <dd className="max-w-prose text-fg-muted">{p.text}</dd>
            </div>
          ))}
        </dl>
      </details>
      {children}
      <label htmlFor={checkId} className="flex items-start gap-2 text-fg">
        <Checkbox
          id={checkId}
          className="mt-1"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>{t('consentPanel.agree', { team: teamName })}</span>
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" disabled={!agreed || busy} aria-describedby={agreed ? undefined : reasonId} onClick={onAccept}>
          {acceptLabel}
        </Button>
        {secondary}
      </div>
      {!agreed && (
        <p id={reasonId} className="text-sm text-fg-muted">
          {t('consentPanel.mustAgree')}
        </p>
      )}
    </Surface>
  );
}
