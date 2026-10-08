/**
 * Catálogo de evidencia que puede exigir una tarea (ADR-0020): los tipos habituales en empresas. Es el espejo de
 * `evidence_catalog()` en supabase/migrations; `evidence.test.ts` falla si no coinciden.
 */
import type { ReviewField } from '@/cloud/contract';
import { t } from '@/i18n';

const IMAGES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const EVIDENCE_CATALOG = [
  { key: 'screenshot', kind: 'image', types: IMAGES },
  { key: 'photo', kind: 'image', types: IMAGES },
  { key: 'document', kind: 'file', types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'] },
  { key: 'spreadsheet', kind: 'file', types: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'] },
  { key: 'presentation', kind: 'file', types: ['application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/pdf'] },
  { key: 'video', kind: 'file', types: ['video/mp4', 'video/webm', 'video/quicktime'] },
  { key: 'link', kind: 'url', types: [] },
  { key: 'code', kind: 'url', types: [] },
  { key: 'signed', kind: 'file', types: ['application/pdf', 'image/png', 'image/jpeg'] },
  { key: 'receipt', kind: 'file', types: ['application/pdf', 'image/png', 'image/jpeg', 'text/xml', 'application/xml'] },
  { key: 'archive', kind: 'file', types: ['application/zip', 'application/x-zip-compressed'] },
] as const satisfies readonly { key: string; kind: 'image' | 'file' | 'url'; types: readonly string[] }[];

/** Extensión legible de cada formato, para la ayuda de los campos («PDF, DOC, DOCX»). */
const EXTENSION: Record<string, string> = {
  'image/png': 'PNG',
  'image/jpeg': 'JPG',
  'image/webp': 'WEBP',
  'image/gif': 'GIF',
  'application/pdf': 'PDF',
  'application/msword': 'DOC',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'application/vnd.ms-excel': 'XLS',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'XLSX',
  'text/csv': 'CSV',
  'application/vnd.ms-powerpoint': 'PPT',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'PPTX',
  'video/mp4': 'MP4',
  'video/webm': 'WEBM',
  'video/quicktime': 'MOV',
  'text/xml': 'XML',
  'application/xml': 'XML',
  'application/zip': 'ZIP',
  'application/x-zip-compressed': 'ZIP',
};
export const formatsOf = (types: readonly string[]) => [...new Set(types.map((x) => EXTENSION[x] ?? x))].join(', ');

export type EvidenceKey = (typeof EVIDENCE_CATALOG)[number]['key'];
export const EVIDENCE_KEYS = EVIDENCE_CATALOG.map((e) => e.key);

export const evidenceLabel = (key: string) => (EVIDENCE_KEYS.includes(key as EvidenceKey) ? t(`evidence.kinds.${key as EvidenceKey}`) : key);

/** Campo del formulario de entrega con los formatos que admite (vacío = los del tipo de campo). */
export type DeliveryField = ReviewField & { accept?: readonly string[] };

/** Formulario del proyecto más un campo obligatorio por cada evidencia de la tarea (igual que `task_delivery_fields`). */
export function deliveryFields(template: ReviewField[], evidence: readonly string[]): DeliveryField[] {
  const extra = [...evidence].sort().flatMap((key) => {
    const item = EVIDENCE_CATALOG.find((e) => e.key === key);
    return item ? [{ key: `ev_${key}`, label: evidenceLabel(key), kind: item.kind, required: true, accept: item.types.length ? item.types : undefined } as DeliveryField] : [];
  });
  return [...template, ...extra];
}
