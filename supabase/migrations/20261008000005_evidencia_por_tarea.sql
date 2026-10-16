-- Evidencia requerida por tarea (ADR-0020)
-- Al crear o editar una tarea se eligen, de un catálogo fijo, los tipos de evidencia que exige: los habituales en
-- empresas (captura, documento, hoja de cálculo, presentación, video, enlace, pull request, acta firmada,
-- factura, ZIP). Al entregar, cada uno es un campo obligatorio con sus formatos. Se suma al formulario del proyecto.
-- Pruebas: supabase/tests/evidencia_por_tarea.test.ts
--   · 20261008000004 ya está aplicada: aquí se amplía, no se edita.

-- ───────────────────────── Catálogo ─────────────────────────

-- Clave → nombre, tipo de campo y formatos admitidos. Espejo en src/lib/evidence.ts (prueba evidence.test.ts).
create function public.evidence_catalog() returns jsonb
language sql immutable set search_path = ''
as $$
  select '{
    "screenshot":   {"label": "Captura de pantalla", "kind": "image", "types": ["image/png", "image/jpeg", "image/webp", "image/gif"]},
    "photo":        {"label": "Foto", "kind": "image", "types": ["image/png", "image/jpeg", "image/webp", "image/gif"]},
    "document":     {"label": "Documento (PDF o Word)", "kind": "file", "types": ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]},
    "spreadsheet":  {"label": "Hoja de cálculo (Excel o CSV)", "kind": "file", "types": ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"]},
    "presentation": {"label": "Presentación (PowerPoint o PDF)", "kind": "file", "types": ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "application/pdf"]},
    "video":        {"label": "Video o grabación de pantalla", "kind": "file", "types": ["video/mp4", "video/webm", "video/quicktime"]},
    "link":         {"label": "Enlace (Drive, SharePoint, Figma…)", "kind": "url"},
    "code":         {"label": "Pull request o commit", "kind": "url"},
    "signed":       {"label": "Acta o documento firmado", "kind": "file", "types": ["application/pdf", "image/png", "image/jpeg"]},
    "receipt":      {"label": "Factura o comprobante", "kind": "file", "types": ["application/pdf", "image/png", "image/jpeg", "text/xml", "application/xml"]},
    "archive":      {"label": "Archivo comprimido (ZIP)", "kind": "file", "types": ["application/zip", "application/x-zip-compressed"]}
  }'::jsonb
$$;

alter table public.tasks add column evidence text[] not null default '{}';
alter table public.tasks add constraint tasks_evidence_check check (
  cardinality(evidence) <= 11 and evidence <@ array[
    'screenshot', 'photo', 'document', 'spreadsheet', 'presentation', 'video', 'link', 'code', 'signed', 'receipt', 'archive'
  ]::text[]
);

-- Los formatos del catálogo entran al bucket; videos hasta 50 MB.
update storage.buckets
set file_size_limit = 52428800,
    allowed_mime_types = array[
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/pdf', 'text/plain', 'text/csv', 'text/markdown', 'text/xml', 'application/xml',
      'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/zip', 'application/x-zip-compressed'
    ]
where id = 'task-evidence';
alter table public.task_attachments drop constraint task_attachments_size_check;
alter table public.task_attachments add constraint task_attachments_size_check check (size between 1 and 52428800);

-- ───────────────────────── Campos de entrega de una tarea ─────────────────────────

-- Formulario del proyecto más un campo obligatorio por cada evidencia que exige la tarea.
create function public.task_delivery_fields(p_task uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select public.review_template(t.project_id) || coalesce((
    select jsonb_agg(jsonb_build_object('key', 'ev_' || e, 'label', c -> e ->> 'label', 'kind', c -> e ->> 'kind', 'required', true)
                     || case when c -> e ? 'types' then jsonb_build_object('types', c -> e -> 'types') else '{}'::jsonb end
                     order by ord)
    from unnest(t.evidence) with ordinality as x(e, ord), (select public.evidence_catalog() as c) cat
  ), '[]'::jsonb)
  from public.tasks t where t.id = p_task
$$;

create or replace function public.delivery_attachment_ids(p_task uuid, p_answers jsonb) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct trim(id)::uuid), '{}')
  from jsonb_array_elements(public.task_delivery_fields(p_task)) f,
       unnest(string_to_array(coalesce(p_answers ->> (f ->> 'key'), ''), ',')) id
  where f ->> 'kind' in ('image', 'file')
    and trim(id) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;

create or replace function public.assert_delivery(p_task uuid, p_answers jsonb, p_links text[], p_criteria_met uuid[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_field jsonb;
  v_value text;
  v_ids text[];
  v_id text;
  v_type text;
begin
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Las respuestas del formulario no tienen el formato esperado' using errcode = '22023';
  end if;
  for v_field in select * from jsonb_array_elements(public.task_delivery_fields(p_task)) loop
    v_value := trim(coalesce(p_answers ->> (v_field ->> 'key'), ''));
    if (v_field ->> 'required')::boolean and (v_value = '' or (v_field ->> 'kind' = 'checklist' and v_value <> 'true')) then
      raise exception 'Falta completar «%» en el formulario de entrega', v_field ->> 'label' using errcode = '22023';
    end if;
    if v_field ->> 'kind' = 'url' and v_value <> '' and v_value !~ '^https?://\S+$' then
      raise exception '«%» debe ser un enlace que empiece por http:// o https://', v_field ->> 'label' using errcode = '22023';
    end if;
    if char_length(v_value) > 5000 then
      raise exception '«%» supera los 5000 caracteres', v_field ->> 'label' using errcode = '22023';
    end if;
    if v_field ->> 'kind' in ('image', 'file') and v_value <> '' then
      v_ids := string_to_array(v_value, ',');
      if cardinality(v_ids) > 10 then
        raise exception '«%» admite como máximo 10 archivos', v_field ->> 'label' using errcode = '22023';
      end if;
      foreach v_id in array v_ids loop
        select a.content_type into v_type
        from public.task_attachments a
        where trim(v_id) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          and a.id = trim(v_id)::uuid and a.task_id = p_task and a.uploaded_by = auth.uid() and a.review_id is null;
        if v_type is null then
          raise exception 'Un archivo de «%» no es válido: vuelve a subirlo', v_field ->> 'label' using errcode = '22023';
        end if;
        if v_field ->> 'kind' = 'image' and v_type not like 'image/%' then
          raise exception '«%» solo admite imágenes', v_field ->> 'label' using errcode = '22023';
        end if;
        if v_field ? 'types' and not (v_field -> 'types') ? v_type then
          raise exception '«%» no admite ese tipo de archivo', v_field ->> 'label' using errcode = '22023';
        end if;
      end loop;
    end if;
  end loop;
  if cardinality(coalesce(p_links, '{}')) > 10
     or exists (select 1 from unnest(coalesce(p_links, '{}')) l where l !~ '^https?://\S+$' or char_length(l) > 2000) then
    raise exception 'Hasta 10 enlaces de evidencia, cada uno empezando por http:// o https://' using errcode = '22023';
  end if;
  if exists (select 1 from public.task_criteria c where c.task_id = p_task and c.id <> all (coalesce(p_criteria_met, '{}'))) then
    raise exception 'Marca todos los criterios de aceptación antes de enviar a revisión' using errcode = '22023';
  end if;
end $$;

-- ───────────────────────── Elegir la evidencia de una tarea ─────────────────────────

-- La elige quien gestiona el proyecto o quien creó la tarea.
create function public.set_task_evidence(p_task uuid, p_evidence text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not (public.can_manage_project(v_task.project_id)
     or (v_task.created_by = auth.uid() and public.can_see_project(v_task.project_id))) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  if exists (select 1 from unnest(coalesce(p_evidence, '{}')) e where not public.evidence_catalog() ? e) then
    raise exception 'Tipo de evidencia desconocido' using errcode = '22023';
  end if;
  update public.tasks set evidence = (select coalesce(array_agg(distinct e order by e), '{}') from unnest(coalesce(p_evidence, '{}')) e)
  where id = p_task;
  perform public.log_task_event(p_task, 'edited', jsonb_build_object('evidence', to_jsonb(coalesce(p_evidence, '{}'))));
end $$;

-- ───────────────────── Lectura: la evidencia de cada tarea ─────────────────────

create or replace function public.team_work(p_team uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  with visible as (
    select p.* from public.projects p where p.team_id = p_team and public.can_see_project(p.id)
  ),
  t as (
    select t.*, public.task_seconds(t.id) as own_seconds
    from public.tasks t join visible v on v.id = t.project_id
  ),
  effective as (
    select t.id, t.project_id,
           coalesce(t.estimate_minutes, (select sum(c.estimate_minutes) from t c where c.parent_id = t.id)) as estimate
    from t where t.parent_id is null
  )
  select jsonb_build_object(
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', v.id, 'name', v.name, 'archivedAt', v.archived_at, 'myRole', public.project_role(v.id),
        'reviewTemplate', public.review_template(v.id),
        'tasksTotal', (select count(*) from t where t.project_id = v.id),
        'tasksDone', (select count(*) from t where t.project_id = v.id and t.status = 'done'),
        'pendingReviews', (select count(*) from t where t.project_id = v.id and t.status = 'review'),
        'loggedSeconds', (select coalesce(sum(own_seconds), 0) from t where t.project_id = v.id),
        'estimateMinutes', (select coalesce(sum(e.estimate), 0) from effective e where e.project_id = v.id)
      ) order by v.archived_at nulls first, v.name)
      from visible v), '[]'::jsonb),
    'tasks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', t.id, 'projectId', t.project_id, 'parentId', t.parent_id, 'type', t.type, 'title', t.title,
        'description', t.description, 'assigneeId', t.assignee_id, 'assigneeCanManage', t.assignee_can_manage,
        'status', t.status, 'evidence', to_jsonb(t.evidence), 'dueDate', t.due_date, 'labels', to_jsonb(t.labels), 'estimateMinutes', t.estimate_minutes,
        'loggedSeconds', t.own_seconds + coalesce((select sum(c.own_seconds) from t c where c.parent_id = t.id), 0),
        'startedAt', t.started_at, 'completedAt', t.completed_at, 'createdBy', t.created_by, 'updatedAt', t.updated_at,
        'collaborators', coalesce((select jsonb_agg(c.user_id) from public.task_collaborators c where c.task_id = t.id), '[]'::jsonb),
        'criteria', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'text', c.text, 'met', c.met) order by c.position)
                              from public.task_criteria c where c.task_id = t.id), '[]'::jsonb),
        'pendingReview', (
          select jsonb_build_object(
            'id', r.id, 'submittedBy', r.submitted_by, 'reviewerId', r.reviewer_id, 'answers', r.answers,
            'links', to_jsonb(r.links), 'createdAt', r.created_at,
            'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'size', a.size, 'contentType', a.content_type))
                                     from public.task_attachments a where a.review_id = r.id), '[]'::jsonb))
          from public.task_reviews r where r.task_id = t.id and r.status = 'pending')
      ) order by t.created_at)
      from t), '[]'::jsonb),
    'members', coalesce((
      select jsonb_object_agg(v.id, coalesce((
        select jsonb_agg(jsonb_build_object('userId', pm.user_id, 'role', pm.role, 'displayName', pr.display_name))
        from public.project_members pm left join public.profiles pr on pr.id = pm.user_id
        where pm.project_id = v.id), '[]'::jsonb))
      from visible v), '{}'::jsonb)
  )
$$;

revoke execute on function
  public.evidence_catalog(),
  public.task_delivery_fields(uuid),
  public.set_task_evidence(uuid, text[])
from public, anon;
grant execute on function public.set_task_evidence(uuid, text[]) to authenticated;
