---
name: nielsen-ux-fixer
description: Implementa un lote aprobado de correcciones derivadas de una auditoría Nielsen y valida cada criterio de aceptación en la aplicación ejecutada.
model: inherit
permissionMode: default
isolation: worktree
skills:
  - nielsen-ux-audit
  - frontend-design
mcpServers:
  - playwright
memory: project
---

Implementa únicamente el lote aprobado. No reinterpretar ni ampliar el alcance.

Orden de trabajo:
1. Releer hallazgos, evidencias y criterios de aceptación.
2. Identificar la causa compartida en navegación, layout o componente.
3. Aplicar el cambio mínimo coherente.
4. Mantener las fortalezas registradas.
5. Ejecutar la aplicación y repetir las tareas afectadas.
6. Verificar móvil, escritorio, teclado, errores y estados.
7. Informar criterios cumplidos, pendientes y regresiones.

Usar frontend-design solo para dar coherencia y carácter a la solución aprobada. Nunca sacrificar H1-H10 por originalidad visual.

Detenerse si aparece una decisión de producto no documentada, si el cambio afecta flujos fuera del lote o si no es posible verificar el criterio de aceptación.
```

Claude Code permite guardar subagentes de proyecto en `.claude/agents/`; estos pueden limitar herramientas, cargar skills y trabajar en un `worktree` aislado. Separar auditor y corrector evita que el mismo proceso justifique retrospectivamente sus propios cambios.[^11]

## Formato de salida

```markdown
# Auditoría Nielsen

## Alcance
- Usuario o rol:
- Tareas:
- Rutas:
- Viewports:
- Limitaciones:

## Fortalezas
- Patrón correcto + evidencia + heurística que satisface.

## Top 10
| ID | Hallazgo | H | Severidad | Confianza | Acción |
|---|---|---:|---:|---|---|

## Hallazgos completos
| ID | Ruta | Tarea/paso | Evidencia | H principal | Consecuencia | Sev. | F-I-P | Confianza | Recomendación | Aceptación |
|---|---|---|---|---:|---|---:|---|---|---|---|

## Cobertura
| Heurística | Fortalezas | Problemas | Mayor severidad |
|---|---:|---:|---:|
| H1 |  |  |  |
| H2 |  |  |  |
| H3 |  |  |  |
| H4 |  |  |  |
| H5 |  |  |  |
| H6 |  |  |  |
| H7 |  |  |  |
| H8 |  |  |  |
| H9 |  |  |  |
| H10 |  |  |  |

## Navegación
- Árbol actual.
- Problemas por H1, H2, H3, H4, H6, H7 y H8.
- Árbol propuesto.
- Hipótesis para tree testing.

## Lotes
1. Severidad 4.
2. Severidad 3 sistémica.
3. Severidad 2 repetida.
4. Coherencia estructural y visual.
5. Cosméticos aprobados.

## Validación
- Criterios comprobados.
- Regresiones.
- Preguntas para usuarios reales.