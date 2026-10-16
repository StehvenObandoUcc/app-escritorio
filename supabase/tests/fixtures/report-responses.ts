/**
 * 20 respuestas grabadas de una IA para los mismos hechos (AC-13a). Cada una dice si el validador debe aceptarla.
 * Cubren: bloques de código, texto alrededor, coma y punto decimal, fechas del periodo, F1 en el texto,
 * números inventados, hechos inexistentes, correos, nombres, esquema roto y un número en letras (límite aceptado).
 */
import type { Fact } from '../../functions/_shared/report-validator.ts';

export const FACTS: Fact[] = [
  { id: 'F1', metric: 'hours_active', dimension: null, value: 2.7, unit: 'h' },
  { id: 'F2', metric: 'hours_category', dimension: 'ai', value: 1, unit: 'h' },
  { id: 'F3', metric: 'share_category', dimension: 'ai', value: 37, unit: '%' },
  { id: 'F4', metric: 'ai_sessions', dimension: null, value: 2, unit: 'n' },
  { id: 'F5', metric: 'hours_ai_usage', dimension: 'untagged', value: 0.5, unit: 'h' },
  { id: 'F6', metric: 'tasks_done', dimension: null, value: 1, unit: 'n' },
  { id: 'F7', metric: 'tasks_overdue', dimension: null, value: 3, unit: 'n' },
  { id: 'F8', metric: 'cycle_days_avg', dimension: null, value: 0.4, unit: 'd' },
];
export const CONTEXT = { facts: FACTS, names: ['Daniela Ruiz', 'Fede'], periodFrom: '2026-10-05', periodTo: '2026-10-11' };

const json = (o: object) => JSON.stringify(o);
const n = (summary: string, insights: [string, string[]][] = [], recommendations: [string, string[]][] = []) => ({
  summary,
  insights: insights.map(([text, fact_ids]) => ({ text, fact_ids })),
  recommendations: recommendations.map(([text, fact_ids]) => ({ text, fact_ids })),
  insufficient_data: false,
});

export const RESPONSES: { name: string; text: string; ok: boolean }[] = [
  { name: 'JSON limpio', ok: true, text: json(n('Semana con 2,7 h activas.', [['La IA ocupó el 37 % del tiempo activo.', ['F3']]], [['Etiqueta tus sesiones de IA.', ['F5']]])) },
  { name: 'bloque de código', ok: true, text: '```json\n' + json(n('Buen ritmo.', [['Hiciste 2 sesiones de IA.', ['F4']]])) + '\n```' },
  { name: 'texto antes y después', ok: true, text: 'Aquí está:\n' + json(n('Resumen.', [['Terminaste 1 tarea.', ['F6']]])) + '\nEspero que ayude.' },
  { name: 'punto decimal', ok: true, text: json(n('Tiempo activo de 2.7 h.', [['El ciclo medio fue de 0.4 días.', ['F8']]])) },
  { name: 'fechas del periodo', ok: true, text: json(n('Del 5 al 11 de octubre de 2026 trabajaste 2,7 h.', [['Hay 3 tareas vencidas.', ['F7']]])) },
  { name: 'cita F1 en el texto', ok: true, text: json(n('Según F1, 2,7 h activas.', [['F2 muestra 1 h con IA.', ['F2']]])) },
  { name: 'sin datos suficientes', ok: true, text: json({ summary: 'No hay datos suficientes.', insights: [], recommendations: [], insufficient_data: true }) },
  { name: 'número en letras (límite aceptado)', ok: true, text: json(n('Trabajaste tres horas.', [['Una tarea terminada.', ['F6']]])) },
  { name: 'claves de más se descartan', ok: true, text: json({ ...n('Resumen.', [['1 tarea hecha.', ['F6']]]), confidence: 'alta' }) },
  { name: 'redondeo a un decimal', ok: true, text: json(n('Unas 2,70 h activas.', [['La IA sumó 1,0 h.', ['F2']]])) },
  { name: 'número inventado en el resumen', ok: false, text: json(n('Trabajaste 8 h.', [['1 tarea hecha.', ['F6']]])) },
  { name: 'número de otro hecho en una observación', ok: false, text: json(n('Resumen.', [['Hay 3 tareas vencidas.', ['F6']]])) },
  { name: 'cálculo propio', ok: false, text: json(n('Resumen.', [['Sin IA trabajaste 1,7 h.', ['F1', 'F2']]])) },
  { name: 'hecho inexistente', ok: false, text: json(n('Resumen.', [['Algo pasó.', ['F99']]])) },
  { name: 'correo', ok: false, text: json(n('Escribe a daniela@empresa.com.', [['1 tarea hecha.', ['F6']]])) },
  { name: 'nombre de un miembro', ok: false, text: json(n('Daniela tuvo buen ritmo.', [['1 tarea hecha.', ['F6']]])) },
  { name: 'nombre sin tilde ni mayúscula', ok: false, text: json(n('Resumen.', [['fede terminó 1 tarea.', ['F6']]])) },
  { name: 'sin JSON', ok: false, text: 'Lo siento, no puedo generar el reporte.' },
  { name: 'falta un campo', ok: false, text: json({ summary: 'Resumen.', insights: [] }) },
  { name: 'demasiadas recomendaciones', ok: false, text: json(n('Resumen.', [], [['a', ['F1']], ['b', ['F1']], ['c', ['F1']], ['d', ['F1']]])) },
];
