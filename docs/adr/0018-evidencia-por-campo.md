# ADR-0018 · Evidencia por campo del formulario de entrega

Fecha: 2026-10-08 · Estado: aceptado (por StehvenObando)

## Contexto
El formulario de entrega solo tenía campos de texto, enlace o casilla, y aparte un único selector de archivos. No se podía decir «esta tarea exige una captura» ni que un campo fuera solo de imágenes.

## Decisión
- **Tipos de campo:**
  - **texto**;
  - **enlace** (`http://` o `https://`);
  - **casilla**;
  - **imagen**: solo PNG, JPG, GIF o WEBP;
  - **archivo**: los tipos admitidos de evidencia.
- **Un campo de imagen o de archivo pide archivos.** Si es obligatorio, sin archivo no se envía.
- **Se suben antes de enviar.** La respuesta del campo es la lista de ids de sus adjuntos.
- **Al enviar**, la base comprueba que cada adjunto sea de la tarea, de quien envía, aún sin entregar y del tipo del campo (`content_type` sale de Storage). Después los liga a la revisión.
- **Desaparecen** el selector de archivos suelto y el área de enlaces extra.
- **Formulario por defecto:** «Qué se hizo» (texto obligatorio), «Enlace de evidencia» (opcional) y «Capturas» (imagen, opcional).

## Consecuencias
- Migración `20261008000004_evidencia_por_campo.sql`.
- `task_attachments` gana `content_type`.
- Las entregas anteriores conservan sus enlaces y archivos y se muestran aparte.
