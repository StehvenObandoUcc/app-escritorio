//! IA con clave propia (F4, docs/IA.md §5, ADR-0022). Rust solo guarda la configuración y hace la llamada:
//! - URL base y modelo en los ajustes locales; la clave en el almacén seguro, nunca de vuelta a la interfaz.
//! - Solo `https://`, salvo `http://localhost` y `http://127.0.0.1` (Ollama, LM Studio).
//! - Una llamada `POST {base_url}/chat/completions` formato OpenAI: temperatura 0,2, 1200 tokens, 30 s,
//!   `response_format: json_object`; ante un 400, un reintento con el cuerpo mínimo (`model` y `messages`).

use keyring::Entry;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::time::Duration;

pub type Result<T> = std::result::Result<T, String>;

const SERVICE: &str = "pulso";
/// Nombre de la clave en el almacén seguro. Las pruebas usan otro para no tocar la real.
pub const KEY_USER: &str = "ai-key";
const MAX_MODEL: usize = 200;
const MAX_KEY: usize = 500;
const MAX_MESSAGES_BYTES: usize = 200_000;
const TIMEOUT: Duration = Duration::from_secs(30);

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiConfig {
  pub base_url: Option<String>,
  pub model: Option<String>,
  /// Si hay una clave guardada. La clave misma nunca sale de Rust (AC-19).
  pub has_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ChatMessage {
  pub role: String,
  pub content: String,
}

/// Valida y normaliza la URL base: sin barra final, sin usuario, consulta ni fragmento (AC-20).
pub fn check_base_url(raw: &str) -> Result<String> {
  let invalid = || "La URL del proveedor no es válida.".to_string();
  let url = reqwest::Url::parse(raw.trim()).map_err(|_| invalid())?;
  if !url.username().is_empty() || url.password().is_some() || url.query().is_some() || url.fragment().is_some() {
    return Err(invalid());
  }
  let local = matches!(url.host_str(), Some("localhost" | "127.0.0.1"));
  match url.scheme() {
    "https" => {}
    "http" if local => {}
    _ => return Err("La URL del proveedor debe empezar por https:// (http:// solo para localhost o 127.0.0.1).".into()),
  }
  Ok(url.as_str().trim_end_matches('/').to_string())
}

pub fn check_model(model: &str) -> Result<String> {
  let m = model.trim();
  if m.is_empty() || m.len() > MAX_MODEL {
    return Err("Escribe el nombre del modelo (hasta 200 caracteres).".into());
  }
  Ok(m.to_string())
}

// ---- Clave en el almacén seguro ----

fn entry(user: &str) -> Result<Entry> {
  Entry::new(SERVICE, user).map_err(|e| format!("almacén seguro: {e}"))
}

pub fn key_set(user: &str, key: &str) -> Result<()> {
  let k = key.trim();
  if k.is_empty() || k.len() > MAX_KEY {
    return Err("La clave de IA no es válida.".into());
  }
  entry(user)?.set_password(k).map_err(|e| format!("almacén seguro: {e}"))
}

pub fn key_get(user: &str) -> Result<Option<String>> {
  match entry(user)?.get_password() {
    Ok(k) => Ok(Some(k)),
    Err(keyring::Error::NoEntry) => Ok(None),
    Err(e) => Err(format!("almacén seguro: {e}")),
  }
}

pub fn key_clear(user: &str) -> Result<()> {
  match entry(user)?.delete_credential() {
    Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
    Err(e) => Err(format!("almacén seguro: {e}")),
  }
}

// ---- Llamada al proveedor ----

/// Respuesta HTTP reducida: estado y cuerpo. Así la regla del reintento se prueba sin red.
pub type HttpResult = std::result::Result<(u16, String), SendError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SendError {
  Timeout,
  Connect,
}

pub fn check_messages(messages: &[ChatMessage]) -> Result<()> {
  let size: usize = messages.iter().map(|m| m.content.len()).sum();
  let roles_ok = messages.iter().all(|m| matches!(m.role.as_str(), "system" | "user" | "assistant"));
  if messages.is_empty() || !roles_ok || size > MAX_MESSAGES_BYTES {
    return Err("Los mensajes para la IA no son válidos.".into());
  }
  Ok(())
}

pub fn full_body(model: &str, messages: &[ChatMessage]) -> Value {
  json!({ "model": model, "messages": messages, "temperature": 0.2, "max_tokens": 1200, "response_format": { "type": "json_object" } })
}

pub fn minimal_body(model: &str, messages: &[ChatMessage]) -> Value {
  json!({ "model": model, "messages": messages })
}

/// Mensaje claro para cada fallo (AC-18).
fn explain(status: u16) -> String {
  match status {
    401 | 403 => "La clave de IA no es válida o no tiene permiso.".into(),
    402 => "Tu cuenta del proveedor de IA no tiene saldo.".into(),
    429 => "El proveedor de IA rechazó la petición por límite de uso o falta de saldo.".into(),
    404 => "El proveedor no encontró ese modelo o esa dirección. Revisa la URL y el modelo.".into(),
    400 => "El proveedor rechazó la petición. Revisa el nombre del modelo.".into(),
    s => format!("El proveedor de IA respondió con un error ({s})."),
  }
}

fn content_of(body: &str) -> Result<String> {
  let v: Value = serde_json::from_str(body).map_err(|_| "La respuesta del proveedor no tiene el formato esperado.".to_string())?;
  v["choices"][0]["message"]["content"]
    .as_str()
    .map(String::from)
    .ok_or_else(|| "La respuesta del proveedor no tiene el formato esperado.".into())
}

/// Hace la llamada con `send` y aplica la regla: un 400 se reintenta una vez con el cuerpo mínimo.
pub async fn chat_with<F, Fut>(model: &str, messages: &[ChatMessage], send: F) -> Result<String>
where
  F: Fn(Value) -> Fut,
  Fut: std::future::Future<Output = HttpResult>,
{
  check_messages(messages)?;
  let mut result = send(full_body(model, messages)).await;
  if matches!(result, Ok((400, _))) {
    result = send(minimal_body(model, messages)).await;
  }
  match result {
    Ok((s, body)) if (200..300).contains(&s) => content_of(&body),
    Ok((s, _)) => Err(explain(s)),
    Err(SendError::Timeout) => Err("El proveedor de IA tardó demasiado en responder.".into()),
    Err(SendError::Connect) => Err("No se pudo conectar con el proveedor de IA. Revisa la conexión y la URL.".into()),
  }
}

/// Llamada real con `reqwest` (TLS de Windows). La clave va solo en la cabecera y nunca se registra.
pub async fn chat(base_url: &str, model: &str, key: Option<&str>, messages: &[ChatMessage]) -> Result<String> {
  let client = reqwest::Client::builder().timeout(TIMEOUT).build().map_err(|_| "No se pudo preparar la conexión con la IA.".to_string())?;
  let url = format!("{base_url}/chat/completions");
  chat_with(model, messages, |body| {
    let mut req = client.post(&url).json(&body);
    if let Some(k) = key {
      req = req.bearer_auth(k);
    }
    async move {
      let res = req.send().await.map_err(|e| if e.is_timeout() { SendError::Timeout } else { SendError::Connect })?;
      let status = res.status().as_u16();
      let text = res.text().await.map_err(|e| if e.is_timeout() { SendError::Timeout } else { SendError::Connect })?;
      Ok((status, text))
    }
  })
  .await
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::sync::Mutex;

  fn msgs() -> Vec<ChatMessage> {
    vec![ChatMessage { role: "system".into(), content: "prompt".into() }, ChatMessage { role: "user".into(), content: "{}".into() }]
  }

  fn ok(content: &str) -> HttpResult {
    Ok((200, json!({ "choices": [{ "message": { "content": content } }] }).to_string()))
  }

  /// Ejecuta `chat_with` con respuestas en cola y devuelve el resultado y los cuerpos enviados.
  fn run(answers: Vec<HttpResult>) -> (Result<String>, Vec<Value>) {
    let queue = Mutex::new(answers.into_iter());
    let sent = Mutex::new(Vec::new());
    let send = |body: Value| {
      sent.lock().unwrap().push(body);
      let next = queue.lock().unwrap().next().expect("respuesta de prueba");
      async move { next }
    };
    let result = tauri::async_runtime::block_on(chat_with("modelo-x", &msgs(), send));
    (result, sent.into_inner().unwrap())
  }

  #[test]
  fn sends_the_full_body_and_reads_the_content() {
    let (result, sent) = run(vec![ok("{\"summary\":\"s\"}")]);
    assert_eq!(result.unwrap(), "{\"summary\":\"s\"}");
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0]["max_tokens"], 1200);
    assert_eq!(sent[0]["temperature"], 0.2);
    assert_eq!(sent[0]["response_format"]["type"], "json_object");
  }

  #[test]
  fn a_400_is_retried_once_with_the_minimal_body() {
    let (result, sent) = run(vec![Ok((400, "no json mode".into())), ok("texto")]);
    assert_eq!(result.unwrap(), "texto");
    assert_eq!(sent[1], json!({ "model": "modelo-x", "messages": msgs() }));
    let (result, sent) = run(vec![Ok((400, String::new())), Ok((400, String::new()))]);
    assert_eq!(sent.len(), 2);
    assert!(result.unwrap_err().contains("Revisa el nombre del modelo"));
  }

  #[test]
  fn each_failure_has_a_clear_message() {
    for (status, text) in [(401, "clave"), (402, "saldo"), (429, "límite"), (404, "modelo"), (500, "(500)")] {
      let (result, sent) = run(vec![Ok((status, String::new()))]);
      assert!(result.unwrap_err().contains(text), "{status}");
      assert_eq!(sent.len(), 1, "solo el 400 se reintenta");
    }
    assert!(run(vec![Err(SendError::Timeout)]).0.unwrap_err().contains("tardó"));
    assert!(run(vec![Err(SendError::Connect)]).0.unwrap_err().contains("conectar"));
    assert!(run(vec![Ok((200, "{}".into()))]).0.unwrap_err().contains("formato"));
  }

  #[test]
  fn only_https_or_local_http_urls() {
    assert_eq!(check_base_url("https://openrouter.ai/api/v1/").unwrap(), "https://openrouter.ai/api/v1");
    assert_eq!(check_base_url("http://localhost:11434/v1").unwrap(), "http://localhost:11434/v1");
    assert_eq!(check_base_url("http://127.0.0.1:1234/v1").unwrap(), "http://127.0.0.1:1234/v1");
    for bad in ["http://api.openai.com/v1", "http://192.168.0.5/v1", "ftp://x.com", "no-es-url", "https://u:p@x.com", "https://x.com/v1?k=1"] {
      assert!(check_base_url(bad).is_err(), "{bad}");
    }
  }

  #[test]
  fn messages_are_checked_before_sending() {
    let bad = vec![ChatMessage { role: "tool".into(), content: "x".into() }];
    assert!(tauri::async_runtime::block_on(chat_with("m", &bad, |_| async { ok("x") })).is_err());
    assert!(check_messages(&[]).is_err());
    assert!(check_model("  ").is_err());
  }

  /// Usa el almacén real con otro nombre para no tocar la clave de la persona.
  #[test]
  #[cfg(windows)]
  fn the_key_lives_only_in_the_secure_store() {
    const TEST_USER: &str = "ai-key-test";
    key_set(TEST_USER, "sk-prueba").unwrap();
    assert_eq!(key_get(TEST_USER).unwrap().as_deref(), Some("sk-prueba"));
    key_clear(TEST_USER).unwrap();
    assert_eq!(key_get(TEST_USER).unwrap(), None);
  }
}
