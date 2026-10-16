-- Completar, tomar y borrar trabajo; formulario de entrega fijo; evidencia segura (ADR-0016)
-- Reglas: docs/ROLES.md filas 31 a 34. Spec: docs/specs/F3-proyectos-y-tareas.md (v3, AC-36 a AC-41)
-- Pruebas: supabase/tests/completar_y_borrar.test.ts
--
-- Decisiones de esta migración:
--   · 20261008000002 ya está aplicada: aquí se amplía, no se edita.
--   · La validación del formulario de entrega vive en una sola función (assert_delivery) que usan
--     submit_for_review y complete_task.
--   · Borrar conserva el tiempo registrado: time_entries.task_id queda en null (on delete set null).

-- ───────────────────────── Auditoría: borrados ─────────────────────────

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
  'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined',
  'policy_changed', 'project_deleted', 'task_deleted'
));

-- ───────────────────── Formulario de entrega fijo (AC-38) ─────────────────────

-- Corrige las plantillas guardadas: «Qué se hizo» (summary) siempre es texto obligatorio.
update public.projects p
set settings = jsonb_set(p.settings, '{review_template}', (
  select jsonb_agg(case when f ->> 'key' = 'summary'
                        then f || '{"kind": "text", "required": true}'::jsonb else f end order by ord)
  from jsonb_array_elements(p.settings -> 'review_template') with ordinality as x(f, ord)
))
where jsonb_typeof(p.settings -> 'review_template') = 'array';

update public.projects p
set settings = jsonb_set(p.settings, '{review_template}',
  '[{"key": "summary", "label": "Qué se hizo", "kind": "text", "required": true}]'::jsonb || (p.settings -> 'review_template'))
where jsonb_typeof(p.settings -> 'review_template') = 'array'
  and not exists (select 1 from jsonb_array_elements(p.settings -> 'review_template') f where f ->> 'key' = 'summary');

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
       or coalesce(v_field ->> 'kind', '') not in ('text', 'url', 'checklist')
       or jsonb_typeof(v_field -> 'required') is distinct from 'boolean' then
      raise exception 'Campo del formulario inválido: cada campo necesita clave, nombre, tipo (texto, enlace o casilla) y si es obligatorio'
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

-- ───────────────────── Validación común de la entrega ─────────────────────

-- Formulario del proyecto, enlaces y criterios. No comprueba permisos ni estado: eso lo hace quien la llama.
create function public.assert_delivery(p_task uuid, p_answers jsonb, p_links text[], p_criteria_met uuid[]) returns void
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_field jsonb;
  v_value text;
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
  end loop;
  if cardinality(coalesce(p_links, '{}')) > 10
     or exists (select 1 from unnest(coalesce(p_links, '{}')) l where l !~ '^https?://\S+$' or char_length(l) > 2000) then
    raise exception 'Hasta 10 enlaces de evidencia, cada uno empezando por http:// o https://' using errcode = '22023';
  end if;
  if exists (select 1 from public.task_criteria c where c.task_id = p_task and c.id <> all (coalesce(p_criteria_met, '{}'))) then
    raise exception 'Marca todos los criterios de aceptación antes de enviar a revisión' using errcode = '22023';
  end if;
end $$;

-- Igual que en 20261008000002, ahora con la validación común.
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
  update public.tasks set status = 'review', started_at = coalesce(started_at, now()) where id = p_task;
  perform public.log_task_event(p_task, 'review_submitted', jsonb_build_object('review', v_id, 'reviewer', p_reviewer));
  return v_id;
end $$;

-- ───────────────────── Completar directamente (fila 32, AC-36) ─────────────────────

-- Quien gestiona el proyecto entrega y aprueba en un paso. Si había una revisión pendiente, se aprueba esa.
create function public.complete_task(
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
  update public.tasks set status = 'done', started_at = coalesce(started_at, now()), completed_at = now() where id = p_task;
  perform public.log_task_event(p_task, 'review_approved', jsonb_build_object('review', v_id, 'direct', true));
  return v_id;
end $$;

-- ───────────────────── Tomar una tarea sin responsable (fila 31, AC-37) ─────────────────────

create function public.take_task(p_task uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not public.can_see_project(v_task.project_id)
     or not exists (select 1 from public.project_members pm where pm.project_id = v_task.project_id and pm.user_id = auth.uid()) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  if v_task.assignee_id is not null then
    raise exception 'La tarea ya tiene responsable' using errcode = '22023';
  end if;
  if v_task.status not in ('todo', 'doing') then
    raise exception 'La tarea ya está en revisión o hecha' using errcode = '22023';
  end if;
  update public.tasks set assignee_id = auth.uid() where id = p_task;
  delete from public.task_collaborators where task_id = p_task and user_id = auth.uid();
  perform public.log_task_event(p_task, 'assignee_changed', jsonb_build_object('from', null, 'to', auth.uid(), 'taken', true));
end $$;

-- ───────────────────── Borrar (filas 33 y 34, AC-39, AC-40) ─────────────────────

-- ponytail: los archivos de evidencia quedan en Storage al borrar (Supabase no deja borrarlos desde SQL);
-- si ocupan espacio, una Edge Function de limpieza en F6.
create function public.delete_task(p_task uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not public.can_manage_project(v_task.project_id) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  perform public.write_audit(v_task.team_id, 'task_deleted', null,
    jsonb_build_object('task', v_task.id, 'title', v_task.title, 'project', v_task.project_id));
  delete from public.tasks where id = p_task;
end $$;

create function public.delete_project(p_project uuid, p_confirm_name text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_project public.projects;
begin
  select * into v_project from public.projects p where p.id = p_project;
  if v_project.id is null or not public.has_team_role(v_project.team_id, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if trim(coalesce(p_confirm_name, '')) <> v_project.name then
    raise exception 'Escribe el nombre exacto del proyecto para borrarlo' using errcode = '22023';
  end if;
  perform public.write_audit(v_project.team_id, 'project_deleted', null,
    jsonb_build_object('project', v_project.id, 'name', v_project.name,
                       'tasks', (select count(*) from public.tasks t where t.project_id = p_project)));
  delete from public.projects where id = p_project;
end $$;

-- ───────────────────── Evidencia segura (AC-41) ─────────────────────

update storage.buckets
set allowed_mime_types = array[
  'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  'application/pdf', 'text/plain', 'text/csv', 'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip'
]
where id = 'task-evidence';

-- El tamaño sale de Storage, no de lo que diga el cliente.
drop function public.add_task_attachment(uuid, text, text, integer, uuid);
create function public.add_task_attachment(p_task uuid, p_path text, p_name text, p_review uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_size bigint;
begin
  if public.evidence_task(p_path) is distinct from p_task or not public.can_upload_evidence(p_path) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_review is not null and not exists (select 1 from public.task_reviews r where r.id = p_review and r.task_id = p_task) then
    raise exception 'La revisión no es de esta tarea' using errcode = '22023';
  end if;
  select (o.metadata ->> 'size')::bigint into v_size
  from storage.objects o where o.bucket_id = 'task-evidence' and o.name = p_path;
  if v_size is null then
    raise exception 'El archivo no se subió: inténtalo de nuevo' using errcode = '22023';
  end if;
  insert into public.task_attachments (task_id, review_id, path, name, size, uploaded_by)
  values (p_task, p_review, p_path, trim(p_name), v_size, auth.uid())
  returning id into v_id;
  perform public.log_task_event(p_task, 'evidence_added', jsonb_build_object('name', trim(p_name)));
  return v_id;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.assert_delivery(uuid, jsonb, text[], uuid[]),
  public.complete_task(uuid, jsonb, text[], uuid[]),
  public.take_task(uuid),
  public.delete_task(uuid),
  public.delete_project(uuid, text),
  public.add_task_attachment(uuid, text, text, uuid)
from public, anon;

grant execute on function
  public.complete_task(uuid, jsonb, text[], uuid[]),
  public.take_task(uuid),
  public.delete_task(uuid),
  public.delete_project(uuid, text),
  public.add_task_attachment(uuid, text, text, uuid)
to authenticated;
