//! Comprueba la lista de apps instaladas y abiertas (ADR-0010).
//! Uso: cargo run --manifest-path src-tauri/Cargo.toml --example apps_list --release
fn main() {
  let t = std::time::Instant::now();
  let apps = pulso_lib::apps::installed_apps();
  let open = apps.iter().filter(|a| a.source == "open").count();
  println!("apps: {} · abiertas: {} · {:?}", apps.len(), open, t.elapsed());
  for a in apps.iter().filter(|a| a.source == "open") {
    println!("  abierta  {:<28} {}", a.process, a.label);
  }
  for a in apps.iter().filter(|a| a.source == "installed").take(12) {
    println!("  instalada {:<28} {}", a.process, a.label);
  }
}
