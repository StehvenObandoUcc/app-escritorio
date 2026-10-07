import { Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '@/app/session';
import { errorMessage, formatDate, t } from '@/i18n';
import { canCreateProject, isOverdue } from '@/lib/tasks';
import { localDate } from '@/lib/time';
import { Badge, Button, Surface } from '@/ui/atoms';
import { EmptyState, FormField, ProjectCard, SegmentedControl } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';
import { useWork } from './useWork';

type Show = 'active' | 'archived';

/** Proyectos del equipo activo en tarjetas (D-14). Cada tarjeta lleva a `/proyectos/:id`. */
export function ProyectosPage() {
  const { cloud, bridge, user, activeTeam, sync } = useSession();
  const data = useWork(cloud, bridge, activeTeam?.id ?? null, sync.lastSyncedAt);
  const navigate = useNavigate();
  const [show, setShow] = useState<Show>('active');
  const [creating, setCreating] = useState(false);
  if (!user) return null;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;

  const blocked = noTeamState(activeTeam?.role ?? null);
  if (blocked) {
    return (
      <PageLayout title={t('projects.title')} actions={sampleTag}>
        <EmptyState title={blocked.title} description={blocked.description} />
      </PageLayout>
    );
  }

  const work = data.data?.work;
  const offline = data.data?.offline ?? false;
  const today = localDate();
  const projects = (work?.projects ?? []).filter((p) => (show === 'archived') === Boolean(p.archivedAt));
  const overdueOf = (id: string) => (work?.tasks ?? []).filter((x) => x.projectId === id && isOverdue(x, today)).length;
  const canCreate = canCreateProject(activeTeam!.role) && !offline;

  return (
    <PageLayout
      title={t('projects.title')}
      subtitle={activeTeam!.name}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sampleTag}
          {canCreate && (
            <Button variant="primary" icon={<Plus size={16} aria-hidden="true" />} onClick={() => setCreating(true)}>
              {t('projects.new')}
            </Button>
          )}
        </div>
      }
    >
      {offline && <OfflineNote savedAt={work?.savedAt ?? ''} />}
      {creating && (
        <NewProject
          onCancel={() => setCreating(false)}
          onCreate={async (name) => {
            const id = await cloud.createProject(activeTeam!.id, name);
            await data.refresh();
            navigate(`/proyectos/${id}`);
          }}
        />
      )}
      <SegmentedControl
        label={t('projects.show')}
        options={[
          { value: 'active', label: t('projects.active') },
          { value: 'archived', label: t('projects.archivedTab') },
        ]}
        value={show}
        onChange={setShow}
      />
      {data.isPending ? (
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      ) : data.isError ? (
        <EmptyState title={t('projects.loadError')} description={t('projects.loadErrorHint', { error: errorMessage(data.error) })} />
      ) : projects.length === 0 ? (
        <EmptyState
          title={show === 'archived' ? t('projects.noArchived') : t('projects.empty')}
          description={show === 'archived' ? t('projects.noArchivedHint') : canCreate ? t('projects.emptyManager') : t('projects.emptyMember')}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} overdue={overdueOf(p.id)} href={`#/proyectos/${p.id}`} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}

/** Sin equipo o como observador no hay proyectos que mostrar. */
export function noTeamState(role: string | null) {
  if (role === null) return { title: t('projects.noTeam'), description: t('projects.noTeamHint') };
  if (role === 'viewer') return { title: t('projects.viewer'), description: t('projects.viewerHint') };
  return null;
}

export function OfflineNote({ savedAt }: { savedAt: string }) {
  return (
    <p role="status" className="rounded-md bg-sunken p-3 text-sm text-fg">
      {t('projects.offline', { date: savedAt ? formatDate(savedAt, { day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }) : '—' })}
    </p>
  );
}

function NewProject({ onCreate, onCancel }: { onCreate: (name: string) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (name.trim().length < 2) return setError(t('projects.nameTooShort'));
    try {
      await onCreate(name.trim());
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  return (
    <Surface as="section" aria-label={t('projects.new')}>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3" noValidate>
        <div className="min-w-48 flex-1">
          <FormField label={t('projects.name')} value={name} maxLength={80} error={error ?? undefined} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button type="submit" variant="primary">
          {t('projects.create')}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </form>
    </Surface>
  );
}
