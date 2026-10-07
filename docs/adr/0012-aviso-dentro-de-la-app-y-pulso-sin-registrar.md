# ADR-0012 · Aviso dentro de la app y Pulso no se registra a sí mismo

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
En la prueba real:
- El aviso de sitio no permitido (ADR-0010 y ADR-0011) solo se veía en *Mi día*, y solo mientras ese bloque era el último. Estando en *Ajustes*, o con las notificaciones de Windows apagadas, no se leía ningún mensaje.
- La propia ventana de Pulso aparecía como una app en uso: 85 bloques y 36 min en un día, justo el tiempo que la persona pasa mirando el resultado. Ese tiempo quitaba protagonismo a la app real.
- Los datos del día muestran que el tiempo no se pierde (los bloques suman lo mismo que el reloj, sin huecos ni solapes), pero se asignaba mal: a Pulso, y a «sin actividad» cuando se lee sin tocar el teclado.

## Decisión
- **Aviso general en la interfaz.** Cuando Rust detecta la entrada a un sitio no permitido, además del sonido, el parpadeo del icono y la notificación de Windows, emite un evento local `not-allowed-alert` con `{ domain, at }`.
  - El evento solo viaja a la ventana de la propia app; no sale del equipo.
  - La interfaz lo muestra como un aviso fijo arriba a la derecha, en cualquier pantalla. Queda hasta que la persona pulsa *Entendido*, para verlo al volver del navegador. Máximo 3; un mismo sitio no se duplica.
  - Se escucha con `listen`: ya está permitido por `core:default`, así que no se tocan las capacidades de Tauri.
  - Se quita el aviso de *Mi día*, que lo duplicaba.
- **Pulso no se registra a sí mismo.** Si la ventana en primer plano es Pulso, el sensor cierra el bloque abierto y no abre otro hasta que se vuelve a otra app.
  - Ese tiempo no cuenta para ninguna app. Tampoco se avisa mientras se mira Pulso.
  - Los bloques especiales de pausa y descanso, que se llaman «Pulso» por diseño, no cambian.

## Consecuencias
- Sin comando nuevo: el evento no es un comando de Rust (§6 de `docs/ARQUITECTURA.md` solo lista comandos).
- Una app que se usa antes y después de mirar Pulso queda en dos bloques seguidos, con un hueco entre ellos.
- Leer o estar en una reunión sin teclado: resuelto en versión mínima en ADR-0013.
