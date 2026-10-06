# ADR-0009 · Dominio del sitio web y políticas del equipo

Fecha: 2026-10-06 · Estado: aceptado (por StehvenObando) · Precisa D-05

## Contexto
El responsable pidió que owner y admin sepan cuánto tiempo pasa cada persona en cada sitio web, que puedan
marcar sitios no permitidos y que decidan si su equipo permite ocultar apps. El título de la ventana no
basta para saber el sitio, y D-05 impide que salga del equipo.

## Decisión
- **Dominio, no URL.** El sensor lee la barra de direcciones de los navegadores (Brave, Chrome, Edge, Opera,
  Vivaldi, Firefox) con UI Automation y se queda solo con el **dominio** (`perplexity.ai`). La ruta, la
  búsqueda y el fragmento se descartan en el momento de leer; no se guardan en ningún sitio. Medición en S-5.
- **D-05 precisada:** los títulos de ventana y las URL completas nunca salen del equipo; el dominio **sí** se
  sincroniza, tras aceptar el consentimiento `2026-10-v2`.
- **Reglas por dominio** (`match_type = 'domain'`): coinciden con el dominio y sus subdominios. Las reglas
  por defecto detectan los sitios de IA más usados por su dominio, antes que por el título.
- **Sitios no permitidos:** `classification_rules.not_allowed = true`, siempre con categoría distracción.
  Se marcan; **no se bloquean** (bloquear exige una extensión o permisos de administrador, fuera de v1).
- **Política de apps ocultas:** `teams.settings.policies.allow_hidden_apps`, solo la cambian owner y admin
  (`set_team_policy`, auditado). Con `false`, Rust no aplica la lista personal de apps ocultas desde ese
  momento; lo ocultado antes no se recupera porque nunca se guardó.
- **Comando nuevo** `team_policy_set(policy)`. `ActivityBlock` y `SyncBlock` ganan `domain`.
- **Consentimiento `2026-10-v2`:** quien aceptó la versión anterior debe aceptar la nueva; hasta entonces no se sube nada.

## Consecuencias
- Migración `20261007000001` con su prueba, y migración local 3 en SQLite (`activity_blocks_local.domain`).
- *Features* nuevas del crate `windows` (ya aprobado), anotadas en `docs/STACK.lock.md`.
- Se adelanta a F2 una parte de la fila 23 de `docs/ROLES.md` (dominios y política de apps ocultas).
  El editor general de reglas sigue en F5 (TA-11).
- Firefox no está medido. Si el texto de la barra no es una dirección (se está escribiendo), el bloque queda sin dominio.
