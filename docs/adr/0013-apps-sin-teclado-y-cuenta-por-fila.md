# ADR-0013 · Apps sin teclado (mínimo) y una cuenta por fila local

Fecha: 2026-10-07 · Estado: aceptado (por StehvenObando)

## Contexto
- En la prueba de 30 min sin red, de 08:13 a 08:47 (34 min leyendo en Readest), *Mi día* mostró 7,6 min de Readest y 26 min de «Sin actividad» en 5 tramos. Con el umbral en 3 min, cada pausa de lectura sin teclado se volvía inactividad. La subida sin red funcionó: todo se subió al volver la conexión.
- Las filas locales no guardaban la cuenta. Si dos personas usan el mismo PC, lo pendiente de una se subía con la sesión de la siguiente, y *Mi día* les mostraba lo mismo a las dos.

## Decisión
- **Apps sin teclado (TA-15, versión mínima).** Una regla de clasificación puede llevar `keep_active: true`.
  - Si alguna regla que coincide con la ventana delante lo tiene, el umbral de inactividad pasa a `max(umbral, 30 min)`. Aplica al bloque y al aviso.
  - La categoría sigue siendo la de la primera regla que coincide: una regla del equipo puede hacer productivo a Readest sin perder `keep_active`.
  - Lista fija en `rules/default.json`: lectores de PDF y libros (Readest, SumatraPDF, Acrobat, Foxit, Kindle, Calibre), VLC y reuniones (Zoom, Teams, Webex, Meet). El editor de reglas sigue en F5 (TA-11).
- **Una cuenta por fila.** `active_team_set(team_id?, user_id?)` amplía el comando de ADR-0007.
  - Rust guarda la cuenta en `kv_settings` (`active_user_id`) y la escribe en `user_id` de cada fila nueva: bloques, entradas, temporizador y cierres (migración local 4).
  - `sync_pending` solo devuelve filas del equipo activo **y** de la cuenta actual. Sin cuenta no hay nada pendiente.
  - *Mi día* y la edición de entradas ven las filas de la cuenta actual y las sin cuenta (historial de F1 y lo registrado sin sesión).
  - Al cambiar de cuenta se cierra el bloque abierto, para que no quede a nombre de la siguiente.

## Consecuencias
- Sin migración en Supabase: `user_id` en la nube ya lo pone `auth.uid()`.
- Las filas sin cuenta nunca se suben (ya no se suben ahora: necesitan cuenta).
- Una app de la lista usada 30 min sin teclado cuenta como uso aunque la persona se haya ido. Es el límite conocido de la versión mínima; detectar audio o video queda fuera.
