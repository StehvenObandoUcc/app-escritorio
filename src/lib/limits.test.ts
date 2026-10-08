import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVIDENCE_TYPES, LIMITS } from './limits';

const sql = readdirSync('supabase/migrations')
  .filter((f) => f.endsWith('.sql'))
  .map((f) => readFileSync(join('supabase/migrations', f), 'utf8'))
  .join('\n');

/** Cada límite de la interfaz debe aparecer tal cual en la validación de la base. */
const CHECKS: [string, string][] = [
  ['nombre de equipo', `char_length(name) between ${LIMITS.teamName.min} and ${LIMITS.teamName.max}`],
  ['nombre de proyecto', `char_length(name) between ${LIMITS.projectName.min} and ${LIMITS.projectName.max}`],
  ['título de tarea', `char_length(title) between ${LIMITS.taskTitle.min} and ${LIMITS.taskTitle.max}`],
  ['descripción', `char_length(description) <= ${LIMITS.taskDescription.max}`],
  ['número de etiquetas', `cardinality(p_labels) <= ${LIMITS.labels.count}`],
  ['largo de etiqueta', `char_length(l) between 1 and ${LIMITS.labels.length}`],
  ['estimación', `estimate_minutes between ${LIMITS.estimateMinutes.min} and ${LIMITS.estimateMinutes.max}`],
  ['número de criterios', `> ${LIMITS.criteria.count} then`],
  ['largo de criterio', `char_length(text) between 1 and ${LIMITS.criteria.length}`],
  ['campos del formulario', `not between 1 and ${LIMITS.templateFields.count}`],
  ['nombre de campo', `not between 1 and ${LIMITS.templateFields.label}`],
  ['respuesta', `char_length(v_value) > ${LIMITS.answer.length}`],
  ['número de enlaces', `> ${LIMITS.links.count}`],
  ['largo de enlace', `char_length(l) > ${LIMITS.links.length}`],
  ['comentario', `not between 1 and ${LIMITS.reviewComment.max}`],
  ['evidencia', `${LIMITS.evidence.bytes}`],
];

describe('límites de la interfaz iguales a los de la base', () => {
  it.each(CHECKS)('%s', (_, fragment) => {
    expect(sql).toContain(fragment);
  });

  it('los tipos de evidencia son los del bucket', () => {
    for (const type of EVIDENCE_TYPES) expect(sql).toContain(`'${type}'`);
  });
});
