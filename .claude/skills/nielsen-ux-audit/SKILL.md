---
name: nielsen-ux-audit
description: Audita y mejora una interfaz existente usando prioritariamente las 10 heurísticas de Nielsen. Usar para revisar navegación, flujos, arquitectura de información, consistencia, carga cognitiva, errores, layouts, responsive y coherencia UI/UX. No reducir la solución a colores ni implementar antes de terminar el diagnóstico.
---

# Propósito

Evaluar el código y la aplicación ejecutada usando las 10 heurísticas de Nielsen como marco principal. Identificar evidencia, clasificar severidad y proponer correcciones verificables antes de modificar código.

# Reglas

- Auditar tareas reales, no pantallas aisladas.
- Revisar la aplicación ejecutada además del código.
- No editar durante la fase de diagnóstico.
- No registrar gustos personales como problemas de usabilidad.
- Vincular cada hallazgo a una heurística principal H1-H10.
- Separar severidad y confianza.
- Conservar y documentar los patrones que funcionan.
- Priorizar tarea, control, errores, orientación y consistencia antes que estética.
- No afirmar que algo es intuitivo sin evidencia de usuarios.
- No usar color para ocultar problemas de estructura o navegación.

# Heurísticas

- H1: Visibilidad del estado del sistema.
- H2: Correspondencia con el mundo real.
- H3: Control y libertad del usuario.
- H4: Consistencia y estándares.
- H5: Prevención de errores.
- H6: Reconocimiento antes que recuerdo.
- H7: Flexibilidad y eficiencia.
- H8: Diseño estético y minimalista.
- H9: Reconocimiento, diagnóstico y recuperación de errores.
- H10: Ayuda y documentación.

# Procedimiento

## Preparar

1. Identificar usuario, objetivo y contexto.
2. Seleccionar entre tres y cinco tareas críticas.
3. Inventariar rutas, navegación, layouts y componentes.
4. Ejecutar la aplicación.
5. Guardar una línea base con pasos y capturas en móvil y escritorio.

## Recorrer

Para cada tarea:

1. Completar una primera pasada para entender el flujo.
2. Repetirla inspeccionando cada paso contra H1-H10.
3. Probar ruta feliz, error, vacío, loading, volver, cancelar y reintentar.
4. Revisar teclado, foco visible y responsive.
5. Registrar cada problema por separado.

## Registrar

Por cada hallazgo indicar:

- ID.
- Ruta, viewport y tarea.
- Paso reproducible.
- Evidencia.
- Heurística principal y secundaria opcional.
- Problema observable.
- Consecuencia para el usuario.
- Severidad Nielsen 0-4.
- Justificación por frecuencia, impacto y persistencia.
- Confianza baja, media o alta.
- Recomendación concreta.
- Criterio de aceptación verificable.

## Priorizar

Ordenar primero por severidad. En empates, priorizar:

1. Tarea crítica.
2. Patrón repetido en más pantallas.
3. Riesgo de error o pérdida de datos.
4. Mayor carga mental.
5. Menor riesgo técnico para corregirlo.

## Proponer

Entregar:

1. Fortalezas que deben conservarse.
2. Top 10 de hallazgos.
3. Tabla completa por H1-H10.
4. Mapa de navegación actual y propuesto.
5. Problemas sistémicos de componentes y layouts.
6. Plan de corrección por lotes.
7. Aspectos que requieren validación con usuarios.

## Implementar

Implementar únicamente después de aprobación explícita. Corregir un lote pequeño a la vez. Resolver primero la causa compartida en layouts, componentes o navegación antes de aplicar parches por pantalla.

## Validar

1. Repetir exactamente las tareas de la línea base.
2. Confirmar cada criterio de aceptación.
3. Comparar capturas antes y después.
4. Ejecutar pruebas existentes, Playwright y axe si están disponibles.
5. Informar regresiones y criterios pendientes.
6. No declarar éxito únicamente porque la página compila o se ve más limpia.