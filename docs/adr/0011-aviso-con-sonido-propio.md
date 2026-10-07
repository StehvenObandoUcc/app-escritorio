# ADR-0011 · El aviso suena aunque Windows tenga las notificaciones apagadas

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
En la prueba real, el aviso de sitio no permitido (ADR-0010) no sonó. La regla y la política sí habían llegado al
sensor. La causa: Windows tenía apagado *Recibir notificaciones de apps y otros remitentes*
(`HKCU\Software\Microsoft\Windows\CurrentVersion\PushNotifications\ToastEnabled = 0`). El plugin de notificaciones
descarta ese error sin decir nada.

## Decisión
- Al avisar, además de la notificación de Windows:
  - **Sonido propio** con `MessageBeep(MB_ICONEXCLAMATION)`.
  - **Parpadeo del icono** en la barra de tareas con `request_user_attention(Informational)`.
  - Ambos funcionan aunque las notificaciones estén apagadas.
- Comando nuevo `notifications_status()` → `{ windowsToastsEnabled }`. *Ajustes* explica qué pasa si están apagadas y dónde activarlas.
- El registro anota «aviso de sitio no permitido enviado», sin el dominio (ARQUITECTURA §10).

## Consecuencias
- *Feature* nueva `Win32_System_Diagnostics_Debug` del crate `windows` (ya aprobado).
- Fila nueva en `docs/ARQUITECTURA.md` §6 y en el contrato del puente.
- Si el sonido del sistema está silenciado, solo queda el parpadeo del icono.
