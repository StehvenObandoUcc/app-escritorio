import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useSession } from '@/app/session';
import type { MyInvitation, MyTeam } from '@/cloud/contract';
import { CONSENT_VERSION } from '@/lib/consent';
import { canSeeMembers, invitableRoles, ROLE_LABEL, type Role } from '@/lib/permissions';
import { Badge, Button, Heading, Select, Surface } from '@/ui/atoms';
import { EmptyState, FormField, SyncStatus } from '@/ui/molecules';
import { ConsentPanel, MemberList } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Código de invitación (ADR-0008): XXXX-XXXX; el guion es opcional al escribirlo. */
const CODE = /^[A-Z2-9]{4}-?[A-Z2-9]{4}$/;
const withDash = (c: string) => (c.includes('-') ? c : `${c.slice(0, 4)}-${c.slice(4)}`);

/** Copia al portapapeles; si no se puede, no pasa nada (el código sigue a la vista). */
const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};
const formatDate = (iso: string) => new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'long' });

/** Ejecuta una acción con estado de «ocupado» y error legible. */
function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      return true;
    } catch (cause) {
      setError(describe(cause));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}

/** Equipo: invitaciones recibidas, crear equipo, consentimiento, miembros e invitaciones (F2). */
export function EquipoPage() {
  const session = useSession();
  const { cloud, user, teams, teamsLoading, teamsError, activeTeam } = session;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">Datos de ejemplo</Badge>;

  // La app solo se muestra con sesión (Gate en App.tsx); esto cubre el instante en que se cierra.
  if (!user) return null;

  return (
    <PageLayout
      title="Equipo"
      subtitle={activeTeam ? activeTeam.name : 'Crea un equipo o acepta una invitación'}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sampleTag}
          {teams.length > 1 && activeTeam && (
            <Select
              aria-label="Equipo activo"
              value={activeTeam.id}
              onChange={(e) => session.selectTeam(e.target.value)}
              options={teams.map((t) => ({ value: t.id, label: t.name }))}
            />
          )}
        </div>
      }
    >
      <MyInvitations />
      {teamsLoading ? (
        <p role="status" className="text-fg-muted">
          Cargando tus equipos…
        </p>
      ) : teamsError ? (
        <EmptyState
          title="No se pudieron leer tus equipos"
          description={`${teamsError} Pulso sigue registrando y subirá tus datos cuando vuelva la conexión.`}
          action={<Button onClick={() => void session.refresh()}>Reintentar</Button>}
        />
      ) : activeTeam ? (
        <TeamView team={activeTeam} key={activeTeam.id} />
      ) : (
        <CreateTeam first />
      )}
    </PageLayout>
  );
}

function MyInvitations() {
  const { cloud, user, refresh, selectTeam } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<MyInvitation | null>(null);
  const [code, setCode] = useState('');
  const action = useAction();
  const query = useQuery({ queryKey: ['my-invitations', user?.id], queryFn: () => cloud.myInvitations(), enabled: Boolean(user) });
  const list = query.data ?? [];
  if (!user || (!list.length && !query.error)) return null;

  const done = async () => {
    setOpen(null);
    await queryClient.invalidateQueries({ queryKey: ['my-invitations'] });
    await refresh();
  };

  if (open) {
    return (
      <ConsentPanel
        teamName={open.teamName}
        acceptLabel="Aceptar y unirme"
        busy={action.busy}
        error={action.error}
        onAccept={() => {
          const clean = code.trim().toUpperCase();
          if (!CODE.test(clean)) {
            action.setError('Escribe el código de 8 caracteres que te dio quien te invitó, por ejemplo K7PQ-4XMZ.');
            return;
          }
          void action.run(async () => {
            const teamId = await cloud.acceptInvitation(open.id, withDash(clean), CONSENT_VERSION);
            selectTeam(teamId);
            setCode('');
            await done();
          });
        }}
        secondary={
          <>
            <Button disabled={action.busy} onClick={() => void action.run(async () => {
              await cloud.declineInvitation(open.id);
              await done();
            })}>
              Rechazar invitación
            </Button>
            <Button variant="ghost" disabled={action.busy} onClick={() => setOpen(null)}>
              Volver
            </Button>
          </>
        }
      >
        <FormField
          label="Código de invitación"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={9}
          autoComplete="off"
          className="font-display tracking-widest"
          hint="Te lo da quien te invitó, en persona o por mensaje. Tiene la forma XXXX-XXXX."
        />
      </ConsentPanel>
    );
  }

  return (
    <Surface as="section" aria-label="Invitaciones recibidas" className="flex flex-col gap-3">
      <Heading level={2}>Invitaciones para ti</Heading>
      {query.error && (
        <p role="alert" className="text-sm text-danger">
          {describe(query.error)}
        </p>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {list.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{inv.teamName}</p>
              <p className="text-sm text-fg-muted">
                {inv.invitedByName ? `${inv.invitedByName} te invitó` : 'Te invitaron'} como {ROLE_LABEL[inv.role]} · vence el {formatDate(inv.expiresAt)}
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setOpen(inv)}>
              Ver y responder
            </Button>
          </li>
        ))}
      </ul>
    </Surface>
  );
}

function CreateTeam({ first = false, onDone }: { first?: boolean; onDone?: () => void }) {
  const { cloud, refresh, selectTeam } = useSession();
  const [name, setName] = useState('');
  const action = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) {
      action.setError('El nombre del equipo debe tener entre 2 y 60 caracteres.');
      return;
    }
    void action.run(async () => {
      const id = await cloud.createTeam(clean);
      selectTeam(id);
      await refresh();
      setName('');
      onDone?.();
    });
  };
  return (
    <Surface as="section" aria-label="Crear equipo">
      <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
        <div>
          <Heading level={2}>{first ? 'Crea tu primer equipo' : 'Crear otro equipo'}</Heading>
          <p className="mt-1 text-sm text-fg-muted">Serás su propietario. Después podrás invitar a otras personas.</p>
        </div>
        <FormField label="Nombre del equipo" value={name} onChange={(e) => setName(e.target.value)} error={action.error ?? undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={action.busy}>
            Crear equipo
          </Button>
          {onDone && (
            <Button variant="ghost" onClick={onDone}>
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </Surface>
  );
}

function TeamView({ team }: { team: MyTeam }) {
  const { cloud, refresh, sync, syncNow } = useSession();
  const consent = useAction();
  const [creating, setCreating] = useState(false);

  if (!team.consentAt) {
    return (
      <ConsentPanel
        teamName={team.name}
        acceptLabel="Aceptar y empezar a compartir"
        busy={consent.busy}
        error={consent.error}
        onAccept={() =>
          void consent.run(async () => {
            await cloud.giveConsent(team.id, CONSENT_VERSION);
            await refresh();
          })
        }
      />
    );
  }

  return (
    <>
      <Surface as="section" aria-label="Sincronización" className="flex flex-wrap items-center justify-between gap-3">
        <SyncStatus phase={sync.phase} message={sync.message} lastSyncedAt={sync.lastSyncedAt} />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={syncNow} disabled={sync.phase === 'syncing'}>
            Sincronizar ahora
          </Button>
          <Link
            to="/equipo/privacidad"
            className="inline-flex h-control-sm items-center gap-2 rounded-md px-3 text-sm font-medium text-fg hover:bg-sunken"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            Qué se mide y quién lo ve
          </Link>
        </div>
      </Surface>
      <Members team={team} />
      {invitableRoles(team.role).length > 0 && <Invitations team={team} />}
      <LeaveTeam team={team} />
      {creating ? (
        <CreateTeam onDone={() => setCreating(false)} />
      ) : (
        <div>
          <Button variant="ghost" onClick={() => setCreating(true)}>
            Crear otro equipo
          </Button>
        </div>
      )}
    </>
  );
}

function Members({ team }: { team: MyTeam }) {
  const { cloud, user, refresh } = useSession();
  const queryClient = useQueryClient();
  const action = useAction();
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const query = useQuery({ queryKey: ['members', team.id], queryFn: () => cloud.members(team.id) });
  const reload = async () => {
    await queryClient.invalidateQueries({ queryKey: ['members', team.id] });
    await refresh();
  };

  if (!canSeeMembers(team.role)) {
    return (
      <Surface as="section" aria-label="Miembros">
        <Heading level={2}>Miembros</Heading>
        <p className="mt-1 text-fg-muted">Como observador ves los totales del equipo, pero no la lista de miembros.</p>
      </Surface>
    );
  }

  const members = query.data ?? [];
  const owners = members.filter((m) => m.role === 'owner').length;
  const me = user?.id ?? '';

  return (
    <Surface as="section" aria-label="Miembros" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2}>Miembros</Heading>
        <Badge>Tu rol: {ROLE_LABEL[team.role]}</Badge>
      </div>
      {query.isPending ? (
        <p role="status" className="text-fg-muted">
          Cargando miembros…
        </p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-danger">
          No se pudo leer la lista: {describe(query.error)}
        </p>
      ) : (
        <MemberList
          members={members}
          myUserId={me}
          myRole={team.role}
          busy={action.busy}
          onChangeRole={(userId, role) => void action.run(async () => {
            await cloud.setMemberRole(team.id, userId, role);
            await reload();
          })}
          onRemove={(userId, name) => setRemoving({ userId, name })}
        />
      )}
      {removing && (
        <div role="alertdialog" aria-label="Confirmar expulsión" className="flex flex-col gap-2 rounded-md bg-danger-soft p-3">
          <p className="text-fg">
            ¿Expulsar a {removing.name}? Se borrará su actividad en este equipo; su tiempo registrado se conserva como «Exmiembro».
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" disabled={action.busy} onClick={() => void action.run(async () => {
              await cloud.removeMember(team.id, removing.userId);
              setRemoving(null);
              await reload();
            })}>
              Expulsar
            </Button>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {team.role === 'owner' && owners > 1 && (
        <div>
          <Button variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => {
            await cloud.setMemberRole(team.id, me, 'admin');
            await reload();
          })}>
            Dejar de ser propietario
          </Button>
        </div>
      )}
      {team.role === 'owner' && owners === 1 && members.length > 1 && (
        <p className="text-sm text-fg-muted">
          Para ceder la propiedad, nombra a otra persona como Propietario y después deja de serlo tú.
        </p>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error}
        </p>
      )}
    </Surface>
  );
}

function Invitations({ team }: { team: MyTeam }) {
  const { cloud } = useSession();
  const queryClient = useQueryClient();
  const roles = invitableRoles(team.role);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [created, setCreated] = useState<{ email: string; code: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const action = useAction();
  const query = useQuery({ queryKey: ['invitations', team.id], queryFn: () => cloud.teamInvitations(team.id) });
  const reload = () => queryClient.invalidateQueries({ queryKey: ['invitations', team.id] });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setCreated(null);
    const mail = email.trim().toLowerCase();
    if (!EMAIL.test(mail)) {
      action.setError('Escribe un correo válido, por ejemplo nombre@empresa.com.');
      return;
    }
    void action.run(async () => {
      const { code } = await cloud.invite(team.id, mail, role);
      setEmail('');
      setCreated({ email: mail, code });
      await reload();
    });
  };

  return (
    <Surface as="section" aria-label="Invitar personas" className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <div>
          <Heading level={2}>Invitar personas</Heading>
          <p className="mt-1 text-sm text-fg-muted">
            Pulso no envía correos: la persona ve la invitación al entrar con ese correo y se une con el código que tú le compartes. Vence a
            los 7 días.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <FormField label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Select
            aria-label="Rol"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
          <Button type="submit" variant="primary" icon={<UserPlus size={16} aria-hidden="true" />} disabled={action.busy}>
            Invitar
          </Button>
        </div>
        {action.error && (
          <p role="alert" className="text-sm text-danger">
            {action.error}
          </p>
        )}
        {created && (
          <div role="status" className="flex flex-col gap-2 rounded-md bg-accent-soft p-3">
            <p className="text-fg">
              Invitación creada para <strong className="break-all">{created.email}</strong>. Compártele este código en persona o por
              mensaje:
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-semibold tracking-widest text-fg">{created.code}</span>
              <Button size="sm" onClick={() => void copy(created.code).then((ok) => setCopied(ok ? created.code : null))}>
                {copied === created.code ? 'Copiado' : 'Copiar código'}
              </Button>
            </div>
          </div>
        )}
      </form>
      {(query.data ?? []).length > 0 && (
        <div>
          <Heading level={3}>Pendientes</Heading>
          <ul className="flex flex-col divide-y divide-line">
            {(query.data ?? []).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2">
                <p className="min-w-0 flex-1 truncate text-fg">{inv.email}</p>
                {inv.code && (
                  <span className="font-display text-sm font-semibold tracking-widest text-fg" aria-label={`Código ${inv.code}`}>
                    {inv.code}
                  </span>
                )}
                <Badge>{ROLE_LABEL[inv.role]}</Badge>
                <span className="text-sm text-fg-muted">vence el {formatDate(inv.expiresAt)}</span>
                <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => {
                  await cloud.revokeInvitation(inv.id);
                  await reload();
                })}>
                  Revocar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Surface>
  );
}

function LeaveTeam({ team }: { team: MyTeam }) {
  const { cloud, refresh } = useSession();
  const [confirming, setConfirming] = useState(false);
  const action = useAction();
  return (
    <Surface as="section" aria-label="Salir del equipo" className="flex flex-col gap-2">
      <Heading level={2}>Salir del equipo</Heading>
      <p className="text-fg-muted">
        Al salir se borra tu actividad en {team.name}; tu tiempo registrado se conserva como «Exmiembro». Lo que registres después ya no se compartirá con este equipo.
      </p>
      {confirming ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" disabled={action.busy} onClick={() => void action.run(async () => {
            await cloud.leaveTeam(team.id);
            setConfirming(false);
            await refresh();
          })}>
            Sí, salir de {team.name}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      ) : (
        <div>
          <Button onClick={() => setConfirming(true)}>Salir del equipo</Button>
        </div>
      )}
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error}
        </p>
      )}
    </Surface>
  );
}
