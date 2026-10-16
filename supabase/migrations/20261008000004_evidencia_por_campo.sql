-- Evidencia por campo del formulario de entrega (ADR-0018)
-- Los campos del formulario pueden ser texto, enlace (http/https), casilla, imagen o archivo. Un campo de imagen
-- o de archivo se responde con archivos subidos a la tarea; si es obligatorio, sin archivo no se envía.
-- Pruebas: supabase/tests/evidencia_por_campo.test.ts
--
--   · 20261008000003 ya está aplicada: aquí se amplía, no se edita.
--   · La respuesta de un campo de imagen o archivo es la lista de ids de task_attachments, separados por coma.
--     Los adjuntos se suben antes de enviar (sin revisión) y al enviar quedan ligados a la revisión.

-- ───────────────────────── Tipo de cada adjunto ─────────────────────────

alter table public.task_attachments add column content_type text not null default 'application/octet-stream'
  check (char_length(content_type) between 3 and 127);

-- El tamaño y el tipo salen de Storage, no del cliente.
create or replace function public.add_task_attachment(p_task uuid, p_path text, p_name text, p_review uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_size bigint;
  v_type text;
begin
  if public.evidence_task(p_path) is distinct from p_task or not public.can_upload_evidence(p_path) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_review is not null and not exists (select 1 from public.task_reviews r where r.id = p_review and r.task_id = p_task) then
    raise exception 'La revisión no es de esta tarea' using errcode = '22023';
  end if;
  select (o.metadata ->> 'size')::bigint, coalesce(nullif(o.metadata ->> 'mimetype', ''), 'application/octet-stream')
  into v_size, v_type
  from storage.objects o where o.bucket_id = 'task-evidence' and o.name = p_path;
  if v_size is null then
    raise exception 'El archivo no se subió: inténtalo de nuevo' using errcode = '22023';
  end if;
  insert into public.task_attachments (task_id, review_id, path, name, size, uploaded_by, content_type)
  values (p_task, p_review, p_path, trim(p_name), v_size, auth.uid(), v_type)
  returning id into v_id;
  perform public.log_task_event(p_task, 'evidence_added', jsonb_build_object('name', trim(p_name)));
  return v_id;
end $$;

-- ───────────────────────── Tipos de campo ─────────────────────────

create or replace function public.set_review_template(p_project uuid, p_template jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_field jsonb;
begin
  if not public.can_manage_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if jsonb_typeof(p_template) <> 'array' or jsonb_array_length(p_template) not between 1 and 15 then
    raise exception 'El formulario de entrega debe tener entre 1 y 15 campos' using errcode = '22023';
  end if;
  for v_field in select * from jsonb_array_elements(p_template) loop
    if coalesce(v_field ->> 'key', '') !~ '^[a-z0-9_]{1,30}$'
       or char_length(coalesce(v_field ->> 'label', '')) not between 1 and 80
       or coalesce(v_field ->> 'kind', '') not in ('text', 'url', 'checklist', 'image', 'file')
       or jsonb_typeof(v_field -> 'required') is distinct from 'boolean' then
      raise exception 'Campo del formulario inválido: cada campo necesita clave, nombre, tipo (texto, enlace, casilla, imagen o archivo) y si es obligatorio'
        using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct f ->> 'key') from jsonb_array_elements(p_template) f) <> jsonb_array_length(p_template) then
    raise exception 'Dos campos del formulario no pueden tener la misma clave' using errcode = '22023';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_template) f
    where f ->> 'key' = 'summary' and f ->> 'kind' = 'text' and (f -> 'required')::boolean
  ) then
    raise exception 'El campo «Qué se hizo» debe existir y ser texto obligatorio' using errcode = '22023';
  end if;
  update public.projects set settings = settings || jsonb_build_object('review_template', p_template) where id = p_project;
end $$;

-- Formulario por defecto: «Qué se hizo» (obligatorio), un enlace y capturas de pantalla (opcionales).
create or replace function public.review_template(p_project uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.settings -> 'review_template', '[
    {"key": "summary", "label": "Qué se hizo", "kind": "text", "required": true},
    {"key": "evidence", "label": "Enlace de evidencia", "kind": "url", "required": false},
    {"key": "screenshots", "label": "Capturas", "kind": "image", "required": false}
  ]'::jsonb)
  from public.projects p where p.id = p_project
$$;

-- ───────────────────────── Validación de la entrega ─────────────────────────

-- Ids de adjuntos que responden a los campos de imagen o archivo.
create function public.delivery_attachment_ids(p_task uuid, p_answers jsonb) returns uuid[]
language sql stable security definer set search_path = ''
as $$
  select coalesce(array_agg(distinct trim(id)::uuid), '{}')
  from jsonb_array_elements(public.review_template(public.task_project(p_task))) f,
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
  for v_field in select * from jsonb_array_elements(public.review_template(public.task_project(p_task))) loop
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

-- Liga a la revisión los adjuntos que responden al formulario.
create function public.link_delivery_attachments(p_task uuid, p_answers jsonb, p_review uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.task_attachments set review_id = p_review
  where task_id = p_task and review_id is null and id = any (public.delivery_attachment_ids(p_task, p_answers))
$$;

create or replace function public.submit_for_review(
  p_task uuid, p_answers jsonb, p_links text[] default '{}', p_reviewer uuid default null,
  p_criteria_met uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
  v_id uuid;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not public.is_task_worker(p_task) or not public.can_see_project(v_task.project_id) then
    raise exception 'No permitido: envía a revisión el responsable o un apoyo de la tarea' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  if v_task.status not in ('todo', 'doing') then
    raise exception 'La tarea ya está en revisión o hecha' using errcode = '22023';
  end if;
  perform public.assert_delivery(p_task, p_answers, p_links, p_criteria_met);
  if p_reviewer is not null and (p_reviewer = auth.uid() or not exists (
    select 1 from public.project_members pm where pm.project_id = v_task.project_id and pm.user_id = p_reviewer
  )) then
    raise exception 'El revisor debe ser otra persona del proyecto' using errcode = '22023';
  end if;

  update public.task_criteria set met = true where task_id = p_task;
  insert into public.task_reviews (task_id, submitted_by, answers, links, reviewer_id)
  values (p_task, auth.uid(), coalesce(p_answers, '{}'::jsonb), coalesce(p_links, '{}'), p_reviewer)
  returning id into v_id;
  perform public.link_delivery_attachments(p_task, p_answers, v_id);
  update public.tasks set status = 'review', started_at = coalesce(started_at, now()) where id = p_task;
  perform public.log_task_event(p_task, 'review_submitted', jsonb_build_object('review', v_id, 'reviewer', p_reviewer));
  return v_id;
end $$;

create or replace function public.complete_task(
  p_task uuid, p_answers jsonb, p_links text[] default '{}', p_criteria_met uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
  v_id uuid;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not public.can_manage_project(v_task.project_id) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  if v_task.status = 'done' then
    raise exception 'La tarea ya está hecha' using errcode = '22023';
  end if;
  perform public.assert_delivery(p_task, p_answers, p_links, p_criteria_met);

  update public.task_criteria set met = true where task_id = p_task;
  update public.task_reviews
  set status = 'approved', decided_by = auth.uid(), decided_at = now(),
      answers = coalesce(p_answers, '{}'::jsonb), links = coalesce(p_links, '{}')
  where task_id = p_task and status = 'pending'
  returning id into v_id;
  if v_id is null then
    insert into public.task_reviews (task_id, submitted_by, answers, links, status, decided_by, decided_at)
    values (p_task, auth.uid(), coalesce(p_answers, '{}'::jsonb), coalesce(p_links, '{}'), 'approved', auth.uid(), now())
    returning id into v_id;
    perform public.log_task_event(p_task, 'review_submitted', jsonb_build_object('review', v_id, 'direct', true));
  end if;
  perform public.link_delivery_attachments(p_task, p_answers, v_id);
  update public.tasks set status = 'done', started_at = coalesce(started_at, now()), completed_at = now() where id = p_task;
  perform public.log_task_event(p_task, 'review_approved', jsonb_build_object('review', v_id, 'direct', true));
  return v_id;
end $$;

-- ───────────────────── Lecturas: el tipo de cada adjunto ─────────────────────

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
        'status', t.status, 'dueDate', t.due_date, 'labels', to_jsonb(t.labels), 'estimateMinutes', t.estimate_minutes,
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

create or replace function public.task_history(p_task uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce(public.can_see_project(public.task_project(p_task)), false) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'events', coalesce((
      select jsonb_agg(jsonb_build_object('kind', e.kind, 'actor', e.actor, 'actorName', pr.display_name,
                                          'details', e.details, 'createdAt', e.created_at) order by e.created_at, e.id)
      from public.task_events e left join public.profiles pr on pr.id = e.actor
      where e.task_id = p_task), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'submittedBy', r.submitted_by, 'reviewerId', r.reviewer_id, 'answers', r.answers,
        'links', to_jsonb(r.links), 'status', r.status, 'decidedBy', r.decided_by, 'comment', r.comment,
        'createdAt', r.created_at, 'decidedAt', r.decided_at,
        'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'size', a.size, 'contentType', a.content_type))
                                 from public.task_attachments a where a.review_id = r.id), '[]'::jsonb)
      ) order by r.created_at desc)
      from public.task_reviews r where r.task_id = p_task), '[]'::jsonb)
  );
end $$;

revoke execute on function
  public.delivery_attachment_ids(uuid, jsonb),
  public.link_delivery_attachments(uuid, jsonb, uuid)
from public, anon, authenticated;
