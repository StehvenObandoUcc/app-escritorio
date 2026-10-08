import { useState, type FormEvent } from 'react';
import { useOptionalSession, type SessionValue } from '@/app/session';
import { t } from '@/i18n';
import { forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { useForm } from '@/lib/useForm';
import { Avatar, Button, Heading, Surface } from '@/ui/atoms';
import { FormField } from '@/ui/molecules';

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
  const [notice, setNotice] = useState<string | null>(null);
  const { ref, errors, formError, busy, submit: send, onKeyDown } = useForm(forms.profile);

  const submit = (e: FormEvent) => {
    setNotice(null);
    void send(
      { name, timezone: tz },
      async (data) => {
        await session.cloud.saveProfile(data.name, data.timezone);
        await session.refresh();
        setNotice(t('profile.saved'));
      },
      e,
    );
  };

  return (
    <Surface as="section" aria-label={t('profile.title')}>
      <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex max-w-prose flex-col gap-4" noValidate>
        <div className="flex items-center gap-3">
          <Avatar name={name || email} />
          <div className="min-w-0">
            <Heading level={2}>{t('profile.title')}</Heading>
            <p className="truncate text-sm text-fg-muted">{email}</p>
          </div>
        </div>
        <FormField name="name" label={t('profile.name')} maxLength={LIMITS.displayName.max} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} hint={t('profile.nameHint')} />
        <FormField
          name="timezone"
          label={t('profile.timezone')}
          error={errors.timezone}
          maxLength={64}
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          hint={t('profile.timezoneHint')}
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
