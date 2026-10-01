# Spec <fase>-<nombre>

Funcionalidades: <IDs de docs/FUNCIONALIDADES.md>
Estado: borrador | aprobada (por <nombre>, <fecha>)

## Objetivo
Una o dos frases: qué podrá hacer el usuario al terminar.

## Contratos
Lo que se fija ANTES de programar y que los tres flujos comparten.
- Puente: cambios en `src/bridge/contract.ts` (tipos y comandos).
- Datos: tablas, columnas y funciones SQL nuevas.

## Criterios de aceptación
Cada uno se convierte en una prueba. Redacción: "Dado… cuando… entonces…".
- AC-1 …
- AC-2 …

## Trabajo por flujo
| Flujo | Archivos permitidos | Entrega |
|---|---|---|
| A · Rust | `src-tauri/**` | |
| B · Datos e IA | `supabase/**`, `prompts/**` | |
| C · Interfaz | `src/**` | |

## Fuera de alcance
Lo que NO se hace en esta spec, aunque parezca relacionado.

## Cómo se comprueba
La puerta de calidad de la fase (docs/PLAN.md) más los pasos manuales propios de esta spec.
