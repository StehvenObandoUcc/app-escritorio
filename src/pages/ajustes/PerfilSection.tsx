import { errorMessage, t } from '@/i18n';
import { useState, type FormEvent } from 'react';
import { useOptionalSession, type SessionValue } from '@/app/session';
import { Avatar, Button, Heading, Surface } from '@/ui/atoms';
import { FormField } from '@/ui/molecules';

const describe = errorMessage;

const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('es', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Perfil (CU-04) y cerrar sesión (CU-02). Sin proveedor de sesión (p. ej. en pruebas de F1) no se muestra. */
export function PerfilSection() {
  const session = useOptionalSession();
  if (!session) return null;
  return <Perfil session={session} />;
}

function Perfil({ session }: { session: SessionValue }) {
  const { user, profile } = session;

  if (!user) return null;
  if (!profile) {
    return (
      <p role="status" className="text-fg-muted">
        {t('common.loading')}
      </p>
    );
  }
  return <PerfilForm key={profile.id} session={session} name0={profile.displayName} tz0={profile.timezone} email={user.email} />;
}

function PerfilForm({
  session,
  name0,
  tz0,
  email,
}: {
  session: SessionValue;
  name0: string;
  tz0: string;
  email: string;
}) {
  const [name, setName] = useState(name0);
  const [tz, setTz] = useState(tz0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const clean = name.trim();
    if (clean.length < 1 || clean.length > 80) return setError(t('profile.nameError'));
    if (!validTimezone(tz.trim())) return setError(t('profile.timezoneError'));
    setError(null);
    setBusy(true);
    try {
      await session.cloud.saveProfile(clean, tz.trim());
      await session.refresh();
      setNotice(t('profile.saved'));
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface as="section" aria-label={t('profile.title')}>
      <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
        <div className="flex items-center gap-3">
          <Avatar name={name || email} />
          <div className="min-w-0">
            <Heading level={2}>{t('profile.title')}</Heading>
            <p className="truncate text-sm text-fg-muted">{email}</p>
          </div>
        </div>
        <FormField label={t('profile.name')} value={name} onChange={(e) => setName(e.target.value)} hint={t('profile.nameHint')} />
        <FormField
          label={t('profile.timezone')}
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          hint={t('profile.timezoneHint')}
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-fg-muted">
            {notice}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={busy}>
            {t('profile.save')}
          </Button>
          <Button onClick={() => void session.cloud.signOut()}>{t('profile.signOut')}</Button>
        </div>
      </form>
    </Surface>
  );
}
