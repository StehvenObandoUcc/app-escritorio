import { errorMessage, t } from '@/i18n';
import { ArrowLeft, Mail } from 'lucide-react';
import { useCallback, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSession } from '@/app/session';
import { CloudError } from '@/cloud/contract';
import { MOCK_CODE } from '@/cloud/mock';
import { fieldErrors, forms } from '@/lib/forms';
import { LIMITS } from '@/lib/limits';
import { useForm } from '@/lib/useForm';
import { useTheme } from '@/lib/theme';
import { Badge, Button } from '@/ui/atoms';
import { FormField, PasswordField, SegmentedControl, ThemeToggle } from '@/ui/molecules';
import { AuthLayout } from '@/ui/templates';

type Mode = 'entrar' | 'registro' | 'verificar' | 'recuperar' | 'nueva-clave';

const MODE_KEY = {
  entrar: 'signIn',
  registro: 'signUp',
  verificar: 'verify',
  recuperar: 'recover',
  'nueva-clave': 'newPassword',
} as const satisfies Record<Mode, keyof typeof forms>;

/**
 * Pantalla de acceso (CU-01 a CU-03). Se muestra en lugar de la app mientras no haya sesión:
 * registro con código de verificación, inicio de sesión y recuperación de contraseña.
 * Con el teclado: Enter pasa al siguiente campo vacío y envía en el último (C5, AC-43).
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
  const [notice, setNotice] = useState<string | null>(null);
  const schema = useCallback(() => forms[MODE_KEY[mode]](), [mode]);
  const { ref, errors, setErrors, formError, setFormError, busy, submit: send, onKeyDown } = useForm(schema);

  const go = (next: Mode) => {
    setMode(next);
    setErrors({});
    setFormError(null);
    setNotice(null);
    setCode('');
  };

  const submit = (e: FormEvent) => {
    setNotice(null);
    const mail = email.trim();
    void send(
      { name, email, password, code },
      async () => {
        if (mode === 'entrar') {
          try {
            await cloud.signIn(mail, password);
            navigate('/mi-dia');
          } catch (cause) {
            if (cause instanceof CloudError && cause.message === t('cloud.auth.emailNotConfirmed')) {
              // Si no se puede reenviar, la persona igual puede pedir otro código desde la pantalla siguiente.
              await cloud.resendSignUpCode(mail).catch(() => {});
              go('verificar');
              setNotice(t('access.notices.notVerified'));
              return;
            }
            throw cause;
          }
        } else if (mode === 'registro') {
          try {
            await cloud.signUp(mail, password, name.trim());
          } catch (cause) {
            // Un 5xx al registrarse suele ser el correo de confirmación (si sigue activado en Supabase).
            if (cause instanceof CloudError && cause.kind === 'network') {
              throw new CloudError(t('access.errors.signUpNetwork', { error: cause.message }), 'network');
            }
            throw cause;
          }
          // Sin confirmación de correo (ADR-0008) la sesión ya empezó: directo a Equipo.
          if (await cloud.currentUser()) {
            navigate('/equipo');
            return;
          }
          go('verificar');
          setNotice(t('access.notices.codeSent', { email: mail }));
        } else if (mode === 'verificar') {
          await cloud.verifySignUp(mail, code.trim());
          navigate('/equipo');
        } else if (mode === 'recuperar') {
          await cloud.requestPasswordReset(mail);
          go('nueva-clave');
          setNotice(t('access.notices.resetSent', { email: mail }));
        } else {
          await cloud.resetPassword(mail, code.trim(), password);
          navigate('/mi-dia');
        }
      },
      e,
    );
  };

  const title = t(`access.modes.${MODE_KEY[mode]}.title`);
  const subtitle = t(`access.modes.${MODE_KEY[mode]}.subtitle`);
  const isTab = mode === 'entrar' || mode === 'registro';
  const needsCode = mode === 'verificar' || mode === 'nueva-clave';
  const submitLabel = t(`access.modes.${MODE_KEY[mode]}.submit`);

  return (
    <AuthLayout
      title={title}
      subtitle={subtitle}
      corner={<ThemeToggle theme={theme} onCycle={cycle} />}
      footer={
        cloud.source === 'mock' && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
            <Badge tone="accent">{t('common.sample')}</Badge>
            <span>{t('access.mockNote')}</span>
          </div>
        )
      }
    >
      {isTab && (
        <SegmentedControl
          label={t('access.tabs')}
          value={mode}
          onChange={go}
          options={[
            { value: 'entrar', label: t('access.modes.signIn.submit') },
            { value: 'registro', label: t('access.modes.signUp.submit') },
          ]}
        />
      )}

      {needsCode && (
        <div className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
          <Mail size={20} aria-hidden="true" className="mt-1 shrink-0 text-accent-text" />
          <p className="min-w-0 text-sm text-fg-muted">
            {email.trim() ? (
              <>
                {t('access.sentTo')} <strong className="break-all text-fg">{email.trim()}</strong>.
              </>
            ) : (
              t('access.checkEmail')
            )}{' '}
            {t('access.spamHint')}
          </p>
        </div>
      )}

      <form ref={ref} onSubmit={submit} onKeyDown={onKeyDown} className="flex flex-col gap-4" noValidate aria-label={title}>
        {mode === 'registro' && (
          <FormField name="name" autoFocus label={t('access.fields.name')} autoComplete="name" maxLength={LIMITS.displayName.max} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} hint={t('access.fields.nameHint')} />
        )}
        {mode !== 'verificar' && (
          <FormField name="email" autoFocus={mode !== 'registro'} label={t('access.fields.email')} type="email" autoComplete="email" maxLength={LIMITS.email.max} value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} />
        )}
        {needsCode && (
          <FormField
            name="code"
            label={t('access.fields.code')}
            error={errors.code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            className="text-center font-display text-xl tracking-widest"
            hint={cloud.source === 'mock' ? t('access.fields.mockCode', { code: MOCK_CODE }) : undefined}
          />
        )}
        {(mode === 'entrar' || mode === 'registro' || mode === 'nueva-clave') && (
          <PasswordField
            key={mode}
            name="password"
            error={errors.password}
            maxLength={LIMITS.password.max}
            label={mode === 'nueva-clave' ? t('access.fields.newPassword') : t('access.fields.password')}
            autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            hint={mode === 'entrar' ? undefined : t('access.fields.passwordHint', { n: LIMITS.password.min })}
          />
        )}
        {formError && (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-sm text-danger">
            {formError}
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-fg-muted">
            {notice}
          </p>
        )}
        <Button type="submit" variant="primary" disabled={busy} className="w-full">
          {busy ? t('access.busy') : submitLabel}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === 'entrar' && (
          <Button variant="ghost" size="sm" onClick={() => go('recuperar')}>
            {t('access.forgot')}
          </Button>
        )}
        {mode === 'verificar' && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              // Reenviar solo necesita el correo, no el código del formulario.
              const check = fieldErrors(forms.recover(), { email });
              if (check.errors) return setFormError(check.errors.email ?? null);
              void cloud.resendSignUpCode(check.data.email).then(
                () => setNotice(t('access.notices.codeResent')),
                (cause: unknown) => setFormError(errorMessage(cause)),
              );
            }}
          >
            {t('access.resend')}
          </Button>
        )}
        {!isTab && (
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={16} aria-hidden="true" />} onClick={() => go('entrar')}>
            {t('access.backToSignIn')}
          </Button>
        )}
      </div>
    </AuthLayout>
  );
}
