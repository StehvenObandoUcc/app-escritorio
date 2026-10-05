//! Prueba S-1: lee la ventana activa y la inactividad cada 2 s durante 30 s,
//! y mide el uso de CPU del propio proceso.
//! Uso: cargo run --manifest-path src-tauri/Cargo.toml --example s1_sensor --release

use std::time::{Duration, Instant};

fn main() {
  let start = Instant::now();
  let mut slowest = Duration::ZERO;
  while start.elapsed() < Duration::from_secs(30) {
    let t = Instant::now();
    let window = pulso_lib::sensor::active_window();
    let idle = pulso_lib::sensor::idle_seconds();
    slowest = slowest.max(t.elapsed());
    match window {
      Some(w) => println!("{:>16} | {:<60} | inactivo {:?} s", w.process, w.title, idle),
      None => println!("(sin ventana activa) | inactivo {idle:?} s"),
    }
    std::thread::sleep(Duration::from_secs(2));
  }
  println!("Lectura más lenta: {slowest:?}");
}
