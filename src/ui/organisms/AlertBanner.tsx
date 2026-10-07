import { ShieldAlert, X } from 'lucide-react';
import { formatHour } from '@/lib/time';
import { Button } from '@/ui/atoms';

export interface BannerAlert {
  domain: string;
  /** Hora del aviso (ISO) */
  at: string;
}

/**
 * Avisos de sitio no permitido, visibles en cualquier pantalla de la app (ADR-0012). Quedan hasta que
 * la persona los cierra, para verlos al volver desde el navegador. Se dice con texto e icono, no solo con color.
 */
export function AlertBanner({ alerts, onDismiss }: { alerts: BannerAlert[]; onDismiss: (domain: string) => void }) {
  if (alerts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 md:left-auto md:w-full md:max-w-auth">
      {alerts.map((a) => (
        <div
          key={a.domain}
          role="alert"
          className="pointer-events-auto flex items-start gap-3 rounded-lg border border-danger bg-surface p-3 shadow-overlay"
        >
          <ShieldAlert size={20} aria-hidden="true" className="mt-1 shrink-0 text-danger" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-fg">Sitio no permitido: {a.domain}</p>
            <p className="text-sm text-fg-muted">
              Entraste a las {formatHour(a.at)}. Tu equipo lo marcó como no permitido: Pulso no lo bloquea y el tiempo cuenta como distracción.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onDismiss(a.domain)} icon={<X size={16} aria-hidden="true" />}>
            Entendido
          </Button>
        </div>
      ))}
    </div>
  );
}
