# Spec F7 · Eliminar mi cuenta

Funcionalidades: CU-08.
Estado: borrador. Decisiones de producto tomadas por el responsable el 30 oct: el tiempo registrado de la persona
se borra con la cuenta; si es la única propietaria de un equipo con más personas, no puede eliminarla hasta ceder
la propiedad; si está sola en un equipo, ese equipo se borra con la cuenta. El despliegue lo hace el responsable.

## Objetivo
Desde *Ajustes → Cuenta*, la persona elimina su cuenta de Pulso: se borra en la nube y en este equipo, y la app
vuelve a la pantalla de acceso. Con esa cuenta ya no se puede iniciar sesión.

## Decisiones

| # | Decisión |
|---|---|
| D-1 | **Bloqueo por propiedad.** Si la persona es `owner`, no hay otro `owner` y el equipo tiene más miembros, no se borra nada y el mensaje nombra el equipo: «Antes de eliminar tu cuenta, pasa la propiedad de «Equipo» a otra persona» (P0001). |
| D-2 | **Equipos donde está sola**: se borran enteros (las llaves en cascada se llevan proyectos, tareas y tiempo). |
| D-3 | **Lo que se borra**: perfil, membresías, actividad, cierres, reportes personales, tiempo registrado (`time_entries`, en cascada desde `auth.users`) y la cuenta de acceso. En este equipo: bloques, tiempo, cierres, tareas en caché y los ajustes de la sesión; también la clave de IA guardada. |
| D-4 | **Lo que se queda** en los equipos donde hay más personas: proyectos, tareas, reglas y el equipo mismo, con `created_by = null`; los archivos de evidencia (su dueño en Storage pasa a nulo, si no Supabase no deja borrar la cuenta); las filas de auditoría, con quien las hizo en nulo («Exmiembro») y una fila `member_left` por cada equipo. Los archivos de evidencia de los equipos borrados por D-2 quedan huérfanos en el bucket (límite aceptado). |
| D-5 | **Orden**: nube → datos locales → cerrar sesión. Si falla la nube, se muestra el error en el diálogo y **no** se borra nada local. |
| D-6 | **Confirmación**: diálogo de peligro que explica qué se borra, ofrece «Exportar mis datos antes» y solo deja confirmar tras escribir el correo de la cuenta. |
| D-7 | Las preferencias de la app (tema, idioma, ajustes del sensor) **no** son de la cuenta y se conservan. |

## Contratos

- Datos (migración `supabase/migrations/20261031000001_eliminar_cuenta.sql`): `teams.created_by`,
  `classification_rules.created_by`, `projects.created_by` y `tasks.created_by` pasan a admitir nulo con
  `on delete set null`. Función `delete_my_account_data(p_user) → void` (solo `service_role`: una sesión no puede
  llamarla sin borrar la cuenta): aplica D-1, D-2 y D-4.
  No borra `auth.users`.
- Edge Function `delete-account` (POST, con el JWT de la persona): se comprueba la persona del JWT y, con el cliente de
  servicio, `delete_my_account_data(id)` → `auth.admin.deleteUser(id)`. Respuestas: 401 sin sesión, 409 con `message` si la
  base lo bloquea (P0001), 500 si falla otra cosa, 200 al terminar.
- Nube: `deleteAccount(): Promise<void>` en `src/cloud/contract.ts`.
- Puente: `localDataClear(): Promise<void>` (comando de Rust `local_data_clear`).

## Criterios de aceptación
- AC-1 Dado que soy la única propietaria de un equipo con más miembros, cuando pido eliminar mi cuenta, entonces
  falla con un mensaje que nombra el equipo y no se borra nada.
- AC-2 Dado un equipo donde estoy sola, cuando elimino mi cuenta, entonces el equipo desaparece.
- AC-3 Dado un equipo con más personas, cuando elimino mi cuenta, entonces queda una fila `member_left` y, tras
  borrar la cuenta de acceso, sus proyectos, tareas y el equipo siguen con `created_by` nulo y no queda mi
  actividad, mi tiempo ni mi perfil.
- AC-4 La Edge Function responde 401 sin sesión, 409 con el mensaje si la base bloquea (sin borrar la cuenta de
  acceso) y 200 tras borrar la cuenta de acceso de quien llama.
- AC-5 `local_data_clear` vacía bloques, tiempo, cierres, tareas en caché y los ajustes de sesión, y conserva las
  preferencias de la app.
- AC-6 En *Ajustes*, el botón de confirmar sigue desactivado hasta escribir el correo; al confirmar se borran los
  datos locales y se cierra la sesión (la cuenta ya no entra); si la nube lo bloquea, el mensaje se ve en el
  diálogo y no se borra nada local.

## Fuera de alcance
Borrar los archivos de evidencia de Storage; periodo de gracia o recuperar la cuenta; avisar por correo.

## Cómo se comprueba
`npm run verify` y `npm run verify:rust`. A mano, tras desplegar la migración y la función: crear una cuenta,
eliminarla desde *Ajustes* y comprobar que no puede volver a entrar.
