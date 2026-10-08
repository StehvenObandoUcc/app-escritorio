import { arrowNav, NAV_ITEM } from '@/lib/keyboard';
import { errorMessage, formatDate as formatIntlDate, t } from '@/i18n';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useSession } from '@/app/session';
import { useAction } from '@/app/useAction';
import type { MyInvitation, MyTeam } from '@/cloud/contract';
import { CONSENT_VERSION } from '@/lib/consent';
import { fieldErrors, forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { useForm } from '@/lib/useForm';
import { canSeeMembers, invitableRoles, ROLE_LABEL, type Role } from '@/lib/permissions';
import { Badge, Button, Heading, Select, Surface } from '@/ui/atoms';
import { ConfirmDialog, EmptyState, FormField, SegmentedControl, SyncStatus } from '@/ui/molecules';
import { ConsentPanel, MemberList } from '@/ui/organisms';
import { PageLayout } from '@/ui/templates';
import { SitiosYPoliticas } from './SitiosYPoliticas';

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
const formatDate = (iso: string) => formatIntlDate(iso, { day: 'numeric', month: 'long' });

/** Equipo: invitaciones recibidas, crear equipo, consentimiento, miembros e invitaciones (F2). */
export function EquipoPage() {
  const session = useSession();
  const { cloud, user, teams, teamsLoading, teamsError, activeTeam } = session;
  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">{t('common.sample')}</Badge>;

  // La app solo se muestra con sesión (Gate en App.tsx); esto cubre el instante en que se cierra.
  if (!user) return null;

  return (
    <PageLayout
      title={t('nav.team')}
      subtitle={activeTeam ? activeTeam.name : t('team.subtitleNone')}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {sampleTag}
          {teams.length > 1 && activeTeam && (
            <Select
              aria-label={t('nav.activeTeam')}
              value={activeTeam.id}
              onChange={(e) => session.selectTeam(e.target.value)}
              options={teams.map((x) => ({ value: x.id, label: x.name }))}
            />
          )}
        </div>
      }
    >
      <MyInvitations />
      {teamsLoading ? (
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      ) : teamsError ? (
        <EmptyState
          title={t('team.loadError')}
          description={t('team.loadErrorHint', { error: teamsError })}
          action={<Button onClick={() => void session.refresh()}>{t('team.retry')}</Button>}
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
        acceptLabel={t('team.acceptJoin')}
        busy={action.busy}
        error={action.error}
        onAccept={() => {
          const check = fieldErrors(forms.invitationCode(), { code });
          if (check.errors) {
            action.setError(check.errors.code ?? null);
            document.querySelector<HTMLInputElement>('input[name="invitationCode"]')?.focus();
            return;
          }
          void action.run(async () => {
            const teamId = await cloud.acceptInvitation(open.id, withDash(check.data.code), CONSENT_VERSION);
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
              {t('team.decline')}
            </Button>
            <Button variant="ghost" disabled={action.busy} onClick={() => setOpen(null)}>
              {t('team.back')}
            </Button>
          </>
        }
      >
        <FormField
          name="invitationCode"
          label={t('team.code')}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          maxLength={9}
          autoComplete="off"
          className="font-display tracking-widest"
          hint={t('team.codeHint')}
        />
      </ConsentPanel>
    );
  }

  return (
    <Surface as="section" aria-label={t('team.received')} className="flex flex-col gap-3">
      <Heading level={2}>{t('team.forYou')}</Heading>
      {query.error && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(query.error)}
        </p>
      )}
      <ul onKeyDown={arrowNav} className="flex flex-col divide-y divide-line">
        {list.map((inv) => (
          <li key={inv.id} className="flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-fg">{inv.teamName}</p>
              <p className="text-sm text-fg-muted">
                {inv.invitedByName ? t('team.invitedBy', { name: inv.invitedByName }) : t('team.invited')} {t('team.asRole', { role: ROLE_LABEL[inv.role], date: formatDate(inv.expiresAt) })}
              </p>
            </div>
            <Button variant="primary" size="sm" {...{ [NAV_ITEM]: '' }} onClick={() => setOpen(inv)}>
              {t('team.viewRespond')}
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
  const { ref, errors, formError, busy, submit: send, onKeyDown } = useForm(forms.team, onDone);
  const submit = (e: FormEvent) =>
    void send(
      { name },
      async (data) => {
        const id = await cloud.createTeam(data.name);
        selectTeam(id);
        await refresh();
        setName('');
        onDone?.();
      },
      e,
    );
  return (
    <Surface as="section" aria-label={t('team.create')}>
      <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex max-w-prose flex-col gap-4" noValidate>
        <div>
          <Heading level={2}>{first ? t('team.createFirst') : t('team.createAnother')}</Heading>
          <p className="mt-1 text-sm text-fg-muted">{t('team.createHint')}</p>
        </div>
        <FormField name="name" autoFocus={!first} label={t('team.name')} maxLength={LIMITS.teamName.max} value={name} onChange={(e) => setName(e.target.value)} error={errors.name ?? formError ?? undefined} />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {t('team.create')}
          </Button>
          {onDone && (
            <Button variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          )}
        </div>
      </form>
    </Surface>
  );
}

type TeamTab = 'members' | 'sites' | 'general';

function TeamView({ team }: { team: MyTeam }) {
  const { cloud, refresh, sync, syncNow } = useSession();
  const consent = useAction();
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<TeamTab>('members');

  // Sin consentimiento, o con el de una versión anterior (ADR-0009), se pide antes de subir nada.
  if (!team.consentAt || team.consentVersion !== CONSENT_VERSION) {
    return (
      <ConsentPanel
        teamName={team.name}
        acceptLabel={team.consentAt ? t('team.acceptNewVersion') : t('team.acceptStart')}
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

  const manager = team.role === 'owner' || team.role === 'admin';
  const tabs: { value: TeamTab; label: string }[] = [
    { value: 'members', label: t('team.tabs.members') },
    ...(manager ? [{ value: 'sites' as TeamTab, label: t('sites.title') }] : []),
    { value: 'general', label: t('team.tabs.general') },
  ];

  // D2: la pantalla se divide en pestañas para no ser una lista larga.
  return (
    <>
      <SegmentedControl label={t('team.tabs.label')} options={tabs} value={tab} onChange={setTab} />
      {tab === 'members' && (
        <>
          <Members team={team} />
          {invitableRoles(team.role).length > 0 && <Invitations team={team} />}
        </>
      )}
      {tab === 'sites' && manager && <SitiosYPoliticas team={team} />}
      {tab === 'general' && (
        <>
          <Surface as="section" aria-label={t('team.sync')} className="flex flex-wrap items-center justify-between gap-3">
            <SyncStatus phase={sync.phase} message={sync.message} lastSyncedAt={sync.lastSyncedAt} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={syncNow} disabled={sync.phase === 'syncing'}>
                {t('team.syncNow')}
              </Button>
              <Link
                to="/equipo/privacidad"
                className="inline-flex h-control-sm items-center gap-2 rounded-md px-3 text-sm font-medium text-fg hover:bg-sunken"
              >
                <ShieldCheck size={16} aria-hidden="true" />
                {t('privacy.title')}
              </Link>
            </div>
          </Surface>
          <LeaveTeam team={team} />
          {creating ? (
            <CreateTeam onDone={() => setCreating(false)} />
          ) : (
            <div>
              <Button variant="ghost" onClick={() => setCreating(true)}>
                {t('team.createAnother')}
              </Button>
            </div>
          )}
        </>
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
      <Surface as="section" aria-label={t('team.members')}>
        <Heading level={2}>{t('team.members')}</Heading>
        <p className="mt-1 text-fg-muted">{t('team.viewerMembers')}</p>
      </Surface>
    );
  }

  const members = query.data ?? [];
  const owners = members.filter((m) => m.role === 'owner').length;
  const me = user?.id ?? '';

  return (
    <Surface as="section" aria-label={t('team.members')} className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Heading level={2}>{t('team.members')}</Heading>
        <Badge>{t('team.yourRole', { role: ROLE_LABEL[team.role] })}</Badge>
      </div>
      {query.isPending ? (
        <p role="status" className="text-fg-muted">
          {t('common.loading')}
        </p>
      ) : query.error ? (
        <p role="alert" className="text-sm text-danger">
          {t('team.membersError', { error: errorMessage(query.error) })}
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
      <ConfirmDialog
        open={removing !== null}
        title={t('team.confirmRemove')}
        message={removing ? t('team.removeQuestion', { name: removing.name }) : ''}
        confirmLabel={t('team.remove')}
        danger
        busy={action.busy}
        onCancel={() => setRemoving(null)}
        onConfirm={() =>
          void action.run(async () => {
            if (!removing) return;
            await cloud.removeMember(team.id, removing.userId);
            setRemoving(null);
            await reload();
          })
        }
      />
      {team.role === 'owner' && owners > 1 && (
        <div>
          <Button variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => {
            await cloud.setMemberRole(team.id, me, 'admin');
            await reload();
          })}>
            {t('team.stopOwning')}
          </Button>
        </div>
      )}
      {team.role === 'owner' && owners === 1 && members.length > 1 && (
        <p className="text-sm text-fg-muted">
          {t('team.transferHint')}
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
  const { ref, errors, formError, busy, submit: send, onKeyDown } = useForm(forms.invite);
  const query = useQuery({ queryKey: ['invitations', team.id], queryFn: () => cloud.teamInvitations(team.id) });
  const reload = () => queryClient.invalidateQueries({ queryKey: ['invitations', team.id] });

  const submit = (e: FormEvent) => {
    setCreated(null);
    void send(
      { email },
      async (data) => {
        const mail = data.email.toLowerCase();
        const { code } = await cloud.invite(team.id, mail, role);
        setEmail('');
        setCreated({ email: mail, code });
        await reload();
      },
      e,
    );
  };

  return (
    <Surface as="section" aria-label={t('team.invite')} className="flex flex-col gap-4">
      <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-3" noValidate>
        <div>
          <Heading level={2}>{t('team.invite')}</Heading>
          <p className="mt-1 text-sm text-fg-muted">
            {t('team.inviteHint')}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1">
            <FormField name="email" label={t('access.fields.email')} type="email" maxLength={LIMITS.email.max} value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Select
            aria-label={t('team.role')}
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            options={roles.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
          <Button type="submit" variant="primary" icon={<UserPlus size={16} aria-hidden="true" />} disabled={busy}>
            {t('team.inviteButton')}
          </Button>
        </div>
        {(formError ?? action.error) && (
          <p role="alert" className="text-sm text-danger">
            {formError ?? action.error}
          </p>
        )}
        {created && (
          <div role="status" className="flex flex-col gap-2 rounded-md bg-accent-soft p-3">
            <p className="text-fg">
              {t('team.createdFor')} <strong className="break-all">{created.email}</strong>. {t('team.shareCode')}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display text-2xl font-semibold tracking-widest text-fg">{created.code}</span>
              <Button size="sm" onClick={() => void copy(created.code).then((ok) => setCopied(ok ? created.code : null))}>
                {copied === created.code ? t('team.copied') : t('team.copy')}
              </Button>
            </div>
          </div>
        )}
      </form>
      {(query.data ?? []).length > 0 && (
        <div>
          <Heading level={3}>{t('team.pending')}</Heading>
          <ul className="flex flex-col divide-y divide-line">
            {(query.data ?? []).map((inv) => (
              <li key={inv.id} className="flex flex-wrap items-center gap-3 py-2">
                <p className="min-w-0 flex-1 truncate text-fg">{inv.email}</p>
                {inv.code && (
                  <span className="font-display text-sm font-semibold tracking-widest text-fg" aria-label={t('team.codeOf', { code: inv.code })}>
                    {inv.code}
                  </span>
                )}
                <Badge>{ROLE_LABEL[inv.role]}</Badge>
                <span className="text-sm text-fg-muted">{t('team.expires', { date: formatDate(inv.expiresAt) })}</span>
                <Button size="sm" variant="ghost" disabled={action.busy} onClick={() => void action.run(async () => {
                  await cloud.revokeInvitation(inv.id);
                  await reload();
                })}>
                  {t('team.revoke')}
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
    <Surface as="section" aria-label={t('team.leave')} className="flex flex-col gap-2">
      <Heading level={2}>{t('team.leave')}</Heading>
      <p className="text-fg-muted">
        {t('team.leaveHint', { team: team.name })}
      </p>
      <div>
        <Button onClick={() => setConfirming(true)}>{t('team.leave')}</Button>
      </div>
      <ConfirmDialog
        open={confirming}
        title={t('team.leave')}
        message={t('team.leaveHint', { team: team.name })}
        confirmLabel={t('team.leaveConfirm', { team: team.name })}
        danger
        busy={action.busy}
        error={action.error}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          void action.run(async () => {
            await cloud.leaveTeam(team.id);
            setConfirming(false);
            await refresh();
          })
        }
      />
      {action.error && (
        <p role="alert" className="text-sm text-danger">
          {action.error}
        </p>
      )}
    </Surface>
  );
}
