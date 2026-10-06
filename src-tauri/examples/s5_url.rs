//! Prueba S-5: lee el dominio de la barra de direcciones cada 2 s y mide cuánto tarda cada lectura.
//! Solo imprime el dominio, nunca la URL completa.
//! Uso:
//!   cargo run --example s5_url --release -- <segundos>            (ventana en primer plano)
//!   cargo run --example s5_url --release -- <segundos> <hwnd>     (una ventana concreta, sin traerla al frente)

use std::time::{Duration, Instant};

fn main() {
  let mut args = std::env::args().skip(1);
  let seconds: u64 = args.next().and_then(|s| s.parse().ok()).unwrap_or(60);
  let hwnd: Option<isize> = args.next().and_then(|s| s.parse().ok());
  let mut sensor = pulso_lib::sensor::Sensor::new();
  let start = Instant::now();
  let (mut reads, mut with_domain) = (0u32, 0u32);
  let mut times: Vec<Duration> = Vec::new();
  while start.elapsed() < Duration::from_secs(seconds) {
    let t = Instant::now();
    let domain = match hwnd {
      Some(h) => sensor.domain_of_window(h),
      None => sensor.read().filter(|w| pulso_lib::sensor::is_browser(&w.process)).and_then(|w| w.domain),
    };
    let took = t.elapsed();
    reads += 1;
    times.push(took);
    if domain.is_some() {
      with_domain += 1;
    }
    println!("{:<30} | {:>6.2} ms", domain.as_deref().unwrap_or("(sin dominio)"), took.as_secs_f64() * 1000.0);
    std::thread::sleep(Duration::from_secs(2));
  }
  times.sort();
  let pct = |p: f64| times.get(((times.len() as f64 - 1.0) * p) as usize).copied().unwrap_or_default();
  println!("---");
  println!("lecturas: {reads} · con dominio: {with_domain}");
  println!("tiempo por lectura: mediana {:?} · p95 {:?} · máx {:?}", pct(0.5), pct(0.95), times.last().copied().unwrap_or_default());
}
