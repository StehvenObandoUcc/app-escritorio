import { useEffect, useState, type FormEvent } from 'react';
import { IDLE_MINUTES_MAX, IDLE_MINUTES_MIN, type Bridge, type Settings } from '@/bridge/contract';
import { Badge, Button, Heading, Surface } from '@/ui/atoms';
import { EmptyState, FormField } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';
import { PerfilSection } from './PerfilSection';

const splitApps = (text: string) =>
  text
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Ajustes locales de este equipo: umbral de inactividad y apps ocultas (F1). */
export function AjustesPage({ bridge }: { bridge: Bridge }) {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [minutes, setMinutes] = useState('');
  const [apps, setApps] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    bridge
      .settingsGet()
      .then((s) => {
        if (cancelled) return;
        setSaved(s);
        setMinutes(String(s.idleMinutes));
        setApps(s.hiddenApps.join(', '));
      })
      .catch((cause: unknown) => {
        if (!cancelled) setLoadError(describe(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [bridge]);

  const sampleTag = bridge.source === 'mock' && <Badge tone="accent">Datos de ejemplo</Badge>;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const n = Number(minutes);
    if (!Number.isInteger(n) || n < IDLE_MINUTES_MIN || n > IDLE_MINUTES_MAX) {
      setFormError(`Escribe un número entero de minutos entre ${IDLE_MINUTES_MIN} y ${IDLE_MINUTES_MAX}.`);
      return;
    }
    setFormError(null);
    try {
      const next = await bridge.settingsSet({ idleMinutes: n, hiddenApps: splitApps(apps) });
      setSaved(next);
      setMinutes(String(next.idleMinutes));
      setApps(next.hiddenApps.join(', '));
      setNotice('Cambios guardados.');
    } catch (cause) {
      setFormError(describe(cause));
    }
  };

  return (
    <PageLayout title="Ajustes" subtitle="Cuenta y seguimiento en este equipo" actions={sampleTag}>
      <PerfilSection />
      {loadError ? (
        <EmptyState
          title="No se pudieron leer los ajustes"
          description={`El núcleo respondió con un error: ${loadError}. Cierra y vuelve a abrir Pulso.`}
        />
      ) : saved === null ? (
        <p className="text-fg-muted" role="status">
          Cargando ajustes…
        </p>
      ) : (
        <Surface as="section" aria-label="Seguimiento">
          <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
            <Heading level={2}>Seguimiento</Heading>
            <FormField
              label="Minutos de inactividad"
              type="number"
              inputMode="numeric"
              min={IDLE_MINUTES_MIN}
              max={IDLE_MINUTES_MAX}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              hint={`Entre ${IDLE_MINUTES_MIN} y ${IDLE_MINUTES_MAX}. Sin teclado ni ratón durante ese tiempo, el bloque se cierra en tu última acción y empieza uno sin actividad.`}
            />
            <FormField
              label="Apps ocultas"
              value={apps}
              onChange={(e) => setApps(e.target.value)}
              placeholder="keepass, whatsapp"
              hint="Nombres de programa separados por comas. Pulso las registra como «App oculta» y sin título."
            />
            {formError && (
              <p role="alert" className="text-sm text-danger">
                {formError}
              </p>
            )}
            {notice && (
              <p role="status" className="text-sm text-fg-muted">
                {notice}
              </p>
            )}
            <div>
              <Button type="submit" variant="primary">
                Guardar cambios
              </Button>
            </div>
          </form>
        </Surface>
      )}
      <EmptyState
        title="Más ajustes llegan después"
        description="Proveedor de IA (F4), reglas y jornada del equipo, y avisos (F5)."
      />
    </PageLayout>
  );
}
