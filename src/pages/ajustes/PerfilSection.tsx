import { useState, type FormEvent } from 'react';
import { useOptionalSession, type SessionValue } from '@/app/session';
import { Avatar, Button, Heading, Surface } from '@/ui/atoms';
import { FormField } from '@/ui/molecules';

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

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
        Cargando tu perfil…
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
    if (clean.length < 1 || clean.length > 80) return setError('El nombre debe tener entre 1 y 80 caracteres.');
    if (!validTimezone(tz.trim())) return setError('La zona horaria no existe. Usa el formato Región/Ciudad, por ejemplo America/Bogota.');
    setError(null);
    setBusy(true);
    try {
      await session.cloud.saveProfile(clean, tz.trim());
      await session.refresh();
      setNotice('Perfil guardado.');
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Surface as="section" aria-label="Perfil">
      <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
        <div className="flex items-center gap-3">
          <Avatar name={name || email} />
          <div className="min-w-0">
            <Heading level={2}>Perfil</Heading>
            <p className="truncate text-sm text-fg-muted">{email}</p>
          </div>
        </div>
        <FormField label="Nombre visible" value={name} onChange={(e) => setName(e.target.value)} hint="Así te ven en la lista del equipo." />
        <FormField
          label="Zona horaria"
          value={tz}
          onChange={(e) => setTz(e.target.value)}
          hint="Define tu jornada y tu día. Formato Región/Ciudad, por ejemplo America/Bogota."
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
            Guardar perfil
          </Button>
          <Button onClick={() => void session.cloud.signOut()}>Cerrar sesión</Button>
        </div>
      </form>
    </Surface>
  );
}
