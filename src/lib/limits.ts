/**
 * Límites de los datos: el único lugar donde la interfaz los conoce. Son los mismos CHECK y validaciones de
 * supabase/migrations; `limits.test.ts` falla si uno cambia en la base y no aquí.
 */
export const LIMITS = {
  teamName: { min: 2, max: 60 },
  projectName: { min: 2, max: 80 },
  displayName: { min: 1, max: 80 },
  password: { min: 8, max: 72 },
  email: { max: 254 },
  taskTitle: { min: 1, max: 200 },
  taskDescription: { max: 5000 },
  labels: { count: 10, length: 30 },
  estimateMinutes: { min: 1, max: 100_000 },
  criteria: { count: 20, length: 300 },
  templateFields: { count: 15, label: 80 },
  answer: { length: 5000 },
  links: { count: 10, length: 2000 },
  reviewComment: { max: 2000 },
  evidence: { bytes: 50 * 1024 * 1024, files: 10 },
  domain: { max: 253 },
} as const;

/** Tipos de archivo admitidos como evidencia (igual que `allowed_mime_types` del bucket `task-evidence`). */
export const EVIDENCE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/xml',
  'application/xml',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'application/zip',
  'application/x-zip-compressed',
] as const;

/** Zona horaria de respaldo si el sistema no informa ninguna. */
export const FALLBACK_TIMEZONE = 'UTC';
