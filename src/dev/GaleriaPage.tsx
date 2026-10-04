import { Play } from 'lucide-react';
import type { ReactNode } from 'react';
import { CATEGORIES } from '@/bridge/contract';
import { sampleDay } from '@/bridge/mock';
import { CATEGORY_STYLE } from '@/lib/categories';
import { Avatar, Badge, Button, CategoryMark, Heading, Input, ProgressBar, Surface } from '@/ui/atoms';
import { CategoryBreakdown, EmptyState, FormField, TimerControl } from '@/ui/molecules';
import { ActivityList, PulseStrip } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';

const SWATCHES = [
  ['canvas', 'bg-canvas'],
  ['surface', 'bg-surface'],
  ['sunken', 'bg-sunken'],
  ['line-strong', 'bg-line-strong'],
  ['fg-muted', 'bg-fg-muted'],
  ['fg', 'bg-fg'],
  ['accent', 'bg-accent'],
  ['accent-soft', 'bg-accent-soft'],
  ['danger', 'bg-danger'],
] as const;

const noop = () => {};

/**
 * Galería de componentes (solo desarrollo): #/dev/galeria
 * Regla: todo átomo, molécula y organismo nuevo se agrega aquí con sus variantes.
 */
export function GaleriaPage() {
  const day = sampleDay('2026-10-01');
  return (
    <PageLayout
      title="Galería"
      subtitle="Todos los componentes de Pulso en un solo lugar. Cambia el ancho de la ventana y el tema para revisarlos."
    >
      <Section title="Tokens de color">
        <div className="flex flex-wrap gap-3">
          {SWATCHES.map(([name, cls]) => (
            <div key={name} className="flex flex-col gap-1 text-xs text-fg-muted">
              <span className={`size-12 rounded-md border border-line ${cls}`} />
              {name}
            </div>
          ))}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {CATEGORIES.map((c) => (
            <li key={c} className="flex items-center gap-2">
              <CategoryMark category={c} />
              {CATEGORY_STYLE[c].label}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Tipografía">
        <p className="font-display text-display font-semibold tracking-tight tabular-nums">01:24:08</p>
        <Heading level={1}>Título de página</Heading>
        <Heading level={2}>Título de sección</Heading>
        <Heading level={3}>Título de grupo</Heading>
        <p>Texto base de 15 px para la lectura cómoda en una app de escritorio.</p>
        <p className="text-sm text-fg-muted">Texto de apoyo de 13 px.</p>
      </Section>

      <Section title="Átomos">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<Play size={16} aria-hidden="true" />}>
            Iniciar temporizador
          </Button>
          <Button>Guardar cambios</Button>
          <Button variant="ghost">Cancelar</Button>
          <Button variant="danger">Eliminar tarea</Button>
          <Button size="sm">Pequeño</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>Pendiente</Badge>
          <Badge tone="accent">ChatGPT</Badge>
          <Badge tone="danger">Vencida</Badge>
          <Avatar name="Stehven Obando" />
          <Avatar name="Laura" />
        </div>
        <div className="max-w-80">
          <Input placeholder="Buscar tareas" aria-label="Buscar tareas" />
        </div>
        <div className="max-w-80">
          <ProgressBar value={0.62} label="Avance del proyecto" />
        </div>
      </Section>

      <Section title="Moléculas">
        <div className="max-w-80">
          <FormField label="Correo" type="email" placeholder="tu@correo.com" hint="Lo usarás para iniciar sesión." />
        </div>
        <div className="max-w-80">
          <FormField
            label="Contraseña"
            type="password"
            defaultValue="123"
            error="Usa al menos 8 caracteres."
          />
        </div>
        <TimerControl
          running
          elapsedSeconds={5048}
          state="tracking"
          onStart={noop}
          onStop={noop}
          onBreakToggle={noop}
          onPauseToggle={noop}
        />
        <div className="max-w-96">
          <CategoryBreakdown
            totals={day.totals}
            categories={['productive', 'ai', 'neutral', 'distraction', 'break']}
          />
        </div>
        <EmptyState
          title="No tienes tareas asignadas"
          description="Cuando alguien te asigne una tarea, aparecerá aquí."
          action={<Button variant="primary">Crear tarea</Button>}
        />
      </Section>

      <Section title="Organismos">
        <PulseStrip blocks={day.blocks} summary="Franja de pulso de ejemplo" />
        <Surface padding="flush">
          <ActivityList blocks={day.blocks.slice(0, 4)} />
        </Surface>
      </Section>
    </PageLayout>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Surface as="section" className="flex flex-col gap-4">
      <Heading level={2}>{title}</Heading>
      {children}
    </Surface>
  );
}
