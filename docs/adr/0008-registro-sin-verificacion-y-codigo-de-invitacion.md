# ADR-0008 · Registro sin verificar el correo; las invitaciones llevan un código

Fecha: 2026-10-06 · Estado: aceptado (por StehvenObando) · Reemplaza en parte a ADR-0004

## Contexto
ADR-0004 hacía depender la seguridad de las invitaciones de que el correo estuviera verificado, y CU-01
pedía un código de 6 dígitos por correo al registrarse. En la prueba real, Supabase respondió 504 al
enviar ese correo: nadie podía crear una cuenta. Además, esperar un correo para entrar a una app de
escritorio resulta extraño y el plan gratuito de Supabase limita mucho los envíos.

## Decisión
- El registro **no** exige verificar el correo: quien se registra entra al instante
  (en Supabase, *Confirm email* desactivado).
- Cada invitación tiene un **código de 8 caracteres** (`XXXX-XXXX`, sin letras ni números que se
  confundan). Quien invita lo ve en Pulso y lo comparte por el medio que quiera (en persona, WhatsApp).
- `accept_invitation(id, code, consent_version)` exige: haber iniciado sesión con el correo invitado,
  el código correcto, invitación pendiente y vigente. Tras **5 códigos incorrectos** la invitación se anula
  y hay que pedir otra.
- `invite_member` devuelve el id y el código. Owner y admin pueden volver a ver el código de las
  invitaciones pendientes de su equipo.

## Consecuencias
- Registrarse ya no depende del servicio de correo. Solo *Olvidé mi contraseña* envía correos; ese
  servicio (SMTP) se configura aparte.
- Alguien que se registre con el correo de otra persona puede ver que tiene una invitación (nombre del
  equipo y de quien invita), pero no puede unirse sin el código.
- Si se pierde el código, quien invitó lo vuelve a ver en *Equipo → Invitar personas → Pendientes*.
- Cambian CU-01, EQ-02, EQ-03, D-12 de `docs/ARQUITECTURA.md` y la regla de integridad de invitaciones de `docs/ROLES.md`.
