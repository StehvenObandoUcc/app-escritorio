-- Identidad y equipos
-- Tablas: profiles, teams, team_members
-- Reglas: docs/ROLES.md (matriz de permisos). Cada regla tiene prueba en supabase/tests.
--
-- Convenciones de TODAS las migraciones de Pulso:
--   1. RLS activado en cada tabla, sin excepciones.
--   2. GRANT explícitos (no se confía en los permisos por defecto del proyecto).
--   3. Las escrituras sensibles pasan por funciones SECURITY DEFINER con
--      search_path vacío, que validan el rol de quien llama.
--   4. El rol anon no tiene acceso a nada.

-- ───────────────────────── Tablas ─────────────────────────

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 80),
  timezone text not null default 'America/Bogota',
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 60),
  settings jsonb not null default '{}'::jsonb,
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.team_members (
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  consent_version text,
  consent_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);
create index team_members_user_idx on public.team_members (user_id);

-- ───────────────────── Funciones de apoyo ─────────────────────

-- Rol de quien llama dentro de un equipo (null si no pertenece).
create function public.team_role(p_team uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select m.role from public.team_members m
  where m.team_id = p_team and m.user_id = auth.uid()
$$;

create function public.has_team_role(p_team uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(public.team_role(p_team) = any (p_roles), false)
$$;

-- ¿Quien llama comparte equipo con p_user? (owner/admin/member ven a sus compañeros)
create function public.shares_team_with(p_user uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.team_members mine
    join public.team_members theirs on theirs.team_id = mine.team_id
    where mine.user_id = auth.uid()
      and mine.role in ('owner', 'admin', 'member')
      and theirs.user_id = p_user
  )
$$;

-- ───────────────────────── RLS ─────────────────────────

alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.shares_team_with(id));
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy teams_select_member on public.teams for select to authenticated
  using (public.has_team_role(id, array['owner', 'admin', 'member', 'viewer']));
create policy teams_update_owner on public.teams for update to authenticated
  using (public.has_team_role(id, array['owner']))
  with check (public.has_team_role(id, array['owner']));
create policy teams_delete_owner on public.teams for delete to authenticated
  using (public.has_team_role(id, array['owner']));

-- El observador (viewer) solo ve su propia fila: no ve la lista de miembros.
create policy team_members_select on public.team_members for select to authenticated
  using (user_id = auth.uid() or public.has_team_role(team_id, array['owner', 'admin', 'member']));
-- Sin políticas de INSERT/UPDATE/DELETE: los miembros solo cambian por las funciones de abajo.

revoke all on public.profiles, public.teams, public.team_members from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, update (name), delete on public.teams to authenticated;
grant select on public.team_members to authenticated;

-- ───────────────── Protección del último owner ─────────────────

create function public.guard_last_owner() returns trigger
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
    raise exception 'El equipo debe conservar al menos un owner' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end $$;

create trigger team_members_guard_last_owner
  before update or delete on public.team_members
  for each row execute function public.guard_last_owner();

-- ───────────────── Operaciones (única vía de escritura) ─────────────────

create function public.create_team(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team uuid;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  insert into public.teams (name, created_by) values (trim(p_name), v_user) returning id into v_team;
  insert into public.team_members (team_id, user_id, role) values (v_team, v_user, 'owner');
  return v_team;
end $$;

create function public.set_member_role(p_team uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller text := public.team_role(p_team);
  v_target text;
begin
  select m.role into v_target from public.team_members m
  where m.team_id = p_team and m.user_id = p_user;

  if v_caller is null or v_target is null then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Rol desconocido: %', p_role using errcode = '22023';
  end if;

  if v_caller = 'owner' then
    null; -- el owner puede asignar cualquier rol
  elsif v_caller = 'admin'
        and v_target in ('member', 'viewer')
        and p_role in ('member', 'viewer') then
    null; -- el admin solo mueve entre member y viewer
  else
    raise exception 'No permitido' using errcode = '42501';
  end if;

  update public.team_members set role = p_role
  where team_id = p_team and user_id = p_user;
end $$;

create function public.remove_member(p_team uuid, p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_caller text := public.team_role(p_team);
  v_target text;
begin
  select m.role into v_target from public.team_members m
  where m.team_id = p_team and m.user_id = p_user;

  if v_caller is null or v_target is null or p_user = auth.uid() then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if not (v_caller = 'owner' or (v_caller = 'admin' and v_target in ('member', 'viewer'))) then
    raise exception 'No permitido' using errcode = '42501';
  end if;

  delete from public.team_members where team_id = p_team and user_id = p_user;
end $$;

create function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.team_members where team_id = p_team and user_id = auth.uid();
  if not found then
    raise exception 'No perteneces a este equipo' using errcode = '42501';
  end if;
end $$;

-- Nadie ejecuta funciones salvo usuarios con sesión.
revoke execute on function
  public.team_role(uuid),
  public.has_team_role(uuid, text[]),
  public.shares_team_with(uuid),
  public.guard_last_owner(),
  public.create_team(text),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.leave_team(uuid)
from public, anon;

grant execute on function
  public.team_role(uuid),
  public.has_team_role(uuid, text[]),
  public.shares_team_with(uuid),
  public.create_team(text),
  public.set_member_role(uuid, uuid, text),
  public.remove_member(uuid, uuid),
  public.leave_team(uuid)
to authenticated;
