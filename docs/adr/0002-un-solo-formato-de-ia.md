# ADR-0002 · Un solo formato de IA: compatible con OpenAI

Fecha: 2026-10-01 · Estado: aceptado

## Contexto
Se quería que cada cliente usara su propio proveedor. La versión 1.1 proponía tres
adaptadores (OpenAI, Anthropic y un webhook propio).

## Decisión
Un único adaptador para `POST {base_url}/chat/completions`. El cliente indica URL, modelo y clave.
Cubre OpenRouter, OpenAI, Gemini, DeepSeek, Groq y modelos locales (Ollama, LM Studio).
Se mantiene el modo Manual para quien solo tiene una suscripción de chat.

## Consecuencias
- Un solo camino de código que probar.
- Los modelos de Anthropic se usan a través de OpenRouter o del modo Manual.
- El webhook propio y el plan de ChatGPT quedan fuera de v1.
- El nombre del modelo no se fija en el código.
