# ADR-0020 · Evidencia requerida por tarea, de un catálogo empresarial

Fecha: 2026-10-08 · Estado: aceptado (por StehvenObando)

## Contexto
La evidencia solo se configuraba por proyecto. El responsable pide elegirla al crear o editar cada tarea, entre los tipos habituales en empresas.

## Decisión
- **Catálogo fijo** (`evidence_catalog()` en la base, espejo en `src/lib/evidence.ts`), cada tipo con sus formatos:

  | Tipo | Formatos |
  |---|---|
  | Captura de pantalla | imagen |
  | Foto | imagen |
  | Documento | PDF, DOC, DOCX |
  | Hoja de cálculo | XLS, XLSX, CSV |
  | Presentación | PPT, PPTX, PDF |
  | Video o grabación de pantalla | MP4, WEBM, MOV |
  | Enlace (Drive, SharePoint, Figma…) | enlace |
  | Pull request o commit | enlace |
  | Acta o documento firmado | PDF o imagen |
  | Factura o comprobante | PDF, imagen o XML |
  | Archivo comprimido | ZIP |

- **Quién elige.** Al crear o editar la tarea, quien gestiona el proyecto o quien la creó marca los tipos (`tasks.evidence`, `set_task_evidence`).
- **Al entregar** (enviar a revisión o completar), cada tipo marcado es un campo obligatorio después del formulario del proyecto. La base comprueba los formatos de cada uno.
- **Tamaño.** El bucket admite estos formatos y sube el límite a 50 MB por archivo, por los videos.

## Consecuencias
- Migración `20261008000005_evidencia_por_tarea.sql`.
- Una prueba compara el catálogo de la interfaz con el de la base.
