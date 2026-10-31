-- Eliminar mi cuenta (CU-08, spec F7)
-- La Edge Function `delete-account` llama primero a delete_my_account_data() con el JWT de la persona y,
-- si no la bloquea, borra la cuenta de acceso con auth.admin.deleteUser. Al borrarse auth.users, las llaves
-- en cascada se llevan perfil, membresías, actividad, tiempo y cierres.
-- Lo que la persona creó en equipos con más gente (el equipo, proyectos, tareas y reglas) se queda sin
-- creador: hasta ahora esas cuatro llaves no admitían nulo y bloqueaban el borrado.

-- ───────────────────── Creador nulo al borrar la cuenta ─────────────────────

alter table public.teams alter column created_by drop not null,
  drop constraint teams_created_by_fkey,
  add constraint teams_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.classification_rules alter column created_by drop not null,
  drop constraint classification_rules_created_by_fkey,
  add constraint classification_rules_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.projects alter column created_by drop not null,
  drop constraint projects_created_by_fkey,
  add constraint projects_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;
alter table public.tasks alter column created_by drop not null,
  drop constraint tasks_created_by_fkey,
  add constraint tasks_created_by_fkey foreign key (created_by) references auth.users (id) on delete set null;

-- ───────────────────── Preparar el borrado (D-1, D-2, D-4) ─────────────────────

-- No borra auth.users: eso lo hace la Edge Function con la clave de servicio.
-- Solo la ejecuta service_role (la Edge Function, con la persona del JWT ya comprobada): si una sesión pudiera
-- llamarla sin borrar la cuenta, dejaría salidas falsas en la auditoría y borraría sus equipos a medias.
create function public.delete_my_account_data(p_user uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid := p_user;
  v_blocked text;
  v_member record;
begin
  if v_user is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;

  -- D-1: única propietaria de un equipo con más personas.
  select t.name into v_blocked
  from public.team_members m join public.teams t on t.id = m.team_id
  where m.user_id = v_user and m.role = 'owner'
    and not exists (select 1 from public.team_members o where o.team_id = m.team_id and o.role = 'owner' and o.user_id <> v_user)
    and exists (select 1 from public.team_members o where o.team_id = m.team_id and o.user_id <> v_user)
  order by t.name
  limit 1;
  if v_blocked is not null then
    raise exception 'Antes de eliminar tu cuenta, pasa la propiedad de «%» a otra persona', v_blocked using errcode = 'P0001';
  end if;

  -- D-2: los equipos donde está sola se van con la cuenta.
  delete from public.teams t
  where exists (select 1 from public.team_members m where m.team_id = t.id and m.user_id = v_user)
    and not exists (select 1 from public.team_members o where o.team_id = t.id and o.user_id <> v_user);

  -- D-4: constancia en los demás equipos, como leave_team.
  for v_member in select m.team_id, m.role from public.team_members m where m.user_id = v_user loop
    -- Directo y no con write_audit: con la clave de servicio auth.uid() es nulo y quien se va es p_user.
    insert into public.audit_log (team_id, actor_id, action, target_user, details)
    values (v_member.team_id, v_user, 'member_left', v_user, jsonb_build_object('role', v_member.role));
  end loop;

  -- D-4: la evidencia se queda en el equipo; sin dueño, Supabase deja borrar la cuenta.
  -- Si el rol dueño no puede tocar storage.objects, se sigue: la Edge Function informará si Supabase no deja borrar.
  begin
    update storage.objects set owner = null, owner_id = null
    where owner = v_user or owner_id = v_user::text;
  exception when insufficient_privilege then
    null;
  end;
end $$;

revoke execute on function public.delete_my_account_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_my_account_data(uuid) to service_role;
