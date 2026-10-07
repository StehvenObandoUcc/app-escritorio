import { ArrowLeft, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '@/app/session';
import { CloudError } from '@/cloud/contract';
import { MOCK_CODE } from '@/cloud/mock';
import { cx } from '@/lib/cx';
import { useTheme } from '@/lib/theme';
import { Badge, Button } from '@/ui/atoms';
import { FormField, PasswordField, ThemeToggle } from '@/ui/molecules';
import { AuthLayout } from '@/ui/templates';

type Mode = 'entrar' | 'registro' | 'verificar' | 'recuperar' | 'nueva-clave';

const describe = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** CU-01 pide 6 dígitos; se aceptan hasta 10 por si el proyecto de Supabase usa otra longitud. */
const CODE = /^\d{6,10}$/;
const MIN_PASSWORD = 8;

const TITLES: Record<Mode, { title: string; subtitle: string }> = {
  entrar: { title: 'Hola de nuevo', subtitle: 'Entra para ver tu día y trabajar con tu equipo.' },
  registro: { title: 'Crea tu cuenta', subtitle: 'Toma un minuto. Para unirte a un equipo, pide el código de invitación.' },
  verificar: { title: 'Revisa tu correo', subtitle: 'Escribe el código de 6 dígitos que te enviamos.' },
  recuperar: { title: '¿Olvidaste tu contraseña?', subtitle: 'Te enviaremos un código para crear una nueva.' },
  'nueva-clave': { title: 'Crea una contraseña nueva', subtitle: 'Escribe el código del correo y tu contraseña nueva.' },
};

/**
 * Pantalla de acceso (CU-01 a CU-03). Se muestra en lugar de la app mientras no haya sesión:
 * registro con código de verificación, inicio de sesión y recuperación de contraseña.
 */
export function AccesoPage() {
  const { cloud } = useSession();
  const { theme, cycle } = useTheme();
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
            navigate('/mi-dia');
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
          try {
            await cloud.signUp(mail, password, name.trim());
          } catch (cause) {
            // Un 5xx al registrarse suele ser el correo de confirmación (si sigue activado en Supabase).
            if (cause instanceof CloudError && cause.kind === 'network') {
              throw new CloudError(`No pudimos crear la cuenta: ${cause.message} Si la cuenta ya quedó creada, ve a «Iniciar sesión».`, 'network');
            }
            throw cause;
          }
          // Sin confirmación de correo (ADR-0008) la sesión ya empezó: directo a Equipo.
          if (await cloud.currentUser()) {
            navigate('/equipo');
            return;
          }
          // Si el proyecto de Supabase aún exige confirmar el correo, se pide el código.
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
          navigate('/mi-dia');
        },
      );
    }
  };

  const { title, subtitle } = TITLES[mode];
  const isTab = mode === 'entrar' || mode === 'registro';
  const needsCode = mode === 'verificar' || mode === 'nueva-clave';
  const submitLabel: Record<Mode, string> = {
    entrar: 'Iniciar sesión',
    registro: 'Crear cuenta',
    verificar: 'Verificar correo',
    recuperar: 'Enviar código',
    'nueva-clave': 'Guardar contraseña',
  };

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      corner={<ThemeToggle theme={theme} onCycle={cycle} />}
      footer={
        cloud.source === 'mock' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone="accent">Datos de ejemplo</Badge>
            <span>Sin conexión a Supabase: las cuentas viven en memoria.</span>
          </div>
        )
      }
    >
      {isTab && (
        <div role="tablist" aria-label="Acceso" className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1">
          {(['entrar', 'registro'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={mode === tab}
              onClick={() => go(tab)}
              className={cx(
                'h-control rounded-md text-sm font-medium transition-colors',
                mode === tab ? 'border border-line bg-surface text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {tab === 'entrar' ? 'Iniciar sesión' : 'Crear cuenta'}
            </button>
          ))}
        </div>
      )}

      {needsCode && (
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
          <Mail size={20} aria-hidden="true" className="mt-1 shrink-0 text-accent-text" />
          <p className="min-w-0 text-sm text-fg-muted">
            {email.trim() ? (
              <>
                Lo enviamos a <strong className="break-all text-fg">{email.trim()}</strong>.
              </>
            ) : (
              'Revisa tu correo.'
            )}{' '}
            Si no llega en un minuto, revisa el correo no deseado.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate aria-label={title}>
        {mode === 'registro' && (
          <FormField label="Nombre visible" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} hint="Así te verá tu equipo." />
        )}
        {mode !== 'verificar' && (
          <FormField label="Correo" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        )}
        {needsCode && (
          <FormField
            label="Código"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center font-display text-xl tracking-widest"
            hint={cloud.source === 'mock' ? `Datos de ejemplo: el código es ${MOCK_CODE}.` : undefined}
          />
        )}
        {(mode === 'entrar' || mode === 'registro' || mode === 'nueva-clave') && (
          <PasswordField
            key={mode}
            label={mode === 'nueva-clave' ? 'Contraseña nueva' : 'Contraseña'}
            autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === 'entrar' ? undefined : `Al menos ${MIN_PASSWORD} caracteres.`}
          />
        )}
        {error && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-fg-muted">
            {notice}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? 'Un momento…' : submitLabel[mode]}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === 'entrar' && (
          <Button variant="ghost" size="sm" onClick={() => go('recuperar')}>
            Olvidé mi contraseña
          </Button>
        )}
        {mode === 'verificar' && (
          <Button
            variant="ghost"
            size="sm"
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
        {!isTab && (
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => go('entrar')}>
            Volver a iniciar sesión
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
