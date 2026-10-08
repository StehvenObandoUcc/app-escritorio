# Validación en real (F1 a F4)

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
| 0.2 | Tú | Clave **nueva** de DeepSeek, solo para Pulso y con poco saldo. `npx supabase@2.119.0 secrets set DEEPSEEK_API_KEY=… AI_TRIAL_ENABLED=true AI_TRIAL_MODEL=<modelo>` (la clave se escribe en la terminal, nunca en un archivo) | El comando termina sin error | |
| 0.3 | Tú | `npx supabase@2.119.0 functions deploy ai-trial --use-api` | `Deployed Function ai-trial` | |
| 0.4 | Agente | `npm run verify` y `npm run verify:rust` en la rama `feat/f4-ia-y-reportes` | Todo en verde | OK (8 oct: 431 + 115 pruebas) |

## F1 · Sensor y *Mi día* (regresión tras los cambios de F4 en Rust)

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 1.1 | Tú | Trabaja 5 minutos con dos apps y abre *Mi día* → *Detalle* | Aparecen los bloques con su categoría y duración; el temporizador arranca y se detiene | |
| 1.2 | Tú | Abre ChatGPT o Claude en el navegador durante 2 minutos y vuelve a *Mi día* → *Detalle* | El bloque sale como IA, con la herramienta y un selector «Tipo de uso de IA» | |

## F2 · Cuentas, equipos y sincronización

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 2.1 | Tú | Mira el indicador de subida (abajo en el menú) con red | Pasa a «Al día» en menos de un minuto; nunca «Error» (el error del 8 oct quedó corregido en `e89558e`) | |
| 2.2 | Tú | Entra a un sitio marcado «no permitido» por el equipo (ADR-0012) | Aparece el aviso dentro de Pulso en cualquier pantalla, además de la notificación | |
| 2.3 | Tú | Mira Pulso durante 1 minuto y luego *Mi día* | Pulso no aparece como un bloque propio | |
| 2.4 | Tú | Con A: invita a C como viewer; con C: acepta con el código; con A: cambia un rol. En el panel de Supabase → *Table Editor* → `audit_log` | Todo funciona igual que en F2 (la corrección de permisos de F4 no rompió nada) y `audit_log` tiene las filas de la invitación y el cambio de rol | |

## F3 · Proyectos y tareas

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 3.1 | Tú | Con A: crea una tarea para B con evidencia «Hoja de cálculo». Con B: tómala, empiézala y envíala con un XLSX. Con A: pide cambios; con B: reenvíala; con A: apruébala | Cada paso funciona y el historial de la tarea lo muestra (regresión tras cerrar funciones internas) | |
| 3.2 | Tú | Con una cuenta del proyecto, abre el archivo de evidencia de 3.1 y copia la dirección que se abre en el navegador | El archivo abre en el navegador del sistema | |
| 3.3 | Tú | Con una cuenta **fuera del proyecto**: `$env:PULSO_EVIDENCE_URL='<dirección>'; node scripts/f3-evidencia-ajena.mjs` | `BLOQUEADO` al descargar y al pedir enlace, y `CUMPLE`. Pasados 60 s, el enlace compartido también `BLOQUEADO` | |
| 3.4 | Tú | Recorre *Proyectos*, una tarea y *Ajustes* con la app real | Ninguna pantalla en blanco ni errores de CSP | |

## F4 · IA y reportes (puerta G4)

| # | Quién | Qué hacer | Resultado esperado | Resultado |
|---|---|---|---|---|
| 4.1 | Tú | *Mi día* → *Detalle*: etiqueta un bloque de IA como «Código»; espera a «Al día» | La etiqueta se queda al recargar | |
| 4.2 | Tú | Con B: *Reportes* → Mi trabajo · Hoy · Gratis → Generar | Sale el reporte con cifras, «Datos hasta HH:MM», «Validado en el servidor» (en Supabase, `report_runs.validated_by = server`) y el texto marcado como redactado por IA. En las cifras aparece «Tiempo de IA por tipo de uso · Código» (AC-29) | |
| 4.3 | Tú | Repite 4.2 sin cambiar nada | «Ya había un reporte con los mismos datos…» y el historial no crece | |
| 4.4 | Tú | Con B: genera en Gratis otros reportes **distintos** (ayer, esta semana, la semana pasada; hoy en inglés) esperando 30 s entre uno y otro, hasta el sexto | El sexto muestra «Usaste tus 5 reportes gratis de hoy…» (AC-14) | |
| 4.5 | Tú | Con B: mira la lista «Sobre» | No aparece «Todo el equipo» (un member no genera el reporte de equipo) | |
| 4.6 | Tú | Con A (owner): genera «Todo el equipo» · Ayer | Sale con totales del grupo, sin nombres; en Supabase → `audit_log` hay una fila `report_generated` (AC-27) | |
| 4.7 | Tú | Con C (viewer): abre *Reportes* | Ve el reporte de equipo de 4.6 en el historial; no ve el formulario ni reportes personales | |
| 4.8 | Tú | `npx supabase@2.119.0 secrets set AI_TRIAL_ENABLED=false`; genera un reporte gratis nuevo; luego vuelve a `true` | «El modo Gratis está apagado en este momento…» | |
| 4.9 | Tú | *Ajustes → IA*: proveedor, modelo y clave válidos → Guardar → Probar conexión | «Conexión correcta: el proveedor respondió.» | |
| 4.10 | Tú | Cambia la clave por una inválida → Probar conexión. Luego un modelo inexistente. Luego sin red | Mensajes claros: clave no válida, modelo no encontrado, sin conexión (AC-18) | |
| 4.11 | Tú | Escribe `http://api.ejemplo.com/v1` como URL y guarda | Se rechaza: debe empezar por https:// (AC-20) | |
| 4.12 | Agente | Tras 4.9, busca la clave en `%APPDATA%\co.pulso.desktop\pulso.db` (tabla `kv_settings`) y en el almacenamiento del WebView | No aparece en ningún lado; solo en el Administrador de credenciales de Windows (`pulso` / `ai-key`) (AC-19) | |
| 4.13 | Tú | *Reportes* → Mi proveedor de IA · Ayer → Generar | Reporte en modo «Mi proveedor de IA», validado en este equipo | |
| 4.14 | Tú | *Reportes* → Manual: copia el prompt, pégalo en ChatGPT o Gemini; pega primero un texto cualquiera y luego la respuesta real | El texto cualquiera se rechaza con el motivo; la respuesta real produce el reporte (AC-21) | |
| 4.15 | Tú | En un reporte: Markdown, JSON, CSV y PDF (imprimir → Microsoft Print to PDF) | Los tres archivos quedan en *Descargas* y abren bien; el PDF solo trae el reporte, sin el menú (AC-26) | |
| 4.16 | Tú | Cambia la app a inglés y genera un reporte nuevo | Pantalla y texto de la IA en inglés (AC-30) | |
| 4.17 | Tú | Mañana: abre *Reportes* | Los reportes de hoy siguen en el historial y se abren igual (AC-25) | |
| 4.18 | Tú | Con una cuenta de prueba que tenga un reporte personal: *Equipo* → Salir del equipo; vuelve a entrar con una invitación | Su reporte personal ya no está; el de equipo sigue (AC-28) | |
| 4.19 | Tú | `node scripts/f4-cupos-simultaneos.mjs` (cuenta con cupo; gasta 1) | `ok: 1`, el resto `cooldown` y `CUMPLE` (AC-15) | |
| 4.20 | Tú | Con `PULSO_AI_BASE_URL`, `PULSO_AI_MODEL` y `PULSO_AI_KEY`: `node scripts/f4-reportes-reales.mjs` | `Plantilla: N de 20 (meta: 3 o menos) → CUMPLE` (AC-13b) | |
| 4.21 | Tú | Abre `/dev/galeria` (solo con `npm run dev`), sección «Reportes (F4)», en ventana estrecha, media y ancha, en tema claro y oscuro; recorre *Reportes* solo con el teclado | Se ve bien en los seis casos y todo se alcanza con flechas, Enter y Esc (AC-31) | |

## Fuera de esta lista

- G0: los informes S-2 y S-4 siguen pendientes (docs/PLAN.md).
- F5 no ha empezado.
