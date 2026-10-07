-- Avisos al entrar a un sitio no permitido (ADR-0010)
-- Reglas: docs/ROLES.md fila 23 · Pruebas: supabase/tests/dominios_y_politicas.test.ts
--
-- Owner y admin deciden si Pulso avisa (notificación con sonido en el equipo de cada persona) y cada
-- cuánto repite el aviso mientras la persona sigue en el sitio. El aviso es local: no se registra nada nuevo.

create function public.set_alert_policy(p_team uuid, p_enabled boolean, p_repeat_minutes integer) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_team_role(p_team, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_enabled is null or p_repeat_minutes is null or p_repeat_minutes not in (0, 2, 5, 10, 15, 30) then
    raise exception 'La repetición debe ser 0 (solo al entrar), 2, 5, 10, 15 o 30 minutos' using errcode = '22023';
  end if;
  update public.teams
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{policies}',
                           coalesce(settings -> 'policies', '{}'::jsonb)
                           || jsonb_build_object('alert_not_allowed', p_enabled, 'alert_repeat_minutes', p_repeat_minutes))
  where id = p_team;
  perform public.write_audit(p_team, 'policy_changed', null,
    jsonb_build_object('alert_not_allowed', p_enabled, 'alert_repeat_minutes', p_repeat_minutes));
end $$;

revoke execute on function public.set_alert_policy(uuid, boolean, integer) from public, anon;
grant execute on function public.set_alert_policy(uuid, boolean, integer) to authenticated;
