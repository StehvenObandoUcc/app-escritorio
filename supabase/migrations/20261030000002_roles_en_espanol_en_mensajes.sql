-- Roles en español en los mensajes del servidor (F6-8)
-- Los mensajes de error nombraban los roles en inglés (owner, admin, member, viewer, lead), que es como se
-- guardan, mientras la interfaz dice propietario, administrador, miembro, observador y líder.
-- Se redefinen las cuatro funciones con el cuerpo actual de su migración de origen; único cambio: el texto
-- del mensaje. Firma, volatilidad, security definer y search_path son los mismos, así que sus permisos
-- (grant/revoke) se conservan.

-- Cuerpo de 20261001000001_identidad_y_equipos.sql.
create or replace function public.guard_last_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'owner'
     and (tg_op = 'DELETE' or new.role <> 'owner')
     -- Si el equipo entero se está borrando, no hay nada que proteger.
     and exists (select 1 from public.teams t where t.id = old.team_id)
     and not exists (
       select 1 from public.team_members m
       where m.team_id = old.team_id and m.role = 'owner' and m.user_id <> old.user_id
     )
  then
    raise exception 'El equipo debe conservar al menos un propietario' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

-- Cuerpo de 20261008000001_proyectos_y_tareas.sql.
create or replace function public.set_project_member(p_project uuid, p_user uuid, p_role text) returns void
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
    raise exception 'Solo se añaden propietarios, administradores o miembros del equipo; un observador no pertenece a proyectos'
      using errcode = '22023';
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, p_user, p_role)
  on conflict (project_id, user_id) do update set role = excluded.role;
end $$;

-- Cuerpo de 20261008000002_trabajo_v2.sql.
create or replace function public.ensure_project_member(p_project uuid, p_user uuid) returns void
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
    raise exception 'Solo se añaden propietarios, administradores o miembros del equipo; un observador no pertenece a proyectos'
      using errcode = '22023';
  end if;
  insert into public.project_members (project_id, user_id, role) values (p_project, p_user, 'contributor');
end $$;

-- Cuerpo de 20261011000001_ia_y_reportes.sql.
create or replace function public.report_assert_can_generate(p_team uuid, p_scope text, p_subject uuid) returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_role text := public.team_role(p_team);
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_scope = 'personal' then
    if p_subject <> auth.uid() then
      raise exception 'No permitido: el reporte personal es solo sobre ti' using errcode = '42501';
    end if;
  elsif p_scope = 'project' then
    if not exists (select 1 from public.projects p where p.id = p_subject and p.team_id = p_team)
       or not public.can_manage_project(p_subject) then
      raise exception 'No permitido: el reporte de proyecto lo generan propietarios, administradores o el líder del proyecto' using errcode = '42501';
    end if;
  elsif p_scope = 'team' then
    if p_subject <> p_team or v_role not in ('owner', 'admin') then
      raise exception 'No permitido: el reporte de equipo lo generan propietarios o administradores' using errcode = '42501';
    end if;
  else
    raise exception 'Alcance desconocido' using errcode = '22023';
  end if;
  if p_scope in ('project', 'team') and public.report_members(p_team, p_scope, p_subject) < 2 then
    raise exception 'Hacen falta al menos 2 miembros para un reporte de grupo' using errcode = '22023';
  end if;
  return coalesce((select pr.timezone from public.profiles pr where pr.id = auth.uid()), 'America/Bogota');
end $$;

