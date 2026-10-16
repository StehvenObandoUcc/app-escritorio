import { t } from '@/i18n';
import { useId, useState, type ReactNode } from 'react';
import { CONSENT_POINTS, CONSENT_VERSION } from '@/lib/consent';
import { Button, Heading, Surface } from '@/ui/atoms';

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
  return (
    <Surface as="section" aria-label={t('consentPanel.label', { team: teamName })} className="flex flex-col gap-4">
      <div>
        <Heading level={2}>{t('consentPanel.title', { team: teamName })}</Heading>
        <p className="mt-1 text-sm text-fg-muted">{t('consentPanel.version', { version: CONSENT_VERSION })}</p>
      </div>
      <dl className="flex flex-col gap-3">
        {CONSENT_POINTS.map((p) => (
          <div key={p.title}>
            <dt className="font-medium text-fg">{p.title}</dt>
            <dd className="max-w-prose text-fg-muted">{p.text}</dd>
          </div>
        ))}
      </dl>
      {children}
      <label htmlFor={checkId} className="flex items-start gap-2 text-fg">
        <input
          id={checkId}
          type="checkbox"
          className="mt-1 size-4 accent-accent"
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
        <Button variant="primary" disabled={!agreed || busy} onClick={onAccept}>
          {acceptLabel}
        </Button>
        {secondary}
      </div>
    </Surface>
  );
}
