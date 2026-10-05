//! Clasificador: asigna categoría a un bloque con reglas ordenadas.
//! Primero las del equipo, luego las de `rules/default.json`. Gana la primera coincidencia.
//! Función pura: no toca red ni disco.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Category {
  Productive,
  Neutral,
  Distraction,
  Ai,
  Break,
  Idle,
  Paused,
}

impl Category {
  pub fn as_str(self) -> &'static str {
    match self {
      Category::Productive => "productive",
      Category::Neutral => "neutral",
      Category::Distraction => "distraction",
      Category::Ai => "ai",
      Category::Break => "break",
      Category::Idle => "idle",
      Category::Paused => "paused",
    }
  }

  pub fn parse(value: &str) -> Option<Category> {
    Some(match value {
      "productive" => Category::Productive,
      "neutral" => Category::Neutral,
      "distraction" => Category::Distraction,
      "ai" => Category::Ai,
      "break" => Category::Break,
      "idle" => Category::Idle,
      "paused" => Category::Paused,
      _ => return None,
    })
  }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MatchKind {
  Process,
  Title,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Rule {
  #[serde(rename = "match")]
  pub kind: MatchKind,
  /// Texto en minúsculas; coincide si el campo lo contiene.
  pub pattern: String,
  pub category: Category,
  pub ai_tool: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Classification {
  pub category: Category,
  pub ai_tool: Option<String>,
}

const DEFAULT_RULES_JSON: &str = include_str!("../rules/default.json");

/// Reglas por defecto incluidas en el binario.
pub fn default_rules() -> Vec<Rule> {
  serde_json::from_str(DEFAULT_RULES_JSON).expect("rules/default.json es inválido")
}

/// Clasifica por nombre de proceso y título. Sin coincidencia: `neutral`.
pub fn classify(team_rules: &[Rule], defaults: &[Rule], process: &str, title: &str) -> Classification {
  let process = process.to_lowercase();
  let title = title.to_lowercase();
  team_rules
    .iter()
    .chain(defaults)
    .find(|rule| {
      let haystack = match rule.kind {
        MatchKind::Process => &process,
        MatchKind::Title => &title,
      };
      haystack.contains(&rule.pattern.to_lowercase())
    })
    .map(|rule| Classification {
      category: rule.category,
      ai_tool: if rule.category == Category::Ai { rule.ai_tool.clone() } else { None },
    })
    .unwrap_or(Classification { category: Category::Neutral, ai_tool: None })
}

#[cfg(test)]
mod tests {
  use super::*;

  fn run(process: &str, title: &str) -> Classification {
    classify(&[], &default_rules(), process, title)
  }

  #[test]
  fn ai_titles_set_category_and_tool() {
    for (title, tool) in [
      ("ChatGPT - Google Chrome", "ChatGPT"),
      ("Nueva conversación - Claude", "Claude"),
      ("Gemini", "Gemini"),
      ("DeepSeek Chat", "DeepSeek"),
      ("Microsoft Copilot", "Copilot"),
    ] {
      let c = run("chrome", title);
      assert_eq!(c.category, Category::Ai, "{title}");
      assert_eq!(c.ai_tool.as_deref(), Some(tool), "{title}");
    }
  }

  #[test]
  fn local_ai_processes_are_ai() {
    assert_eq!(run("ollama", "").category, Category::Ai);
    assert_eq!(run("LM Studio", "").category, Category::Ai);
    assert_eq!(run("lm studio", "").ai_tool.as_deref(), Some("LM Studio"));
  }

  #[test]
  fn productive_and_distraction_defaults() {
    assert_eq!(run("Code", "main.rs").category, Category::Productive);
    assert_eq!(run("EXCEL", "Libro1").category, Category::Productive);
    assert_eq!(run("chrome", "YouTube").category, Category::Distraction);
    assert_eq!(run("Spotify", "").category, Category::Distraction);
  }

  #[test]
  fn no_match_is_neutral() {
    let c = run("notepad", "sin título");
    assert_eq!(c, Classification { category: Category::Neutral, ai_tool: None });
  }

  #[test]
  fn team_rules_win_over_defaults() {
    let team = vec![Rule {
      kind: MatchKind::Title,
      pattern: "youtube".into(),
      category: Category::Productive,
      ai_tool: None,
    }];
    let c = classify(&team, &default_rules(), "chrome", "YouTube - tutorial");
    assert_eq!(c.category, Category::Productive);
  }

  #[test]
  fn first_match_wins_and_ai_beats_browser_distraction() {
    // Un título con "ChatGPT" y "YouTube" cae en la primera regla (IA).
    assert_eq!(run("chrome", "ChatGPT sobre YouTube").category, Category::Ai);
  }

  #[test]
  fn every_default_rule_matches_itself() {
    for rule in default_rules() {
      let (p, t) = match rule.kind {
        MatchKind::Process => (rule.pattern.as_str(), ""),
        MatchKind::Title => ("", rule.pattern.as_str()),
      };
      let c = run(p, t);
      // Puede ganar una regla anterior, pero nunca debe quedar neutral.
      assert_ne!(c.category, Category::Neutral, "{}", rule.pattern);
    }
  }
}
