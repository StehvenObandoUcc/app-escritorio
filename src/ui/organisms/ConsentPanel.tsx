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
}: {
  teamName: string;
  /** Texto del botón, p. ej. «Aceptar y unirme» */
  acceptLabel: string;
  onAccept: () => void;
  /** Acción secundaria (rechazar la invitación, volver) */
  secondary?: ReactNode;
  busy?: boolean;
  error?: string | null;
}) {
  const [agreed, setAgreed] = useState(false);
  const checkId = useId();
  return (
    <Surface as="section" aria-label={`Consentimiento para ${teamName}`} className="flex flex-col gap-4">
      <div>
        <Heading level={2}>Antes de compartir datos con {teamName}</Heading>
        <p className="mt-1 text-sm text-fg-muted">Versión {CONSENT_VERSION}. Sin tu consentimiento, nada sale de tu equipo.</p>
      </div>
      <dl className="flex flex-col gap-3">
        {CONSENT_POINTS.map((p) => (
          <div key={p.title}>
            <dt className="font-medium text-fg">{p.title}</dt>
            <dd className="max-w-prose text-fg-muted">{p.text}</dd>
          </div>
        ))}
      </dl>
      <label htmlFor={checkId} className="flex items-start gap-2 text-fg">
        <input
          id={checkId}
          type="checkbox"
          className="mt-1 size-4 accent-accent"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>Leí qué se mide y quién lo ve, y acepto compartir estos datos con {teamName}.</span>
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
