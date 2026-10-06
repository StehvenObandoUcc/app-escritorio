import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '@/app/session';
import { MOCK_CODE } from '@/cloud/mock';
import { Badge, Button, Heading, Surface } from '@/ui/atoms';
import { FormField } from '@/ui/molecules';
import { PageLayout } from '@/ui/templates';

type Mode = 'entrar' | 'registro' | 'verificar' | 'recuperar' | 'nueva-clave';

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** CU-01 pide 6 dígitos; se aceptan hasta 10 por si el proyecto de Supabase usa otra longitud. */
const CODE = /^\d{6,10}$/;
const MIN_PASSWORD = 8;

const TITLES: Record<Mode, { title: string; subtitle: string }> = {
  entrar: { title: 'Iniciar sesión', subtitle: 'Entra con tu correo para trabajar en equipo' },
  registro: { title: 'Crear cuenta', subtitle: 'Te enviaremos un código de 6 dígitos a tu correo' },
  verificar: { title: 'Verifica tu correo', subtitle: 'Escribe el código que te enviamos' },
  recuperar: { title: 'Recuperar contraseña', subtitle: 'Te enviaremos un código para crear una nueva' },
  'nueva-clave': { title: 'Nueva contraseña', subtitle: 'Escribe el código del correo y tu contraseña nueva' },
};

/** Registro, verificación por código, inicio de sesión y recuperación de contraseña (CU-01 a CU-03). */
export function AccesoPage() {
  const { cloud, user, profile } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('entrar');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const go = (next: Mode) => {
    setMode(next);
    setError(null);
    setNotice(null);
    setCode('');
  };

  const attempt = async (check: () => string | null, action: () => Promise<void>) => {
    const problem = check();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await action();
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  };

  const emailProblem = () => (EMAIL.test(email.trim()) ? null : 'Escribe un correo válido, por ejemplo nombre@empresa.com.');
  const passwordProblem = () =>
    password.length >= MIN_PASSWORD ? null : `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  const codeProblem = () => (CODE.test(code.trim()) ? null : 'El código tiene 6 dígitos. Revisa el correo que te enviamos.');

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const mail = email.trim();
    if (mode === 'entrar') {
      void attempt(
        () => emailProblem() ?? (password ? null : 'Escribe tu contraseña.'),
        async () => {
          try {
            await cloud.signIn(mail, password);
            navigate('/equipo');
          } catch (cause) {
            if (/verificado/i.test(describe(cause))) {
              await cloud.resendSignUpCode(mail).catch(() => {});
              go('verificar');
              setNotice('Tu correo aún no está verificado. Te enviamos un código nuevo.');
              return;
            }
            throw cause;
          }
        },
      );
    } else if (mode === 'registro') {
      void attempt(
        () =>
          (name.trim().length >= 1 && name.trim().length <= 80 ? null : 'Escribe tu nombre (hasta 80 caracteres).') ??
          emailProblem() ??
          passwordProblem(),
        async () => {
          await cloud.signUp(mail, password, name.trim());
          go('verificar');
          setNotice(`Enviamos un código a ${mail}. Puede tardar un minuto; revisa también el correo no deseado.`);
        },
      );
    } else if (mode === 'verificar') {
      void attempt(codeProblem, async () => {
        await cloud.verifySignUp(mail, code.trim());
        navigate('/equipo');
      });
    } else if (mode === 'recuperar') {
      void attempt(emailProblem, async () => {
        await cloud.requestPasswordReset(mail);
        go('nueva-clave');
        setNotice(`Si existe una cuenta con ${mail}, te llegará un código.`);
      });
    } else {
      void attempt(
        () => codeProblem() ?? passwordProblem(),
        async () => {
          await cloud.resetPassword(mail, code.trim(), password);
          navigate('/equipo');
        },
      );
    }
  };

  const sampleTag = cloud.source === 'mock' && <Badge tone="accent">Datos de ejemplo</Badge>;

  if (user) {
    return (
      <PageLayout title="Tu cuenta" subtitle="Ya iniciaste sesión" actions={sampleTag}>
        <Surface className="flex flex-col items-start gap-3">
          <p className="text-fg">
            Entraste como <strong>{profile?.displayName ?? user.email}</strong> ({user.email}).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => navigate('/equipo')}>
              Ir a Equipo
            </Button>
            <Button onClick={() => void cloud.signOut()}>Cerrar sesión</Button>
          </div>
        </Surface>
      </PageLayout>
    );
  }

  const { title, subtitle } = TITLES[mode];
  const needsCode = mode === 'verificar' || mode === 'nueva-clave';
  return (
    <PageLayout title={title} subtitle={subtitle} actions={sampleTag}>
      <Surface as="section" aria-label={title}>
        <form onSubmit={submit} className="flex max-w-prose flex-col gap-4" noValidate>
          {mode === 'registro' && (
            <FormField label="Nombre visible" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
          )}
          <FormField
            label="Correo"
            type="email"
            autoComplete="email"
            value={email}
            disabled={mode === 'verificar'}
            onChange={(e) => setEmail(e.target.value)}
          />
          {needsCode && (
            <FormField
              label="Código"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              hint={cloud.source === 'mock' ? `Datos de ejemplo: el código es ${MOCK_CODE}.` : 'Lo encuentras en el correo que te enviamos.'}
            />
          )}
          {(mode === 'entrar' || mode === 'registro' || mode === 'nueva-clave') && (
            <FormField
              label={mode === 'nueva-clave' ? 'Contraseña nueva' : 'Contraseña'}
              type="password"
              autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint={mode === 'entrar' ? undefined : `Al menos ${MIN_PASSWORD} caracteres.`}
            />
          )}
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
              {mode === 'entrar' && 'Iniciar sesión'}
              {mode === 'registro' && 'Crear cuenta'}
              {mode === 'verificar' && 'Verificar correo'}
              {mode === 'recuperar' && 'Enviar código'}
              {mode === 'nueva-clave' && 'Guardar contraseña'}
            </Button>
            {mode === 'verificar' && (
              <Button
                disabled={busy}
                onClick={() =>
                  void attempt(emailProblem, async () => {
                    await cloud.resendSignUpCode(email.trim());
                    setNotice('Te enviamos un código nuevo.');
                  })
                }
              >
                Reenviar código
              </Button>
            )}
          </div>
        </form>
      </Surface>
      <Surface>
        <Heading level={3}>Otras opciones</Heading>
        <div className="mt-2 flex flex-wrap gap-2">
          {mode !== 'entrar' && (
            <Button variant="ghost" onClick={() => go('entrar')}>
              Ya tengo cuenta
            </Button>
          )}
          {mode !== 'registro' && (
            <Button variant="ghost" onClick={() => go('registro')}>
              Crear una cuenta
            </Button>
          )}
          {mode !== 'recuperar' && mode !== 'nueva-clave' && (
            <Button variant="ghost" onClick={() => go('recuperar')}>
              Olvidé mi contraseña
            </Button>
          )}
        </div>
      </Surface>
    </PageLayout>
  );
}
