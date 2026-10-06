# F1 · Medición y verificación con la app real

Equipo: Windows 11, 8 núcleos, poca RAM libre (0,7–1 GB durante las pruebas). Fechas en UTC salvo que se diga.
Compilación: `npm run tauri build` y `npx tauri build --no-bundle`, con `VITE_BRIDGE=tauri`.
Base de pruebas nueva: la anterior se conservó en `%APPDATA%\co.pulso.desktop.respaldo-F1`.

## 1. Instaladores (G1-5)

| Archivo | Tamaño | Meta | Estado |
|---|---|---|---|
| `bundle/msi/Pulso_0.1.0_x64_en-US.msi` | 4,52 MiB | < 20 MB | Cumple |
| `bundle/nsis/Pulso_0.1.0_x64-setup.exe` | 3,18 MiB | < 20 MB | Cumple |
| `pulso.exe` (sin instalador) | 12 MB | — | Dato |

## 2. Medición de una hora (AC-19, ADR-0006)

`docs/spikes/F1-medicion-1h.csv`: 60 muestras cada 60 s, del 2026-10-05T23:02:39 al 2026-10-06T00:05:08,
con el equipo en uso normal. Suma de `pulso.exe` y sus 6 procesos de WebView2.

| Criterio | Resultado | Meta | Estado |
|---|---|---|---|
| Cierres inesperados | 0 (un solo pid durante toda la hora: 6172) | 0 | Cumple |
| CPU media | 0,027 % (máxima 1,59 %) | < 1 % | Cumple |
| Memoria privada máxima | 74,0 MB (mínima 10,9 MB) | < 120 MB | Cumple |
| Media últimos 10 min frente a primeros 10 | 14,1 MB frente a 40,4 MB (−65 %) | no más de +15 % | Cumple |
| Conjunto de trabajo (solo dato) | 63,7 a 308 MB | — | Dato |

Advertencia: el equipo tenía poca RAM libre y Windows recortó la memoria de los procesos; por eso la privada baja
con el tiempo. Las cifras son válidas para el criterio, pero optimistas. Medición sin presión de memoria: 83,5 MB
(primera prueba, ~80 s).

## 3. Solapamiento de bloques (corrección del 2026-10-05)

Consulta usada (sobre `activity_blocks_local`):

```sql
SELECT a.started_at AS a_inicio, a.ended_at AS a_fin, a.category AS a_cat,
       b.started_at AS b_inicio, b.ended_at AS b_fin, b.category AS b_cat
FROM activity_blocks_local a
JOIN activity_blocks_local b
  ON b.started_at > a.started_at
 AND b.started_at < a.ended_at   -- b empieza antes de que termine a
WHERE a.started_at >= '2026-10-05T23:01:00Z'
ORDER BY a.started_at
```

Resultado en la sesión de una hora: **0 filas**. Hubo 6 bloques de inactividad reales (de 335 a 1087 s) y cada uno
empieza exactamente donde termina el bloque anterior.

Casos pedidos:

| Caso | Qué se hizo | Resultado |
|---|---|---|
| Fin de descanso | Descanso 23:00:00–23:00:12; el siguiente bloque empieza 23:00:14 | Sin solape |
| Fin de pausa | Pausa 23:00:23–23:00:38; el siguiente bloque empieza 23:00:38 | Sin solape |
| Cerrar y reabrir | Cierre 23:00:48; al reabrir el primer bloque empieza 23:01:05 | Sin solape |
| Los tres casos **con inactividad mayor que el umbral** | No se pudo: exige no tocar el equipo durante el umbral y el equipo estaba en uso | No verificado en la app real; cubierto por pruebas (§5, AC-3) |

Sí apareció un solape (2 filas, 22:58:40–22:58:59) cuando un script abrió **dos instancias a la vez**: cada una tenía su
sensor. Corregido con instancia única (§4).

## 4. Fallos encontrados en la app real y corregidos

| Fallo | Corrección | Comprobado en la app real |
|---|---|---|
| La inactividad retrocedía y se solapaba con bloques guardados al reabrir, al despertar o al terminar un descanso o pausa | Piso temporal en el motor (`sensor/engine.rs`) | §3: 0 solapes en una hora |
| Las apps ocultas se clasificaban por proceso | Siempre `neutral`, sin título (AC-20) | 25 bloques `App oculta`, todos `neutral`, 0 con título, 0 con IA |
| Se podían abrir dos instancias (dos sensores escribiendo la misma base) | Archivo de bloqueo exclusivo (`instance.rs`, `File::try_lock`) y aviso con `MessageBoxW` | La segunda instancia muestra el aviso «Pulso» y termina; queda una sola ventana |
| Tras ~2 h abierta, cerrar la ventana dejó `pulso.exe` vivo sin ventana y **el sensor siguió registrando** (última escritura 33 min después del cierre) | Al pedir el cierre se detiene el servicio (`Tracker::shutdown` deja de aceptar lecturas) y un vigilante termina el proceso si sigue vivo a los 5 s. Registro en release (`Pulso.log`) con el ciclo de vida | Cierre en 0,3 s; última escritura 9 ms después de pedir el cierre; `Pulso.log`: «cierre: ventana cerrada; se detiene el sensor» y «salida completa» |

La causa exacta de que el proceso siguiera vivo **no está confirmada**. En el código de Tauri 2.12.1
(`tauri-runtime-wry`), la salida depende de que al destruirse la última ventana llegue `ExitRequested` y el bucle de
eventos termine; en el proceso atascado la ventana y WebView2 ya no existían, todos los hilos estaban en espera y el
sensor seguía escribiendo, lo que indica que el bucle no llegó a terminar. No se pudo reproducir en ejecuciones cortas
(cinco cierres correctos) y el build no tenía registro. La corrección no depende de la causa; si vuelve a pasar,
`Pulso.log` mostrará «cierre» sin «salida completa» y el aviso del vigilante.

## 5. Criterios de aceptación AC-1 a AC-20

Pruebas Rust: `cargo test` en `src-tauri` (62). Pruebas de interfaz: `vitest` (111 con las de base de datos).

| AC | Estado | Evidencia |
|---|---|---|
| AC-1 Cambio de app cierra y abre bloque en < 4 s | Cumple | Prueba `sensor::engine::tests::app_change_closes_and_opens_within_one_tick` (el corte cae en la misma lectura de 2 s). App real: la sesión de una hora alterna `brave`, `App oculta`, `pulso` y `explorer` con fin de uno igual al inicio del siguiente |
| AC-2 Fusión de bloques < 10 s entre dos iguales | Cumple | Pruebas `short_block_between_same_app_is_merged`, `long_enough_block_between_is_not_merged`, `short_block_between_different_apps_is_kept`. App real: no se aisló el caso a propósito |
| AC-3 Inactividad: cierre en la última interacción y bloque `idle` | Cumple | Pruebas `idle_closes_active_block_at_last_input`, `activity_after_idle_starts_a_new_block`, `tracker::tests::idle_threshold_from_settings_is_applied`, `idle_after_a_long_gap_does_not_go_back_over_existing_blocks`, `idle_at_startup_starts_after_the_floor`, `idle_after_a_break_or_pause_starts_when_it_ended`, `a_new_session_does_not_overlap_the_previous_one`. App real: 6 bloques `idle` en una hora, sin solapes. **No verificado en la app real** que se aplicó el umbral de 3 min y no el de 5 (el bloque más corto duró 335 s) |
| AC-4 Cierre inesperado: pérdida máxima 10 s | Cumple | Pruebas `tracker::tests::data_reaches_disk_at_most_10s_late`, `engine::tests::every_tick_persists_the_open_block`, `store::tests::data_survives_reopen_on_disk`. App real: al terminar a la fuerza el proceso atascado, la última escritura en la base era de las 20:28:55 (hora local) y la comprobación posterior fue a las 20:29:03, dentro del margen de 10 s. Cierre normal: el último bloque termina en la hora exacta del cierre (22:24:49 en la primera prueba) |
| AC-5 Títulos con chatgpt, claude, gemini, deepseek o copilot → `ai` | Cumple | Pruebas `classifier::tests::ai_titles_set_category_and_tool`, `tracker::tests::ai_title_is_classified_and_shown_decrypted`. App real: 5 bloques `brave` con título de Claude → `ai`, `ai_tool = Claude` (220 s) |
| AC-6 Procesos `ollama` o `lm studio` → `ai` | Cumple (solo pruebas) | Prueba `classifier::tests::local_ai_processes_are_ai`. **No verificado en la app real**: Ollama y LM Studio no están instalados |
| AC-7 Clasificador puro con prueba por regla | Cumple | `classifier::tests::every_default_rule_matches_itself` recorre las 20 reglas de `rules/default.json`; además `first_match_wins_and_ai_beats_browser_distraction`, `team_rules_win_over_defaults`, `no_match_is_neutral` |
| AC-8 Pausa: solo bloque `paused`, app «Pulso», sin título | Cumple | Pruebas `privacy_pause_writes_only_a_paused_block_without_title`, `tracker::tests::privacy_pause_hides_everything_and_expires_by_itself`. App real: botón «Pausar 15 min» por UI Automation → bloque `paused` 23:00:23–23:00:38, `Pulso`, sin título |
| AC-9 Título cifrado: ilegible fuera de Pulso | Cumple | Pruebas `crypto::tests::ciphertext_does_not_contain_plaintext`, `tracker::tests::title_is_stored_encrypted`. App real: búsqueda del título de la terminal en uso («front-smartwatch» y «DESKTOP-») en los bytes de `pulso.db-wal`: 0 coincidencias, con bloques de esa app guardados |
| AC-10 Clave creada al primer arranque, en el almacén seguro | Cumple | Prueba `secrets::tests::key_is_created_once_and_reused` (almacén real de Windows). App real: `cmdkey /list` muestra `LegacyGeneric:target=title-key.pulso`; no hay archivo de clave en `%APPDATA%\co.pulso.desktop` |
| AC-11 La pausa termina sola | Cumple (solo pruebas) | Prueba `tracker::tests::privacy_pause_hides_everything_and_expires_by_itself` (pausa de 1 min termina sola y el bloque acaba en la hora exacta). **No verificado en la app real**: se reanudó a mano, no se esperaron 15 min |
| AC-12 Temporizador; segundo inicio da error claro | Cumple | Pruebas `store::tests::timer_start_stop_and_double_start_fails`, `tracker::tests::timer_flow_and_double_start`, interfaz `un segundo temporizador mientras hay uno en marcha da un error claro`. App real: iniciar y detener por UI Automation → entrada `timer` de 8 s (base respaldada, 22:26:06–22:26:14) |
| AC-13 Entrada manual: rechaza fin anterior, > 24 h y futuro | Cumple (solo pruebas) | Pruebas `store::tests::manual_entry_validation`, `tracker::tests::manual_entries_are_validated`, interfaz `las entradas manuales se validan igual que en Rust (AC-13)` y `explica el error si el fin es anterior al inicio`. **No verificado en la app real** (el formulario no se usó en release) |
| AC-14 Descanso cierra el bloque y abre `break` | Cumple | Pruebas `break_closes_current_block_and_opens_break`, `tracker::tests::break_creates_a_break_block`. App real: «Tomar un descanso» / «Terminar descanso» → bloque `break` 23:00:00–23:00:12 |
| AC-15 `day_view`: bloques del día local, totales y jornada | Cumple | Pruebas `views::tests::totals_workday_and_all_categories_present`, `local_day_bounds_use_the_time_zone`, `block_crossing_midnight_is_clipped_to_each_day`, `empty_day_has_no_workday`. App real: *Mi día* mostró «Jornada de 16:53 a 17:24» con la franja y el reparto |
| AC-16 Con el sensor real, datos reales y sin «Datos de ejemplo» | Cumple | Prueba de interfaz `con el sensor real desaparece la etiqueta «Datos de ejemplo» (AC-16)`. App real: captura de la ventana con la jornada real del día (no la de ejemplo, 08:12–16:31). La etiqueta no aparece en la captura |
| AC-17 *Mi día* se actualiza cada 30 s con la ventana visible | Cumple (solo pruebas) | Pruebas de interfaz `vuelve a leer el día cada 30 s mientras la ventana está visible`, `no actualiza mientras la ventana está oculta`, `un fallo al actualizar no borra lo que ya se mostraba`. **No verificado en la app real** |
| AC-18 Todo funciona sin internet | No verificado | No se cortó la red. Pulso no tiene código de red en F1, pero sus procesos WebView2 abrieron 2 conexiones a `52.96.185.210:443` (Microsoft) durante la prueba; en la hora de medición, 2 de 60 muestras tenían alguna conexión externa. Pendiente: prueba con la red cortada o con una regla de firewall para `pulso.exe` y WebView2 |
| AC-19 Una hora: memoria privada < 120 MB y CPU < 1 % | Cumple | §2 y `docs/spikes/F1-medicion-1h.csv` |
| AC-20 Apps ocultas: «App oculta», sin título, `neutral`, hacia delante | Cumple | Pruebas `tracker::tests::hidden_app_is_always_neutral_and_not_retroactive`, `hidden_apps_are_not_recorded_by_name_or_title`, interfaz `guarda el umbral y las apps ocultas, y las normaliza`. App real: Ajustes por UI Automation guardó `["windowsterminal"]`; 25 bloques `App oculta` `neutral` sin título; los 5 bloques de `WindowsTerminal` anteriores conservan su nombre |

## 6. Sin verificar y por qué

- Los tres casos de solapamiento combinados con inactividad real, y que el sensor use 3 min y no 5: exigen no tocar el
  equipo durante el umbral; se cubren con pruebas automáticas.
- AC-18 sin red: no se cortó la conexión ni se crearon reglas de firewall.
- AC-6, AC-11, AC-13 y AC-17 en la app real (ver tabla).
- Revisión visual de las pantallas nuevas en 380, 800 y 1280 px y en tema claro y oscuro (C3 de `docs/PLAN.md`).
- La causa exacta del proceso que siguió vivo tras cerrar (§4).
