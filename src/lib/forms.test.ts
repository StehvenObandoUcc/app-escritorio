import { describe, expect, it } from 'vitest';
import { fieldErrors, fileProblem, forms, linksField } from './forms';
import { LIMITS } from './limits';

const errorsOf = (schema: Parameters<typeof fieldErrors>[0], values: unknown) => fieldErrors(schema, values).errors;

describe('esquemas de formulario (AC-42)', () => {
  it('acceso: correo, contraseña y código', () => {
    expect(errorsOf(forms.signIn(), { email: 'ana@pulso', password: '' })).toEqual({
      email: expect.stringContaining('correo válido'),
      password: 'Escribe tu contraseña.',
    });
    expect(errorsOf(forms.signUp(), { name: ' ', email: 'ana@pulso.test', password: '1234567' })).toMatchObject({ name: expect.any(String), password: expect.stringContaining('8') });
    expect(errorsOf(forms.signUp(), { name: 'Ana', email: 'ana@pulso.test', password: 'x'.repeat(73) })).toMatchObject({ password: expect.stringContaining('72') });
    expect(errorsOf(forms.verify(), { code: '12a456' })).toMatchObject({ code: expect.any(String) });
    expect(fieldErrors(forms.signIn(), { email: '  ana@pulso.test ', password: 'x' }).data).toEqual({ email: 'ana@pulso.test', password: 'x' });
  });

  it('nombres con sus límites y espacios recortados', () => {
    expect(errorsOf(forms.team(), { name: 'A' })).toMatchObject({ name: 'Escribe entre 2 y 60 caracteres.' });
    expect(errorsOf(forms.project(), { name: 'x'.repeat(LIMITS.projectName.max + 1) })).toMatchObject({ name: expect.any(String) });
    expect(fieldErrors(forms.project(), { name: '  Web  ' }).data).toEqual({ name: 'Web' });
  });

  it('perfil: zona horaria real', () => {
    expect(errorsOf(forms.profile(), { name: 'Ana', timezone: 'Marte/Base' })).toMatchObject({ timezone: expect.any(String) });
    expect(errorsOf(forms.profile(), { name: 'Ana', timezone: 'America/Bogota' })).toBeNull();
  });

  it('código de invitación con o sin guion, en mayúsculas', () => {
    expect(fieldErrors(forms.invitationCode(), { code: 'k7pq4xmz' }).data).toEqual({ code: 'K7PQ4XMZ' });
    expect(errorsOf(forms.invitationCode(), { code: 'K7PQ-4XM' })).toMatchObject({ code: expect.any(String) });
  });

  it('entrada de tiempo: el fin después del inicio', () => {
    expect(errorsOf(forms.timeEntry(), { date: '2026-10-07', start: '10:00', end: '09:00' })).toEqual({ end: 'El fin debe ser posterior al inicio.' });
    expect(errorsOf(forms.timeEntry(), { date: '', start: '', end: '' })).toMatchObject({ date: expect.any(String), start: expect.any(String) });
  });

  it('tarea: título, etiquetas, estimación y criterios', () => {
    const base = { title: 'Portada', description: '', labels: 'ui, diseño', estimateMinutes: 960, criteria: 'Responsive\nAprobada' };
    expect(fieldErrors(forms.task(), base).data).toMatchObject({ labels: ['ui', 'diseño'], criteria: ['Responsive', 'Aprobada'] });
    expect(errorsOf(forms.task(), { ...base, title: '   ' })).toMatchObject({ title: expect.any(String) });
    expect(errorsOf(forms.task(), { ...base, estimateMinutes: Number.NaN })).toMatchObject({ estimateMinutes: expect.any(String) });
    expect(errorsOf(forms.task(), { ...base, estimateMinutes: LIMITS.estimateMinutes.max + 1 })).toMatchObject({ estimateMinutes: expect.any(String) });
    expect(errorsOf(forms.task(), { ...base, labels: Array.from({ length: 11 }, (_, i) => `e${i}`).join(',') })).toMatchObject({ labels: expect.any(String) });
    expect(errorsOf(forms.task(), { ...base, criteria: 'x'.repeat(301) })).toMatchObject({ criteria: expect.any(String) });
  });

  it('revisión: comentario obligatorio para pedir cambios; enlaces y archivos', () => {
    expect(errorsOf(forms.reviewComment(true), { comment: '  ' })).toMatchObject({ comment: expect.any(String) });
    expect(errorsOf(forms.reviewComment(false), { comment: '' })).toBeNull();
    expect(linksField().safeParse('https://a.com\nftp://b').success).toBe(false);
    expect(linksField().parse(' https://a.com \n\n')).toEqual(['https://a.com']);
    expect(fileProblem([new File(['x'], 'a.exe', { type: 'application/x-msdownload' })])).toMatch(/no admitido/);
    expect(fileProblem([new File(['x'], 'a.pdf', { type: 'application/pdf' })])).toBeNull();
  });

  it('borrar un proyecto exige su nombre exacto', () => {
    expect(errorsOf(forms.deleteProject('Sitio web'), { confirm: 'sitio web' })).toMatchObject({ confirm: expect.any(String) });
    expect(errorsOf(forms.deleteProject('Sitio web'), { confirm: ' Sitio web ' })).toBeNull();
  });
});
