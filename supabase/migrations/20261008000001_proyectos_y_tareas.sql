-- Proyectos y tareas (F3)
-- Tablas: projects, project_members, tasks; llave foránea de time_entries.task_id
-- Reglas: docs/ROLES.md filas 13 («P»), 16 a 19. Spec: docs/specs/F3-proyectos-y-tareas.md (D-1 a D-13)
-- Pruebas: supabase/tests/proyectos_y_tareas.test.ts
--
-- Decisiones de esta migración:
--   · Todas las escrituras van por funciones SECURITY DEFINER; las tablas solo tienen RLS de lectura.
--   · owner y admin ven y gestionan todos los proyectos del equipo; un member, solo aquellos de los que es miembro.
--     El viewer no pertenece a proyectos (D-1).
--   · Gana la última modificación: updated_at lo pone el servidor (SY-04, D-10).

-- ───────────────────────── Tablas ─────────────────────────

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  archived_at timestamptz,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);
create index projects_team_idx on public.projects (team_id);

create table public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('lead', 'contributor')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);
create index project_members_user_idx on public.project_members (user_id);

-- Etiquetas: hasta 10, cada una de 1 a 30 caracteres.
create function public.valid_labels(p_labels text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select cardinality(p_labels) <= 10
     and coalesce((select bool_and(char_length(l) between 1 and 30) from unnest(p_labels) l), true)
$$;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- copia del equipo del proyecto: la pone create_task y permite validar time_entries sin unir tablas
  team_id uuid not null references public.teams (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  description text not null default '' check (char_length(description) <= 5000),
  assignee_id uuid references auth.users (id) on delete set null,
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due_date date,
  labels text[] not null default '{}' check (public.valid_labels(labels)),
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes between 1 and 100000),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tasks_project_idx on public.tasks (project_id);
create index tasks_assignee_idx on public.tasks (assignee_id);

-- SY-04: gana la última modificación y su hora es la del servidor.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- ─────────────────── Tiempo por tarea (PT-07, D-6) ───────────────────

alter table public.time_entries
  add constraint time_entries_task_fk foreign key (task_id) references public.tasks (id) on delete set null;
create index time_entries_task_idx on public.time_entries (task_id) where task_id is not null;

-- La tarea de una entrada debe ser del mismo equipo. SECURITY DEFINER: una entrada hecha sin conexión
-- sigue subiendo aunque la persona ya no vea la tarea (por ejemplo, si salió del proyecto).
create function public.validate_entry_task() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.task_id is not null
     and not exists (select 1 from public.tasks t where t.id = new.task_id and t.team_id = new.team_id) then
    raise exception 'La tarea no es de este equipo' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger time_entries_task_team before insert or update of task_id, team_id on public.time_entries
  for each row execute function public.validate_entry_task();

-- ───────────────────── Funciones de apoyo ─────────────────────

-- Rol de quien llama en un proyecto: 'manager' (owner o admin del equipo), 'lead', 'contributor' o null.
-- Un viewer nunca tiene rol de proyecto, aunque quede una fila vieja en project_members.
create function public.project_role(p_project uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when public.has_team_role(p.team_id, array['owner', 'admin']) then 'manager'
    when public.has_team_role(p.team_id, array['member']) then
      (select pm.role from public.project_members pm where pm.project_id = p.id and pm.user_id = auth.uid())
  end
  from public.projects p
  where p.id = p_project
$$;

create function public.can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.project_role(p_project) is not null
$$;

-- Filas 17 y 18: owner, admin y el lead del proyecto.
create function public.can_manage_project(p_project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.project_role(p_project) in ('manager', 'lead'), false)
$$;

-- Lanza un error si el proyecto está archivado (D-7).
create function public.assert_project_open(p_project uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.projects p where p.id = p_project and p.archived_at is not null) then
    raise exception 'El proyecto está archivado: desarchívalo para hacer cambios' using errcode = '22023';
  end if;
end $$;

-- Responsable válido: nadie o un miembro del proyecto (D-5).
create function public.assert_assignee(p_project uuid, p_assignee uuid) returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_assignee is not null
     and not exists (select 1 from public.project_members pm where pm.project_id = p_project and pm.user_id = p_assignee) then
    raise exception 'El responsable debe ser miembro del proyecto' using errcode = '22023';
  end if;
end $$;

-- Etiquetas sin espacios sobrantes, sin repetir y sin vacías.
create function public.clean_labels(p_labels text[]) returns text[]
language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(distinct trim(l) order by trim(l)), '{}')
  from unnest(coalesce(p_labels, '{}')) l
  where trim(l) <> ''
$$;

-- ───────────────────────── RLS (solo lectura) ─────────────────────────

alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.tasks enable row level security;

create policy projects_select on public.projects for select to authenticated
  using (public.can_see_project(id));
create policy project_members_select on public.project_members for select to authenticated
  using (public.can_see_project(project_id));
create policy tasks_select on public.tasks for select to authenticated
  using (public.can_see_project(project_id));

revoke all on public.projects, public.project_members, public.tasks from anon, authenticated;
grant select on public.projects, public.project_members, public.tasks to authenticated;

-- ───────────────────────── Proyectos (filas 16 y 17) ─────────────────────────

create function public.create_project(p_team uuid, p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.has_team_role(p_team, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  insert into public.projects (team_id, name, created_by) values (p_team, trim(p_name), auth.uid())
  returning id into v_id;
  insert into public.project_members (project_id, user_id, role) values (v_id, auth.uid(), 'lead');
  return v_id;
end $$;

create function public.set_project_archived(p_project uuid, p_archived boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if public.project_role(p_project) is distinct from 'manager' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  update public.projects
  set archived_at = case when p_archived then coalesce(archived_at, now()) end
  where id = p_project;
end $$;

-- Añade a un miembro del equipo al proyecto o le cambia el rol. Un viewer no puede entrar (D-5).
create function public.set_project_member(p_project uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_role not in ('lead', 'contributor') then
    raise exception 'Rol de proyecto inválido' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.projects p
    join public.team_members m on m.team_id = p.team_id
    where p.id = p_project and m.user_id = p_user and m.role in ('owner', 'admin', 'member')
  ) then
    raise exception 'Solo se añaden owners, admins o members del equipo; un viewer no pertenece a proyectos'
      using errcode = '22023';
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, p_user, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

-- Quita a alguien del proyecto; sus tareas en él quedan sin responsable.
create function public.remove_project_member(p_project uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.can_manage_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  delete from public.project_members where project_id = p_project and user_id = p_user;
  update public.tasks set assignee_id = null where project_id = p_project and assignee_id = p_user;
end $$;

-- ───────────────────────── Tareas (filas 18 y 19) ─────────────────────────

-- Los campos opcionales tienen valor por defecto: así la API los acepta omitidos (= vacío).
create function public.create_task(
  p_project uuid, p_title text, p_status text, p_description text default '', p_assignee uuid default null,
  p_due_date date default null, p_labels text[] default '{}', p_estimate_minutes integer default null
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.can_see_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  -- Un contributor solo crea tareas para sí o sin responsable (D-2).
  if not public.can_manage_project(p_project) and p_assignee is not null and p_assignee <> auth.uid() then
    raise exception 'No permitido: solo puedes crear tareas para ti' using errcode = '42501';
  end if;
  perform public.assert_project_open(p_project);
  perform public.assert_assignee(p_project, p_assignee);
  insert into public.tasks (project_id, team_id, title, description, assignee_id, status, due_date, labels,
                            estimate_minutes, created_by)
  select p.id, p.team_id, trim(p_title), coalesce(p_description, ''), p_assignee, coalesce(p_status, 'todo'),
         p_due_date, public.clean_labels(p_labels), p_estimate_minutes, auth.uid()
  from public.projects p where p.id = p_project
  returning id into v_id;
  return v_id;
end $$;

-- Edita todos los campos (fila 18: owner, admin y lead).
-- Se envían todos los campos: uno omitido queda vacío.
create function public.update_task(
  p_task uuid, p_title text, p_status text, p_description text default '', p_assignee uuid default null,
  p_due_date date default null, p_labels text[] default '{}', p_estimate_minutes integer default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_project uuid;
begin
  select t.project_id into v_project from public.tasks t where t.id = p_task;
  if v_project is null or not public.can_manage_project(v_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_project);
  perform public.assert_assignee(v_project, p_assignee);
  update public.tasks
  set title = trim(p_title), description = coalesce(p_description, ''), assignee_id = p_assignee,
      status = p_status, due_date = p_due_date, labels = public.clean_labels(p_labels),
      estimate_minutes = p_estimate_minutes
  where id = p_task;
end $$;

-- Cambia el estado: quien gestiona el proyecto, o el responsable de la tarea (fila 19).
create function public.set_task_status(p_task uuid, p_status text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not (
    public.can_manage_project(v_task.project_id)
    or (v_task.assignee_id = auth.uid() and public.can_see_project(v_task.project_id))
  ) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_project_open(v_task.project_id);
  update public.tasks set status = p_status where id = p_task;
end $$;

-- ───────────────────────── Lecturas con avance (PT-07, PT-08) ─────────────────────────

-- Segundos registrados por tarea (todas las personas, también exmiembros; el temporizador en marcha cuenta hasta ahora).
create function public.task_seconds(p_task uuid) returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(extract(epoch from (coalesce(e.ended_at, now()) - e.started_at))), 0)::bigint
  from public.time_entries e
  where e.task_id = p_task and e.deleted_at is null
$$;

create function public.my_projects(p_team uuid)
returns table (
  id uuid, name text, archived_at timestamptz, my_role text, tasks_total bigint, tasks_done bigint,
  logged_seconds bigint, estimate_minutes bigint, created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.name, p.archived_at, public.project_role(p.id),
         count(t.id), count(t.id) filter (where t.status = 'done'),
         coalesce(sum(public.task_seconds(t.id)), 0)::bigint,
         coalesce(sum(t.estimate_minutes), 0)::bigint,
         p.created_at
  from public.projects p
  left join public.tasks t on t.project_id = p.id
  where p.team_id = p_team and public.can_see_project(p.id)
  group by p.id
  order by p.archived_at nulls first, p.name
$$;

create function public.project_tasks(p_project uuid)
returns table (
  id uuid, title text, description text, assignee_id uuid, status text, due_date date, labels text[],
  estimate_minutes integer, logged_seconds bigint, created_by uuid, updated_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_see_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  return query
    select t.id, t.title, t.description, t.assignee_id, t.status, t.due_date, t.labels, t.estimate_minutes,
           public.task_seconds(t.id), t.created_by, t.updated_at
    from public.tasks t
    where t.project_id = p_project
    order by t.status = 'done', t.due_date nulls last, t.created_at;
end $$;

-- Miembros del proyecto con su nombre visible.
create function public.project_member_list(p_project uuid)
returns table (user_id uuid, role text, display_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.can_see_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  return query
    select pm.user_id, pm.role, pr.display_name
    from public.project_members pm
    left join public.profiles pr on pr.id = pm.user_id
    where pm.project_id = p_project
    order by pm.role, pr.display_name;
end $$;

-- Fila 13 «P»: tiempo por persona en las tareas del proyecto. Exmiembros del equipo con user_id null.
create function public.project_time_summary(p_project uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, seconds bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.can_manage_project(p_project) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Rango inválido: el fin debe ser posterior al inicio y no superar 366 días'
      using errcode = '22023';
  end if;
  return query
    select m.user_id,
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), p_to) - greatest(e.started_at, p_from))))::bigint
    from public.time_entries e
    join public.tasks t on t.id = e.task_id
    left join public.team_members m on m.team_id = e.team_id and m.user_id = e.user_id
    where t.project_id = p_project and e.deleted_at is null
      and e.started_at < p_to and coalesce(e.ended_at, now()) > p_from
    group by m.user_id;
end $$;

-- ─────────── Salida del equipo o paso a viewer (D-8) ───────────

create function public.leave_projects_on_team_exit() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' or new.role = 'viewer' then
    delete from public.project_members pm
    using public.projects p
    where p.id = pm.project_id and p.team_id = old.team_id and pm.user_id = old.user_id;
    update public.tasks set assignee_id = null where team_id = old.team_id and assignee_id = old.user_id;
  end if;
  return null;
end $$;

create trigger team_members_leave_projects after delete or update of role on public.team_members
  for each row execute function public.leave_projects_on_team_exit();

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.valid_labels(text[]),
  public.touch_updated_at(),
  public.validate_entry_task(),
  public.project_role(uuid),
  public.can_see_project(uuid),
  public.can_manage_project(uuid),
  public.assert_project_open(uuid),
  public.assert_assignee(uuid, uuid),
  public.clean_labels(text[]),
  public.create_project(uuid, text),
  public.set_project_archived(uuid, boolean),
  public.set_project_member(uuid, uuid, text),
  public.remove_project_member(uuid, uuid),
  public.create_task(uuid, text, text, text, uuid, date, text[], integer),
  public.update_task(uuid, text, text, text, uuid, date, text[], integer),
  public.set_task_status(uuid, text),
  public.task_seconds(uuid),
  public.my_projects(uuid),
  public.project_tasks(uuid),
  public.project_member_list(uuid),
  public.project_time_summary(uuid, timestamptz, timestamptz),
  public.leave_projects_on_team_exit()
from public, anon;

-- valid_labels y can_see_project las usan el CHECK y las políticas con el rol de quien consulta.
grant execute on function
  public.valid_labels(text[]),
  public.can_see_project(uuid),
  public.create_project(uuid, text),
  public.set_project_archived(uuid, boolean),
  public.set_project_member(uuid, uuid, text),
  public.remove_project_member(uuid, uuid),
  public.create_task(uuid, text, text, text, uuid, date, text[], integer),
  public.update_task(uuid, text, text, text, uuid, date, text[], integer),
  public.set_task_status(uuid, text),
  public.my_projects(uuid),
  public.project_tasks(uuid),
  public.project_member_list(uuid),
  public.project_time_summary(uuid, timestamptz, timestamptz)
to authenticated;
