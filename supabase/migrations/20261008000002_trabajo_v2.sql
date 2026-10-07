-- Modelo de trabajo v2 (ADR-0014): tipos, subtareas, apoyos, criterios, revisión con evidencia e historial
-- Reglas: docs/ROLES.md filas 16 a 19 y 27 a 30. Spec: docs/specs/F3-proyectos-y-tareas.md (v2, AC-19 a AC-33)
-- Pruebas: supabase/tests/trabajo_v2.test.ts
--
-- Decisiones de esta migración:
--   · 20261008000001 ya está aplicada: aquí se amplía, no se edita.
--   · A 'done' solo se llega aprobando una revisión (review_task). set_task_status ya no lo acepta.
--   · Todo cambio de una tarea deja una fila en task_events (para los reportes de F4).
--   · team_work(team) trae en un solo JSON todo el trabajo visible; la interfaz lo guarda como copia sin conexión.

-- ───────────────────────── Tareas: columnas nuevas ─────────────────────────

alter table public.tasks
  add column type text not null default 'task' check (type in ('task', 'bug', 'improvement', 'research', 'meeting')),
  add column parent_id uuid references public.tasks (id) on delete cascade,
  add column assignee_can_manage boolean not null default false,
  add column started_at timestamptz,
  add column completed_at timestamptz;
create index tasks_parent_idx on public.tasks (parent_id) where parent_id is not null;

alter table public.tasks drop constraint tasks_status_check;
alter table public.tasks add constraint tasks_status_check check (status in ('todo', 'doing', 'review', 'done'));

-- Formulario de entrega del proyecto (settings.review_template).
alter table public.projects add column settings jsonb not null default '{}'::jsonb;

-- Un solo nivel de subtareas; una tarea no cambia de proyecto ni de madre.
create function public.validate_task_tree() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and (new.project_id <> old.project_id or new.parent_id is distinct from old.parent_id) then
    raise exception 'Una tarea no cambia de proyecto ni de tarea madre' using errcode = '22023';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.tasks p where p.id = new.parent_id and p.project_id = new.project_id and p.parent_id is null
  ) then
    raise exception 'Una subtarea va dentro de una tarea del mismo proyecto, y una subtarea no tiene subtareas'
      using errcode = '22023';
  end if;
  return new;
end $$;

create trigger tasks_tree before insert or update on public.tasks
  for each row execute function public.validate_task_tree();

-- ───────────────────────── Tablas nuevas ─────────────────────────

create table public.task_collaborators (
  task_id uuid not null references public.tasks (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index task_collaborators_user_idx on public.task_collaborators (user_id);

create table public.task_criteria (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  text text not null check (char_length(text) between 1 and 300),
  position integer not null,
  met boolean not null default false
);
create index task_criteria_task_idx on public.task_criteria (task_id);

create table public.task_reviews (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  submitted_by uuid references auth.users (id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  links text[] not null default '{}',
  reviewer_id uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'changes_requested')),
  decided_by uuid references auth.users (id) on delete set null,
  comment text check (comment is null or char_length(comment) <= 2000),
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index task_reviews_task_idx on public.task_reviews (task_id, created_at desc);
create unique index task_reviews_one_pending on public.task_reviews (task_id) where status = 'pending';

create table public.task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  review_id uuid references public.task_reviews (id) on delete cascade,
  path text not null unique,
  name text not null check (char_length(name) between 1 and 200),
  size integer not null check (size between 1 and 10485760),
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index task_attachments_task_idx on public.task_attachments (task_id);

-- Historial: solo se añaden filas (nadie tiene UPDATE ni DELETE).
create table public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor uuid references auth.users (id) on delete set null,
  kind text not null check (kind in (
    'created', 'edited', 'status_changed', 'assignee_changed', 'collaborators_changed', 'estimate_changed',
    'criteria_changed', 'review_submitted', 'review_approved', 'changes_requested', 'evidence_added'
  )),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index task_events_task_idx on public.task_events (task_id, created_at);
create index task_events_project_idx on public.task_events (project_id, created_at);

-- ───────────────────── Funciones de apoyo ─────────────────────

create function public.task_project(p_task uuid) returns uuid
language sql stable security definer set search_path = ''
as $$
  select t.project_id from public.tasks t where t.id = p_task
$$;

-- ¿Quien llama es el responsable o un apoyo de la tarea?
create function public.is_task_worker(p_task uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.tasks t where t.id = p_task and t.assignee_id = auth.uid())
      or exists (select 1 from public.task_collaborators c where c.task_id = p_task and c.user_id = auth.uid())
$$;

-- Fila 29: quien gestiona el proyecto, o el responsable si la tarea se lo permite.
create function public.can_manage_task_people(p_task uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.can_manage_project(t.project_id)
      or (t.assignee_id = auth.uid() and t.assignee_can_manage and public.can_see_project(t.project_id))
  from public.tasks t where t.id = p_task
$$;

-- Garantiza que p_user está en el proyecto. Si no está y quien llama lo gestiona, lo añade como
-- colaborador (ADR-0014). Un viewer nunca entra.
create function public.ensure_project_member(p_project uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_user is null or exists (select 1 from public.project_members pm where pm.project_id = p_project and pm.user_id = p_user) then
    return;
  end if;
  if not public.can_manage_project(p_project) then
    raise exception 'Esa persona no está en el proyecto: pide a quien lo gestiona que la añada' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.projects p
    join public.team_members m on m.team_id = p.team_id
    where p.id = p_project and m.user_id = p_user and m.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'Solo se añaden owners, admins o members del equipo; un viewer no pertenece a proyectos'
      using errcode = '22023';
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, p_user, 'contributor');
end $$;

create function public.log_task_event(p_task uuid, p_kind text, p_details jsonb) returns void
language sql security definer set search_path = ''
as $$
  insert into public.task_events (task_id, project_id, actor, kind, details)
  select t.id, t.project_id, auth.uid(), p_kind, coalesce(p_details, '{}'::jsonb)
  from public.tasks t where t.id = p_task
$$;

-- Formulario por defecto: «Qué se hizo» (obligatorio) y «Evidencia» (enlace, opcional).
create function public.review_template(p_project uuid) returns jsonb
language sql stable security definer set search_path = ''
as $$
  select coalesce(p.settings -> 'review_template', '[
    {"key": "summary", "label": "Qué se hizo", "kind": "text", "required": true},
    {"key": "evidence", "label": "Evidencia", "kind": "url", "required": false}
  ]'::jsonb)
  from public.projects p where p.id = p_project
$$;

-- Segundos registrados en una tarea y sus subtareas.
create function public.task_tree_seconds(p_task uuid) returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(public.task_seconds(t.id)), 0)::bigint
  from public.tasks t where t.id = p_task or t.parent_id = p_task
$$;

-- ───────────────────────── RLS de las tablas nuevas (solo lectura) ─────────────────────────

alter table public.task_collaborators enable row level security;
alter table public.task_criteria enable row level security;
alter table public.task_reviews enable row level security;
alter table public.task_attachments enable row level security;
alter table public.task_events enable row level security;

create policy task_collaborators_select on public.task_collaborators for select to authenticated
  using (public.can_see_project(public.task_project(task_id)));
create policy task_criteria_select on public.task_criteria for select to authenticated
  using (public.can_see_project(public.task_project(task_id)));
create policy task_reviews_select on public.task_reviews for select to authenticated
  using (public.can_see_project(public.task_project(task_id)));
create policy task_attachments_select on public.task_attachments for select to authenticated
  using (public.can_see_project(public.task_project(task_id)));
create policy task_events_select on public.task_events for select to authenticated
  using (public.can_see_project(project_id));

revoke all on public.task_collaborators, public.task_criteria, public.task_reviews, public.task_attachments,
  public.task_events from anon, authenticated;
grant select on public.task_collaborators, public.task_criteria, public.task_reviews, public.task_attachments,
  public.task_events to authenticated;

-- ───────────────────────── Evidencia en Storage (AC-28) ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-evidence', 'task-evidence', false, 10485760)
on conflict (id) do nothing;

-- Ruta: equipo/proyecto/tarea/archivo. Devuelve la tarea si la ruta es coherente; si no, null.
create function public.evidence_task(p_path text) returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_path, '/');
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if cardinality(v_parts) <> 4 or v_parts[1] !~ v_uuid or v_parts[2] !~ v_uuid or v_parts[3] !~ v_uuid
     or char_length(v_parts[4]) not between 1 and 240 then
    return null;
  end if;
  return (
    select t.id from public.tasks t join public.projects p on p.id = t.project_id
    where t.id = v_parts[3]::uuid and p.id = v_parts[2]::uuid and p.team_id = v_parts[1]::uuid
  );
end $$;

create function public.can_read_evidence(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.can_see_project(public.task_project(public.evidence_task(p_path))), false)
$$;

-- Suben evidencia el responsable, un apoyo o quien gestiona el proyecto, con el proyecto abierto.
create function public.can_upload_evidence(p_path text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select (public.is_task_worker(t.id) or public.can_manage_project(t.project_id))
            and public.can_see_project(t.project_id)
            and p.archived_at is null
     from public.tasks t join public.projects p on p.id = t.project_id
     where t.id = public.evidence_task(p_path)),
    false)
$$;

create policy task_evidence_read on storage.objects for select to authenticated
  using (bucket_id = 'task-evidence' and public.can_read_evidence(name));
create policy task_evidence_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'task-evidence' and public.can_upload_evidence(name));

-- ───────────────────────── Tareas: escritura v2 ─────────────────────────

drop function public.create_task(uuid, text, text, text, uuid, date, text[], integer);
drop function public.update_task(uuid, text, text, text, uuid, date, text[], integer);

-- Filas 18 y 19 (ADR-0014). Una tarea nace en 'todo' o 'doing'.
create function public.create_task(
  p_project uuid, p_title text, p_status text, p_description text default '', p_assignee uuid default null,
  p_due_date date default null, p_labels text[] default '{}', p_estimate_minutes integer default null,
  p_type text default 'task', p_parent uuid default null, p_criteria text[] default '{}',
  p_collaborators uuid[] default '{}', p_assignee_can_manage boolean default false
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
  v_manager boolean := public.can_manage_project(p_project);
  v_user uuid;
begin
  if not public.can_see_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if not v_manager and ((p_assignee is not null and p_assignee <> auth.uid()) or cardinality(coalesce(p_collaborators, '{}')) > 0) then
    raise exception 'No permitido: solo puedes crear tareas para ti' using errcode = '42501';
  end if;
  if coalesce(p_status, 'todo') not in ('todo', 'doing') then
    raise exception 'Una tarea nueva empieza por hacer o en curso' using errcode = '22023';
  end if;
  perform public.assert_project_open(p_project);
  perform public.ensure_project_member(p_project, p_assignee);
  foreach v_user in array coalesce(p_collaborators, '{}') loop
    perform public.ensure_project_member(p_project, v_user);
  end loop;

  insert into public.tasks (project_id, team_id, title, description, assignee_id, status, due_date, labels,
                            estimate_minutes, created_by, type, parent_id, assignee_can_manage, started_at)
  select p.id, p.team_id, trim(p_title), coalesce(p_description, ''), p_assignee, coalesce(p_status, 'todo'),
         p_due_date, public.clean_labels(p_labels), p_estimate_minutes, auth.uid(), coalesce(p_type, 'task'),
         p_parent, coalesce(p_assignee_can_manage, false), case when p_status = 'doing' then now() end
  from public.projects p where p.id = p_project
  returning id into v_id;

  insert into public.task_collaborators (task_id, user_id)
  select v_id, u from unnest(coalesce(p_collaborators, '{}')) u where u is distinct from p_assignee
  on conflict do nothing;
  insert into public.task_criteria (task_id, text, position)
  select v_id, trim(c), ord from unnest(coalesce(p_criteria, '{}')) with ordinality as x(c, ord) where trim(c) <> '';

  perform public.log_task_event(v_id, 'created', jsonb_build_object('status', coalesce(p_status, 'todo'), 'assignee', p_assignee));
  return v_id;
end $$;

-- Fila 18: quien gestiona edita todo. Desde 'review' o 'done' solo se reabre a 'todo' o 'doing'.
create function public.update_task(
  p_task uuid, p_title text, p_status text, p_description text default '', p_assignee uuid default null,
  p_due_date date default null, p_labels text[] default '{}', p_estimate_minutes integer default null,
  p_type text default 'task', p_assignee_can_manage boolean default false
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_old public.tasks;
begin
  select * into v_old from public.tasks t where t.id = p_task;
  if v_old.id is null or not public.can_manage_project(v_old.project_id) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_old.project_id);
  if p_status <> v_old.status and p_status not in ('todo', 'doing') then
    raise exception 'A «En revisión» se llega enviando la tarea y a «Hecha» aprobándola' using errcode = '22023';
  end if;
  perform public.ensure_project_member(v_old.project_id, p_assignee);
  if v_old.status = 'review' and p_status <> 'review' then
    update public.task_reviews set status = 'changes_requested', decided_by = auth.uid(), decided_at = now(),
      comment = 'Reabierta por quien gestiona el proyecto'
    where task_id = p_task and status = 'pending';
  end if;

  update public.tasks
  set title = trim(p_title), description = coalesce(p_description, ''), assignee_id = p_assignee,
      status = p_status, due_date = p_due_date, labels = public.clean_labels(p_labels),
      estimate_minutes = p_estimate_minutes, type = coalesce(p_type, 'task'),
      assignee_can_manage = coalesce(p_assignee_can_manage, false),
      started_at = case when p_status = 'doing' then coalesce(started_at, now()) else started_at end,
      completed_at = case when p_status = 'done' then completed_at end
  where id = p_task;

  if p_status <> v_old.status then
    perform public.log_task_event(p_task, 'status_changed', jsonb_build_object('from', v_old.status, 'to', p_status));
  end if;
  if p_assignee is distinct from v_old.assignee_id then
    perform public.log_task_event(p_task, 'assignee_changed', jsonb_build_object('from', v_old.assignee_id, 'to', p_assignee));
  end if;
  if p_estimate_minutes is distinct from v_old.estimate_minutes then
    perform public.log_task_event(p_task, 'estimate_changed', jsonb_build_object('from', v_old.estimate_minutes, 'to', p_estimate_minutes));
  end if;
  if trim(p_title) <> v_old.title or coalesce(p_description, '') <> v_old.description or p_due_date is distinct from v_old.due_date
     or coalesce(p_type, 'task') <> v_old.type then
    perform public.log_task_event(p_task, 'edited', '{}'::jsonb);
  end if;
end $$;

-- Fila 19 v2: quien gestiona, el responsable o un apoyo mueven entre 'todo' y 'doing'.
-- Una tarea en revisión espera la decisión; una hecha solo la reabre quien gestiona.
create or replace function public.set_task_status(p_task uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
  v_manager boolean;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  v_manager := public.can_manage_project(v_task.project_id);
  if v_task.id is null or not (v_manager or (public.is_task_worker(p_task) and public.can_see_project(v_task.project_id))) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  if p_status not in ('todo', 'doing') then
    raise exception 'A «En revisión» se llega enviando la tarea y a «Hecha» aprobándola' using errcode = '22023';
  end if;
  if v_task.status = 'review' then
    raise exception 'La tarea está en revisión: espera la decisión' using errcode = '22023';
  end if;
  if v_task.status = 'done' and not v_manager then
    raise exception 'Solo quien gestiona el proyecto reabre una tarea hecha' using errcode = '42501';
  end if;
  if p_status = v_task.status then
    return;
  end if;
  update public.tasks
  set status = p_status,
      started_at = case when p_status = 'doing' then coalesce(started_at, now()) else started_at end,
      completed_at = null
  where id = p_task;
  perform public.log_task_event(p_task, 'status_changed', jsonb_build_object('from', v_task.status, 'to', p_status));
end $$;

-- Fila 29: apoyos de la tarea (reemplaza la lista).
create function public.set_task_collaborators(p_task uuid, p_users uuid[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid := public.task_project(p_task);
  v_user uuid;
begin
  if v_project is null or not coalesce(public.can_manage_task_people(p_task), false) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_project);
  foreach v_user in array coalesce(p_users, '{}') loop
    perform public.ensure_project_member(v_project, v_user);
  end loop;
  delete from public.task_collaborators where task_id = p_task and user_id <> all (coalesce(p_users, '{}'));
  insert into public.task_collaborators (task_id, user_id)
  select p_task, u from unnest(coalesce(p_users, '{}')) u
  where u is distinct from (select t.assignee_id from public.tasks t where t.id = p_task)
  on conflict do nothing;
  perform public.log_task_event(p_task, 'collaborators_changed', jsonb_build_object('users', to_jsonb(coalesce(p_users, '{}'))));
end $$;

-- Criterios de aceptación (los define quien gestiona; reemplaza la lista y los deja sin cumplir).
create function public.set_task_criteria(p_task uuid, p_texts text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid := public.task_project(p_task);
begin
  if v_project is null or not public.can_manage_project(v_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_project);
  if cardinality(coalesce(p_texts, '{}')) > 20 then
    raise exception 'Una tarea tiene como máximo 20 criterios' using errcode = '22023';
  end if;
  delete from public.task_criteria where task_id = p_task;
  insert into public.task_criteria (task_id, text, position)
  select p_task, trim(c), ord from unnest(coalesce(p_texts, '{}')) with ordinality as x(c, ord) where trim(c) <> '';
  perform public.log_task_event(p_task, 'criteria_changed', jsonb_build_object('count', cardinality(coalesce(p_texts, '{}'))));
end $$;

-- Fila 30: formulario de entrega. Hasta 15 campos {key, label, kind, required}.
create function public.set_review_template(p_project uuid, p_template jsonb) returns void
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
  update public.projects set settings = settings || jsonb_build_object('review_template', p_template) where id = p_project;
end $$;

-- ───────────────────────── Revisión (filas 27 y 28) ─────────────────────────

create function public.submit_for_review(
  p_task uuid, p_answers jsonb, p_links text[] default '{}', p_reviewer uuid default null,
  p_criteria_met uuid[] default '{}'
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
  v_field jsonb;
  v_value text;
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
  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) <> 'object' then
    raise exception 'Las respuestas del formulario no tienen el formato esperado' using errcode = '22023';
  end if;
  for v_field in select * from jsonb_array_elements(public.review_template(v_task.project_id)) loop
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

-- Deciden el revisor pedido, el líder o owner/admin. Quien envió no se aprueba a sí mismo
-- salvo que gestione el proyecto (ADR-0014).
create function public.review_task(p_review uuid, p_approve boolean, p_comment text default null) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_review public.task_reviews;
  v_project uuid;
  v_manager boolean;
begin
  select * into v_review from public.task_reviews r where r.id = p_review;
  v_project := public.task_project(v_review.task_id);
  v_manager := coalesce(public.can_manage_project(v_project), false);
  if v_review.id is null or not public.can_see_project(v_project)
     or not (v_manager or v_review.reviewer_id = auth.uid())
     or (v_review.submitted_by = auth.uid() and not v_manager) then
    raise exception 'No permitido: decide el revisor pedido o quien gestiona el proyecto' using errcode = '42501';
  end if;
  if v_review.status <> 'pending' then
    raise exception 'Esta revisión ya tiene decisión' using errcode = '22023';
  end if;
  perform public.assert_project_open(v_project);
  if not p_approve and char_length(trim(coalesce(p_comment, ''))) not between 1 and 2000 then
    raise exception 'Explica qué cambios hacen falta (hasta 2000 caracteres)' using errcode = '22023';
  end if;

  update public.task_reviews
  set status = case when p_approve then 'approved' else 'changes_requested' end,
      decided_by = auth.uid(), decided_at = now(), comment = nullif(trim(coalesce(p_comment, '')), '')
  where id = p_review;
  update public.tasks
  set status = case when p_approve then 'done' else 'doing' end,
      completed_at = case when p_approve then now() end
  where id = v_review.task_id;
  perform public.log_task_event(v_review.task_id, case when p_approve then 'review_approved' else 'changes_requested' end,
    jsonb_build_object('review', p_review, 'comment', nullif(trim(coalesce(p_comment, '')), '')));
end $$;

-- Registra un archivo ya subido a Storage (la política de Storage ya validó la ruta y el permiso).
create function public.add_task_attachment(p_task uuid, p_path text, p_name text, p_size integer, p_review uuid default null)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.evidence_task(p_path) is distinct from p_task or not public.can_upload_evidence(p_path) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_review is not null and not exists (select 1 from public.task_reviews r where r.id = p_review and r.task_id = p_task) then
    raise exception 'La revisión no es de esta tarea' using errcode = '22023';
  end if;
  insert into public.task_attachments (task_id, review_id, path, name, size, uploaded_by)
  values (p_task, p_review, p_path, trim(p_name), p_size, auth.uid())
  returning id into v_id;
  perform public.log_task_event(p_task, 'evidence_added', jsonb_build_object('name', trim(p_name)));
  return v_id;
end $$;

-- ───────────────────────── Lecturas ─────────────────────────

-- Todo el trabajo visible del equipo en un JSON (AC-29). Las cifras salen de aquí (R5).
-- Estimación de una tarea madre: la suya; si no tiene, la suma de sus subtareas. El proyecto suma las tareas madre.
create function public.team_work(p_team uuid) returns jsonb
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
            'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'size', a.size))
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

-- Historial y revisiones de una tarea (AC-27).
create function public.task_history(p_task uuid) returns jsonb
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
        'attachments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'path', a.path, 'name', a.name, 'size', a.size))
                                 from public.task_attachments a where a.review_id = r.id), '[]'::jsonb)
      ) order by r.created_at desc)
      from public.task_reviews r where r.task_id = p_task), '[]'::jsonb)
  );
end $$;

-- Las lecturas de la v1 quedan cubiertas por team_work.
drop function public.my_projects(uuid);
drop function public.project_tasks(uuid);
drop function public.project_member_list(uuid);

-- ─────────── Salida del equipo o paso a viewer: también deja los apoyos y las revisiones pedidas ───────────

create or replace function public.leave_projects_on_team_exit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.role = 'viewer' then
    delete from public.project_members pm
    using public.projects p
    where p.id = pm.project_id and p.team_id = old.team_id and pm.user_id = old.user_id;
    update public.tasks set assignee_id = null where team_id = old.team_id and assignee_id = old.user_id;
    delete from public.task_collaborators c
    using public.tasks t
    where t.id = c.task_id and t.team_id = old.team_id and c.user_id = old.user_id;
    update public.task_reviews r set reviewer_id = null
    from public.tasks t
    where t.id = r.task_id and t.team_id = old.team_id and r.reviewer_id = old.user_id and r.status = 'pending';
  end if;
  return null;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.validate_task_tree(),
  public.task_project(uuid),
  public.is_task_worker(uuid),
  public.can_manage_task_people(uuid),
  public.ensure_project_member(uuid, uuid),
  public.log_task_event(uuid, text, jsonb),
  public.review_template(uuid),
  public.task_tree_seconds(uuid),
  public.evidence_task(text),
  public.can_read_evidence(text),
  public.can_upload_evidence(text),
  public.create_task(uuid, text, text, text, uuid, date, text[], integer, text, uuid, text[], uuid[], boolean),
  public.update_task(uuid, text, text, text, uuid, date, text[], integer, text, boolean),
  public.set_task_collaborators(uuid, uuid[]),
  public.set_task_criteria(uuid, text[]),
  public.set_review_template(uuid, jsonb),
  public.submit_for_review(uuid, jsonb, text[], uuid, uuid[]),
  public.review_task(uuid, boolean, text),
  public.add_task_attachment(uuid, text, text, integer, uuid),
  public.team_work(uuid),
  public.task_history(uuid)
from public, anon;

-- task_project y las de evidencia las usan las políticas con el rol de quien consulta.
grant execute on function
  public.task_project(uuid),
  public.can_read_evidence(text),
  public.can_upload_evidence(text),
  public.create_task(uuid, text, text, text, uuid, date, text[], integer, text, uuid, text[], uuid[], boolean),
  public.update_task(uuid, text, text, text, uuid, date, text[], integer, text, boolean),
  public.set_task_collaborators(uuid, uuid[]),
  public.set_task_criteria(uuid, text[]),
  public.set_review_template(uuid, jsonb),
  public.submit_for_review(uuid, jsonb, text[], uuid, uuid[]),
  public.review_task(uuid, boolean, text),
  public.add_task_attachment(uuid, text, text, integer, uuid),
  public.team_work(uuid),
  public.task_history(uuid)
to authenticated;
