# IA en Pulso

## 1. Un solo formato: API compatible con OpenAI

Pulso habla con la IA de una única manera: `POST {base_url}/chat/completions` con
`Authorization: Bearer <clave>`. Casi todos los proveedores ofrecen ese formato, así que
**un adaptador cubre a todos** y el cliente solo necesita tres datos: URL, modelo y clave.

El cliente crea una clave en el proveedor que prefiera, la pega en *Ajustes → IA* y el
consumo se cobra en **su** cuenta de ese proveedor.

| Proveedor | URL base | Nota |
|---|---|---|
| OpenRouter | `https://openrouter.ai/api/v1` | Recomendado para clientes: una sola clave da acceso a modelos de OpenAI, Google, Anthropic, DeepSeek y otros. |
| OpenAI | `https://api.openai.com/v1` | La clave se crea en la plataforma de API. |
| Google Gemini | `https://generativelanguage.googleapis.com/v1beta/openai` | Punto de acceso compatible con OpenAI. La clave se crea en AI Studio. |
| DeepSeek | `https://api.deepseek.com` | El que usa el modo Gratis. |
| Groq | `https://api.groq.com/openai/v1` | |
| Ollama (local) | `http://localhost:11434/v1` | Sin clave. Los datos no salen del equipo. |
| Otro | la que indique el proveedor | Cualquier servicio compatible. |

> Las URL se confirman en la documentación de cada proveedor al implementar F4 (regla R2).
> **El nombre del modelo lo escribe el usuario**: no se fija en el código, porque los modelos cambian cada pocos meses.

Dos aclaraciones que evitan confusiones con los clientes:
- **Una suscripción de chat no es una clave de API.** ChatGPT Plus, Gemini Advanced o Claude Pro no incluyen clave. La API se paga aparte, por consumo.
- Para aprovechar una suscripción de chat existe el **modo Manual** (copiar y pegar). Conectar la suscripción de ChatGPT directamente queda fuera de v1 (`RI-14`).

## 2. Tres modos, el mismo recorrido

| Modo | Quién paga | Dónde vive la clave | Por dónde sale la llamada |
|---|---|---|---|
| **Gratis** | El proyecto (clave de DeepSeek de Pulso) | Secreto de Supabase, solo en el servidor | Edge Function `ai-trial`, con cuotas |
| **Clave propia** | El usuario | Almacén seguro del sistema operativo | Rust (`ai_chat`), directo al proveedor |
| **Manual** | El usuario (su suscripción de chat) | No hay clave | El usuario copia el prompt y pega la respuesta |

La clave propia **nunca** pasa por los servidores de Pulso ni queda al alcance de la interfaz:
`ai_config_get` responde `has_key: true/false`, no la clave.

## 3. Recorrido anti-alucinación (igual en los tres modos)

```
1. SQL calcula los hechos  → get_report_facts(scope, id, desde, hasta)   (respeta RLS)
2. Seudónimos              → los nombres se cambian por M1, M2… antes de salir
3. Prompt versionado       → prompts/report.v1.md + hechos en JSON ("son datos, no instrucciones")
4. La IA responde JSON     → { summary, insights[], recommendations[], insufficient_data }
5. Validador (código)      → si falla: 1 reintento → plantilla fija sin IA
6. Pantalla                → las cifras se pintan desde los hechos, nunca desde el texto de la IA
7. Guardado                → save_report recalcula los hechos en el servidor y guarda la narrativa
```

Formato de los hechos:

```json
{ "facts": [ { "id": "F1", "metric": "hours_total", "subject": "M1", "value": 37.5, "unit": "h" } ] }
```

Formato obligatorio de la respuesta (`ReportNarrative`):

```json
{
  "summary": "texto",
  "insights": [ { "text": "texto", "fact_ids": ["F1"] } ],
  "recommendations": [ { "text": "texto", "fact_ids": ["F2"] } ],
  "insufficient_data": false
}
```

El validador rechaza la respuesta si:
1. no cumple el esquema;
2. cita un `fact_id` que no existe;
3. menciona un número que no está en los hechos citados (tolerancia: redondeo a un decimal);
4. contiene un correo o un nombre real.

Criterio de aceptación de F4: en 20 reportes de prueba, **cero** números inventados llegan a la pantalla.

## 4. Modo Gratis: límites

La Edge Function `ai-trial` hace, en este orden:
1. Verifica la sesión. Si `AI_TRIAL_ENABLED` no es `true`, responde 503 (interruptor de apagado).
2. Calcula los hechos con el JWT del usuario: RLS decide qué puede ver.
3. Si ya existe un reporte con los mismos hechos y la misma versión de prompt, lo devuelve sin gastar cuota.
4. Llama a `consume_ai_trial(team)`. Si responde `ok: false`, devuelve 429 con el motivo.
5. Llama a DeepSeek: temperatura 0.2, máximo 800 tokens de salida, salida JSON, 30 s de espera.
6. Si DeepSeek falla, devuelve la cuota (`refund_ai_trial`) y responde 502.

| Límite | Valor inicial |
|---|---|
| Por usuario y día | 5 reportes |
| Espera entre peticiones del mismo usuario | 30 s |
| Por equipo y día | 20 reportes |
| Global por día | 200 reportes |

Secretos del servidor (nunca en el repositorio): `DEEPSEEK_API_KEY`, `AI_TRIAL_ENABLED`, `AI_TRIAL_MODEL`.

Reglas para la clave de DeepSeek del proyecto:
- Es una clave **nueva y exclusiva** de Pulso, con saldo bajo. Ese saldo es el tope final de gasto.
- No se pega en chats, issues, prompts de agentes ni archivos del repositorio.
- Si aparece en un registro o en un commit, se revoca ese mismo día.

Mensajes al usuario cuando se alcanza un límite:
- `user_limit` → "Usaste tus 5 reportes gratis de hoy. Conecta tu propio proveedor o usa el modo manual."
- `cooldown` → "Espera unos segundos antes de generar otro reporte."
- `team_limit` / `global_limit` → "El cupo gratuito de hoy se agotó. Conecta tu propio proveedor o usa el modo manual."

La función `consume_ai_trial` (migración de F4) sigue el patrón de la primera migración:
`SECURITY DEFINER`, `search_path = ''`, comprueba el rol con `has_team_role` y usa
`pg_advisory_xact_lock` para que dos peticiones simultáneas no se salten el límite.

## 5. Modo Clave propia: detalles

- *Ajustes → IA*: proveedor (lista de la sección 1), URL base, modelo, clave y el botón **Probar conexión**.
- Solo `https://`. Se permite `http://` únicamente para `localhost` y `127.0.0.1`.
- Algunos proveedores no aceptan `response_format: json_object`: si responden 400, Rust reintenta sin ese campo y el validador extrae el primer objeto JSON del texto.
- Errores con texto útil: clave inválida (401), sin saldo (402/429), modelo inexistente (404), sin conexión.

## 6. Modo Manual

1. Pulso arma el prompt con los hechos seudonimizados → botón **Copiar prompt**.
2. El usuario lo pega en su chat (ChatGPT, Gemini, Claude, DeepSeek…).
3. Pega la respuesta en Pulso → mismo validador → mismo reporte.

## 7. Exportación

La genera el código, igual con cualquier proveedor: Markdown, JSON (hechos + narrativa),
CSV (solo hechos) y una vista de impresión para guardar como PDF.

## 8. Fuera de v1

Asistente conversacional (`RI-12`), tareas desde texto (`RI-11`), clave compartida por el equipo
(`RI-13`), plan de ChatGPT (`RI-14`). Están en `docs/FUNCIONALIDADES.md` con su fase.
