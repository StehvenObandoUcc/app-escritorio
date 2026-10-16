# Validación en real (F1 a F5)

Lo que las pruebas automáticas no pueden comprobar: Supabase real (`pulso-dev`), la Edge Function, proveedores de IA de verdad y la app de escritorio. Se hace **en orden**: cada bloque supone que el anterior pasó.

- **Quién:** *Tú* = la persona dueña del proyecto (credenciales, secretos, Supabase, uso de la app). *Agente* = lo comprueba un agente en este equipo, sin tocar Supabase.
- **Resultado:** escribe `OK`, o `FALLA:` con el mensaje exacto o una captura. Un paso que falla detiene el bloque.
- Antes de empezar: `npm run tauri dev` abierto y dos cuentas del mismo equipo (A = owner, B = member). Para algunos pasos hace falta una tercera cuenta: C = viewer, o alguien fuera del proyecto.
- Los scripts no imprimen las variables y no corren si falta alguna. Prepáralas así en PowerShell (la contraseña no se ve al escribirla):

  ```powershell
  $env:PULSO_SUPABASE_URL = (Select-String .env -Pattern '^VITE_SUPABASE_URL=(.*)').Matches.Groups[1].Value
  $env:PULSO_SUPABASE_ANON_KEY = (Select-String .env -Pattern '^VITE_SUPABASE_ANON_KEY=(.*)').Matches.Groups[1].Value
  $env:PULSO_EMAIL = '<correo de la cuenta>'
  $s = Read-Host 'Contraseña' -AsSecureString; $env:PULSO_PASSWORD = [Net.NetworkCredential]::new('', $s).Password
  ```

  Al terminar: `Get-ChildItem Env:PULSO_* | Remove-Item`.

## 0 · Preparación

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 0.1 | Tú | `npm run db:push` y `npm run db:types` | Aplica `20261011000001_ia_y_reportes.sql`; `database.types.ts` trae `report_runs` y `save_report` | OK (8 oct) |
| 0.2 | Tú | Clave **nueva** de DeepSeek, solo para Pulso y con poco saldo. `npx supabase@2.119.0 secrets set DEEPSEEK_API_KEY=… AI_TRIAL_ENABLED=true AI_TRIAL_MODEL=<modelo>` (la clave se escribe en la terminal, nunca en un archivo) | El comando termina sin error | OK (15 oct) |
| 0.3 | Tú | `npx supabase@2.119.0 functions deploy ai-trial --use-api` | `Deployed Function ai-trial` | OK (15 oct) |
| 0.4 | Agente | `npm run verify` y `npm run verify:rust` en la rama `feat/f4-ia-y-reportes` | Todo en verde | OK (8 oct: 431 + 115 pruebas) |

## F1 · Sensor y *Mi día* (regresión tras los cambios de F4 en Rust)

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 1.1 | Tú | Trabaja 5 minutos con dos apps y abre *Mi día* → *Detalle* | Aparecen los bloques con su categoría y duración; el temporizador arranca y se detiene || OK (15 oct). Solo cuenta con teclado o ratón activos; sin ellos, pasado el umbral, es inactividad (esperado) |
| 1.2 | Tú | Abre ChatGPT o Claude en el navegador durante 2 minutos y vuelve a *Mi día* → *Detalle* | El bloque sale como IA, con la herramienta y un selector «Tipo de uso de IA» | OK (16 oct). Sale como IA con «Sin etiquetar» hasta elegir el tipo |

## F2 · Cuentas, equipos y sincronización

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 2.1 | Tú | Mira el indicador de subida (abajo en el menú) con red | Pasa a «Al día» en menos de un minuto; nunca «Error» (el error del 8 oct quedó corregido en `e89558e`) | OK (16 oct) |
| 2.2 | Tú | Entra a un sitio marcado «no permitido» por el equipo (ADR-0012) | Aparece el aviso dentro de Pulso en cualquier pantalla, además de la notificación || OK (15 oct, youtube.com) |
| 2.3 | Tú | Mira Pulso durante 1 minuto y luego *Mi día* | Pulso no aparece como un bloque propio || OK (15 oct) |
| 2.4 | Tú | Con A: invita a C como viewer; con C: acepta con el código; con A: cambia un rol. En el panel de Supabase → *Table Editor* → `audit_log` | Todo funciona igual que en F2 (la corrección de permisos de F4 no rompió nada) y `audit_log` tiene las filas de la invitación y el cambio de rol | OK (16 oct) |

## F3 · Proyectos y tareas

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 3.1 | Tú | Con A: crea una tarea para B con evidencia «Hoja de cálculo». Con B: tómala, empiézala y envíala con un XLSX. Con A: pide cambios; con B: reenvíala; con A: apruébala | Cada paso funciona y el historial de la tarea lo muestra (regresión tras cerrar funciones internas) | OK (16 oct). B no recibe aviso cuando A pide cambios (P2, F6) |
| 3.2 | Tú | Con una cuenta del proyecto, abre el archivo de evidencia de 3.1 y copia la dirección que se abre en el navegador | El archivo abre en el navegador del sistema | OK (16 oct) |
| 3.3 | Tú | Con una cuenta **fuera del proyecto**: `$env:PULSO_EVIDENCE_URL='<dirección>'; node scripts/f3-evidencia-ajena.mjs` | `BLOQUEADO` al descargar y al pedir enlace, y `CUMPLE`. Pasados 60 s, el enlace compartido también `BLOQUEADO` | OK (16 oct) |
| 3.4 | Tú | Recorre *Proyectos*, una tarea y *Ajustes* con la app real | Ninguna pantalla en blanco ni errores de CSP | OK (16 oct) |

## F4 · IA y reportes (puerta G4)

### Atajo: validación automática de la parte servidor

El script `scripts/f4-validar-nube.mjs` comprueba **solo la parte servidor** de los pasos 4.2 a 4.7 y 4.19 con tres cuentas de prueba (A = owner, B = member, C = viewer) y escribe `CUMPLE`, `FALLA` u `OMITIDO` por paso. Lo visual de esos pasos sigue siendo manual: las cifras y «Validado en el servidor» en 4.2, la lista «Sobre» sin «Todo el equipo» en 4.5, el formulario oculto al viewer en 4.7 y el texto del aviso de límite en 4.4. Los pasos 4.1, 4.8 a 4.18, 4.20 y 4.21 también siguen siendo manuales.

- **Requisitos:** 0.1, 0.2 y 0.3 hechos (sin ellos `ai-trial` responde 503 y 4.2 falla).
- Si las cuentas o el equipo no existen, los crea (el registro no exige verificar el correo).
- La primera ejecución imprime el id del equipo; en las siguientes pon `$env:PULSO_TEAM_ID` para no crear otro equipo.
- Gasta el cupo gratis de B de ese día (hasta 5 reportes) y tarda unos 3 minutos por el paso 4.4.

```powershell
$env:PULSO_SUPABASE_URL = (Select-String .env -Pattern '^VITE_SUPABASE_URL=(.*)').Matches.Groups[1].Value
$env:PULSO_SUPABASE_ANON_KEY = (Select-String .env -Pattern '^VITE_SUPABASE_ANON_KEY=(.*)').Matches.Groups[1].Value
$env:PULSO_EMAIL_A = '<correo de A>'; $env:PULSO_EMAIL_B = '<correo de B>'; $env:PULSO_EMAIL_C = '<correo de C>'
$s = Read-Host 'Contraseña (la misma para las tres cuentas)' -AsSecureString; $env:PULSO_PASSWORD = [Net.NetworkCredential]::new('', $s).Password
# Opcional, para reutilizar un equipo (el script imprime su id al terminar):
# $env:PULSO_TEAM_ID = '<id del equipo>'
node scripts/f4-validar-nube.mjs
```

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 4.1 | Tú | *Mi día* → *Detalle*: etiqueta un bloque de IA como «Código»; espera a «Al día» | La etiqueta se queda al recargar | OK (16 oct) |
| 4.2 | Tú | Con B: *Reportes* → Mi trabajo · Hoy · Gratis → Generar | Sale el reporte con cifras, «Datos hasta HH:MM», «Validado en el servidor» (en Supabase, `report_runs.validated_by = server`) y el texto marcado como redactado por IA. En las cifras aparece «Tiempo de IA por tipo de uso · Código» (AC-29) || OK (16 oct, servidor y pantalla) |
| 4.3 | Tú | Repite 4.2 sin cambiar nada | «Ya había un reporte con los mismos datos…» y el historial no crece || OK (16 oct) |
| 4.4 | Tú | Con B: genera en Gratis otros reportes **distintos** (ayer, esta semana, la semana pasada; hoy en inglés) esperando 30 s entre uno y otro, hasta el sexto | El sexto muestra «Usaste tus 5 reportes gratis de hoy…» (AC-14) || OK (16 oct) |
| 4.5 | Tú | Con B: mira la lista «Sobre» | No aparece «Todo el equipo» (un member no genera el reporte de equipo) || OK (16 oct) |
| 4.6 | Tú | Con A (owner): genera «Todo el equipo» · Ayer | Sale con totales del grupo, sin nombres; en Supabase → `audit_log` hay una fila `report_generated` (AC-27) || OK (16 oct) |
| 4.7 | Tú | Con C (viewer): abre *Reportes* | Ve el reporte de equipo de 4.6 en el historial; no ve el formulario ni reportes personales || OK (16 oct) |
| 4.8 | Tú | `npx supabase@2.119.0 secrets set AI_TRIAL_ENABLED=false`; genera un reporte gratis nuevo; luego vuelve a `true` | «El modo Gratis está apagado en este momento…» | OK (16 oct) |
| 4.9 | Tú | *Ajustes → IA*: proveedor, modelo y clave válidos → Guardar → Probar conexión | «Conexión correcta: el proveedor respondió.» | OK (16 oct) |
| 4.10 | Tú | Cambia la clave por una inválida → Probar conexión. Luego un modelo inexistente. Luego sin red | Mensajes claros: clave no válida, modelo no encontrado, sin conexión (AC-18) | OK (16 oct) |
| 4.11 | Tú | Escribe `http://api.ejemplo.com/v1` como URL y guarda | Se rechaza: debe empezar por https:// (AC-20) | OK (16 oct) |
| 4.12 | Agente | Tras 4.9, busca la clave en `%APPDATA%\co.pulso.desktop\pulso.db` (tabla `kv_settings`) y en el almacenamiento del WebView | No aparece en ningún lado; solo en el Administrador de credenciales de Windows (`pulso` / `ai-key`) (AC-19) | OK (16 oct): 0 coincidencias en pulso.db y en el WebView; ai-key.pulso en el Administrador de credenciales |
| 4.13 | Tú | *Reportes* → Mi proveedor de IA · Ayer → Generar | Reporte en modo «Mi proveedor de IA», validado en este equipo | OK (16 oct) |
| 4.14 | Tú | *Reportes* → Manual: copia el prompt, pégalo en ChatGPT o Gemini; pega primero un texto cualquiera y luego la respuesta real | El texto cualquiera se rechaza con el motivo; la respuesta real produce el reporte (AC-21) | OK (16 oct): el texto sin JSON y las cifras inventadas se rechazan; la respuesta válida (Claude, semana pasada) produce el reporte. ChatGPT no siempre respeta el formato (F6-7) |
| 4.15 | Tú | En un reporte: Markdown, JSON, CSV y PDF (imprimir → Microsoft Print to PDF) | Los tres archivos quedan en *Descargas* y abren bien; el PDF solo trae el reporte, sin el menú (AC-26) | OK (16 oct) |
| 4.16 | Tú | Cambia la app a inglés y genera un reporte nuevo | Pantalla y texto de la IA en inglés (AC-30) | OK (16 oct) |
| 4.17 | Tú | Mañana: abre *Reportes* | Los reportes de hoy siguen en el historial y se abren igual (AC-25) | |
| 4.18 | Tú | Con una cuenta de prueba que tenga un reporte personal: *Equipo* → Salir del equipo; vuelve a entrar con una invitación | Su reporte personal ya no está; el de equipo sigue (AC-28) | |
| 4.19 | Tú | `node scripts/f4-cupos-simultaneos.mjs` (cuenta con cupo; gasta 1) | `ok: 1`, el resto `cooldown` y `CUMPLE` (AC-15) || OK (15 oct, f4-validar-nube: ok 1, cooldown 9) |
| 4.20 | Tú | Con `PULSO_AI_BASE_URL`, `PULSO_AI_MODEL` y `PULSO_AI_KEY`: `node scripts/f4-reportes-reales.mjs` | `Plantilla: N de 20 (meta: 3 o menos) → CUMPLE` (AC-13b) | |
| 4.21 | Tú | Abre `/dev/galeria` (solo con `npm run dev`), sección «Reportes (F4)», en ventana estrecha, media y ancha, en tema claro y oscuro; recorre *Reportes* solo con el teclado | Se ve bien en los seis casos y todo se alcanza con flechas, Enter y Esc (AC-31) | |

## F5 · Tableros y privacidad (puerta G5)

Cuentas: A = owner, B = member y C = viewer (las de arriba). Faltan dos, del mismo equipo: **D = admin** (con A, *Equipo* → *Miembros*, cambia su rol a «Administrador») y **E = lead** (cuenta member; con A o D, abre un proyecto → miembros del proyecto y dale el rol «Líder»; ponle además una tarea en curso y tiempo en ella). Para que haya datos, A, B, D y E trabajan un rato con apps y temporizador y esperan a «Al día» (indicador abajo en el menú). Hacen falta al menos 2 miembros sin contar al viewer, o member y viewer verán el aviso «Hacen falta al menos 2 miembros» (AC-4).

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 5.1 | Tú | Con A (owner): abre *Tablero* y recorre los periodos (Hoy, Esta semana, Este mes, Semana pasada, Mes pasado) | Ve «Totales del equipo», «Horas por día», «Uso de IA del equipo», «Presencia», «Personas» (horas activas, productivas, IA, «Capacidad usada» y tareas en curso de cada persona, con «Solo categorías» junto a quien ocultó sus apps) y «Apps más usadas». «Presencia» lista a todos menos al viewer y solo dice el estado, nunca app ni sitio. No ve «Tus proyectos» (AC-1, AC-6, AC-14) | OK (16 oct) |
| 5.2 | Tú | Con D (admin): repite 5.1 | Ve exactamente lo mismo que A: totales, «Personas», «Capacidad usada», «Apps más usadas» y «Presencia» de todos (AC-1, AC-6) | OK (16 oct). Una vez, con B recién pasado a viewer, D vio solo a B; no se repitió (en estudio) |
| 5.3 | Tú | Con E (lead): abre *Tablero* | Ve «Totales del equipo» sin nombres y «Tus proyectos» (solo las personas de sus proyectos, con «Horas en tus proyectos», «IA en tus proyectos» y tareas en curso). «Presencia» solo con las personas de sus proyectos. NO ve «Personas», «Capacidad usada» ni «Apps más usadas», ni categorías ni apps por persona, ni a nadie ajeno a sus proyectos (AC-2, AC-6) | OK (16 oct) |
| 5.4 | Tú | Con B (member): abre *Tablero*. Con A, en *Equipo* → *General* → «Ajustes del equipo», apaga «Los miembros pueden ver quién está activo» y guarda; B recarga *Tablero*. Luego A lo enciende y B recarga | Siempre ve «Totales del equipo», «Horas por día» y «Uso de IA del equipo», sin ningún nombre de persona. NO ve «Personas», «Tus proyectos» ni «Apps más usadas». «Presencia» no aparece con el interruptor apagado (la app no la pide; sin texto de error) y muestra a todos (solo estado) con él encendido (AC-3, AC-6) | OK (16 oct) |
| 5.5 | Tú | Con C (viewer): abre *Tablero* | Ve «Totales del equipo», «Horas por día» y «Uso de IA del equipo», sin ningún nombre de persona. NO ve «Presencia», «Personas», «Tus proyectos» ni «Apps más usadas» (AC-3, AC-6) | OK (16 oct) |
| 5.6 | Tú | Con un equipo de prueba que tenga solo owner + viewer (o con el equipo cuando B, D y E aún no hayan entrado): abre *Tablero* con C y con A | C ve «Hacen falta al menos 2 miembros» y ninguna cifra; A sí ve los totales (AC-4, AC-14) | OK (16 oct) |
| 5.7 | Tú | Con A, D, E, B y C: *Tablero* → «Imprimir / PDF» (vista previa de impresión) | El PDF solo trae el tablero de ese rol, sin menú ni controles (AC-17) | OK (16 oct) |
| 5.8 | Tú | Elige un día y un miembro (por ejemplo B). Espera a «Al día» en B y en A. Con B: *Mi día* → Día de ese día y anota horas activas, productivas y tiempo de IA. Con A: *Tablero* → Hoy (o el periodo que cubra solo ese día) → «Personas» y compara con la fila de B. Repite con otro miembro | Horas activas, «Productivas» y tiempo de IA de la fila de B (la tabla «Personas» no muestra neutral ni distracción) en el tablero coinciden con *Mi día* de B, con una diferencia de 0,1 h como máximo (el tablero redondea a 1 decimal). Si no coinciden, anota la diferencia y si B tenía datos sin subir (AC-1) | OK (16 oct, ≤ 0,1 h) |
| 5.9 | Tú | Mismo día: compara «Totales del equipo» del tablero con la suma de *Mi día* de todos los miembros sin viewer | Horas activas y de IA del equipo = suma de las de cada persona (margen de 0,1 h, como en 5.8) (AC-1) | OK (16 oct, ≤ 0,1 h) |
| 5.10 | Tú | Con B: *Ajustes* → *Mi privacidad* → apaga «Compartir los nombres de mis apps con el equipo» y confirma con «Sí, dejar de compartir». Trabaja 5 minutos con otra app y espera a «Al día» | La opción queda apagada y explica que el equipo ve solo categorías (AC-24) | OK (16 oct) |
| 5.11 | Tú | Con A: *Tablero* → «Personas» y «Apps más usadas» | Junto a B aparece «Solo categorías»; B suma sus horas por categoría, pero ninguna app suya (ni las ya subidas ni las nuevas) sale en «Apps más usadas» (AC-9) | OK (16 oct) |
| 5.12 | Tú | Con B: vuelve a encender «Compartir los nombres de mis apps con el equipo», trabaja 5 minutos con una app y espera a «Al día». Con A: mira *Tablero* | «Solo categorías» desaparece junto a B y las apps nuevas vuelven a verse; las ya ocultas siguen sin nombre (encender solo afecta a lo nuevo) (AC-9) | OK (16 oct) |
| 5.13 | Tú | Con A: *Equipo* → *Auditoría* (también con D). Luego con B, E y C mira *Equipo* | Hay filas «Cambió los ajustes del equipo» (de 5.4) y «Cambió si comparte los nombres de sus apps» (de 5.10 y 5.12), con quién y cuándo. A y D ven la pestaña; B, E y C no (AC-9, AC-10, AC-22) | OK (16 oct) |

## Fuera de esta lista

- G0: los informes S-2 y S-4 siguen pendientes (docs/PLAN.md).
- F6 (instalador, pulso-demo, revisión de seguridad): ver docs/PLAN.md §3 y §9.3.
