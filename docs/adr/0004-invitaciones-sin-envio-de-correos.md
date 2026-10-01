# ADR-0004 · Invitaciones sin envío de correos

Fecha: 2026-10-01 · Estado: aceptado

## Contexto
La versión 1.0 usaba enlaces con un código de un solo uso enviados por correo. Eso exige
enlaces que abran la app de escritorio y un servicio de correo; el plan gratuito de Supabase
limita mucho los envíos.

## Decisión
Una invitación es una fila con el correo invitado, el rol y la fecha de vencimiento (7 días).
Cuando alguien inicia sesión con ese correo **verificado**, la app le muestra la invitación y
puede aceptarla o rechazarla. Quien invita avisa por el medio que quiera.

## Consecuencias
- Sin enlaces especiales ni servicio de correo propio.
- La seguridad depende de que el correo esté verificado: la verificación por código queda activada.
- El único correo que envía Supabase es el código de verificación y el de recuperación.
