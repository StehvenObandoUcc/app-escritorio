-- Tableros, privacidad y ajustes del equipo (F5)
-- Columna nueva: team_members.share_app_names. Restricción nueva de audit_log.action.
-- Reglas: docs/ROLES.md filas 13, 14, 15, 24, 38, 39 y 40. Spec: docs/specs/F5-tableros-privacidad.md (D-2 a D-9, D-18)
-- Pruebas: supabase/tests/tableros_y_privacidad.test.ts
--
-- Decisiones de esta migración:
--   · Una sola función de lectura, team_dashboard, arma el tablero según el rol de quien llama (D-2). Todas las cifras
--     salen de SQL (D-09 de la arquitectura); la interfaz solo da formato.
--   · Periodo [p_from, p_to): p_to es exclusivo y el máximo es de 92 días. Los días de per_day y la capacidad se
--     cuentan en la zona horaria del perfil de quien llama.
--   · Member y viewer reciben totales sin nombres; si el equipo tiene menos de 2 miembros (sin viewer) no reciben nada (D-3).
--   · PS-05 tiene tres capas (D-8): el cliente oculta antes de subir; el activador de abajo es el respaldo del servidor;
--     set_share_app_names oculta además lo ya subido. La categoría y ai_tool se conservan.
--   · Las funciones auxiliares nuevas quedan revocadas también para authenticated (como F4, supuesto 9).

-- ───────────────────────── Columna y restricciones ─────────────────────────

-- PS-05 (D-8): la persona decide si su equipo ve los nombres de sus apps. Solo cambia con set_share_app_names.
alter table public.team_members add column share_app_names boolean not null default true;

-- Se conservan todas las acciones de la versión vigente (20261011000001) y se añaden dos.
alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
  'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined',
  'policy_changed', 'project_deleted', 'task_deleted', 'report_generated',
  'settings_changed', 'share_apps_changed'
));

-- ───────────────────── Capa 2 de PS-05: respaldo del servidor ─────────────────────

-- Si la persona no comparte los nombres de sus apps en ese equipo, el bloque se guarda sin app ni dominio.
-- SECURITY DEFINER: lee team_members aunque quien escribe no pueda verlo por RLS.
create function public.hide_app_names() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (
    select 1 from public.team_members m
    where m.team_id = new.team_id and m.user_id = new.user_id and not m.share_app_names
  ) then
    new.app_name := 'App oculta';
    new.domain := null;
  end if;
  return new;
end $$;

create trigger activity_blocks_hide_apps before insert or update on public.activity_blocks
  for each row execute function public.hide_app_names();

-- ───────────────────── Funciones auxiliares ─────────────────────

-- Segundos a horas con 1 decimal (los nulos cuentan como 0).
create function public.dashboard_hours(p_seconds numeric) returns numeric
language sql immutable set search_path = ''
as $$
  select round(coalesce(p_seconds, 0) / 3600, 1)
$$;

-- Horas por categoría activa, con las cuatro claves siempre presentes.
create function public.dashboard_cats(p_productive numeric, p_neutral numeric, p_distraction numeric, p_ai numeric)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'productive', public.dashboard_hours(p_productive),
    'neutral', public.dashboard_hours(p_neutral),
    'distraction', public.dashboard_hours(p_distraction),
    'ai', public.dashboard_hours(p_ai))
$$;

-- Periodo [p_from, p_to): fin posterior al inicio y máximo 92 días.
create function public.assert_dashboard_period(p_from timestamptz, p_to timestamptz) returns void
language plpgsql immutable set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '92 days' then
    raise exception 'Rango inválido: el fin debe ser posterior al inicio y no superar 92 días' using errcode = '22023';
  end if;
end $$;

-- Proyectos donde quien llama es lead (D-5). Un owner o admin no es «lead» aunque tenga la fila: ve todo.
create function public.lead_projects(p_team uuid) returns table (project_id uuid)
language sql stable security definer set search_path = ''
as $$
  select pm.project_id
  from public.project_members pm
  join public.projects pj on pj.id = pm.project_id and pj.team_id = p_team
  where pm.user_id = auth.uid() and pm.role = 'lead' and public.team_role(p_team) = 'member'
$$;

-- ───────────────────── Ajustes del equipo (EQ-09, D-9) ─────────────────────

create function public.set_team_settings(
  p_team uuid, p_idle_minutes integer, p_workday jsonb, p_ai_counts_as_productive boolean,
  p_presence_visible_to_members boolean, p_pause_cap_minutes integer
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_days jsonb;
  v_start text;
  v_end text;
  v_workday jsonb;
begin
  if not public.has_team_role(p_team, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_idle_minutes is not null and p_idle_minutes not between 3 and 15 then
    raise exception 'El umbral de inactividad debe estar entre 3 y 15 minutos' using errcode = '22023';
  end if;
  if p_ai_counts_as_productive is null or p_presence_visible_to_members is null then
    raise exception 'Los ajustes necesitan un valor' using errcode = '22023';
  end if;
  if p_pause_cap_minutes is null or p_pause_cap_minutes not in (0, 15, 30, 60, 120, 240) then
    raise exception 'El tope de pausa debe ser 0 (sin tope), 15, 30, 60, 120 o 240 minutos' using errcode = '22023';
  end if;

  -- Jornada: { days, start, end } con días ISO (1 a 7) sin repetir y al menos uno; start < end en HH:MM.
  if p_workday is null or jsonb_typeof(p_workday) <> 'object' then
    raise exception 'La jornada necesita días, inicio y fin' using errcode = '22023';
  end if;
  v_days := p_workday -> 'days';
  if jsonb_typeof(v_days) is distinct from 'array' or jsonb_array_length(v_days) = 0 then
    raise exception 'La jornada necesita al menos un día' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(v_days) d where jsonb_typeof(d) <> 'number' or d::text !~ '^[1-7]$') then
    raise exception 'Los días de la jornada van de 1 (lunes) a 7 (domingo)' using errcode = '22023';
  end if;
  if (select count(distinct d::text) from jsonb_array_elements(v_days) d) <> jsonb_array_length(v_days) then
    raise exception 'Los días de la jornada no pueden repetirse' using errcode = '22023';
  end if;
  if jsonb_typeof(p_workday -> 'start') is distinct from 'string' or jsonb_typeof(p_workday -> 'end') is distinct from 'string' then
    raise exception 'El inicio y el fin de la jornada van en formato HH:MM' using errcode = '22023';
  end if;
  v_start := p_workday ->> 'start';
  v_end := p_workday ->> 'end';
  if v_start !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or v_end !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
    raise exception 'El inicio y el fin de la jornada van en formato HH:MM' using errcode = '22023';
  end if;
  if v_start >= v_end then
    raise exception 'El inicio de la jornada debe ser anterior al fin' using errcode = '22023';
  end if;
  v_workday := jsonb_build_object(
    'days', (select jsonb_agg((d::text)::integer order by (d::text)::integer) from jsonb_array_elements(v_days) d),
    'start', v_start,
    'end', v_end);

  -- Se conservan las demás claves de settings y de policies. Sin umbral de equipo, la clave idle_minutes se quita.
  update public.teams
  set settings = jsonb_set(
    (coalesce(settings, '{}'::jsonb) - 'idle_minutes')
      || case when p_idle_minutes is null then '{}'::jsonb else jsonb_build_object('idle_minutes', p_idle_minutes) end
      || jsonb_build_object('workday', v_workday),
    '{policies}',
    coalesce(settings -> 'policies', '{}'::jsonb)
      || jsonb_build_object(
        'ai_counts_as_productive', p_ai_counts_as_productive,
        'presence_visible_to_members', p_presence_visible_to_members,
        'pause_cap_minutes', p_pause_cap_minutes))
  where id = p_team;

  perform public.write_audit(p_team, 'settings_changed', null, jsonb_build_object(
    'idle_minutes', p_idle_minutes,
    'workday', v_workday,
    'ai_counts_as_productive', p_ai_counts_as_productive,
    'presence_visible_to_members', p_presence_visible_to_members,
    'pause_cap_minutes', p_pause_cap_minutes));
end $$;

-- ───────────────────── No compartir nombres de apps (PS-05, D-8 capa 3) ─────────────────────

-- Derecho personal (fila 39): cualquier miembro que no sea viewer. Al apagarlo se ocultan también los bloques ya subidos
-- en ese equipo; al encenderlo de nuevo solo cambia lo que llegue después.
create function public.set_share_app_names(p_team uuid, p_share boolean) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text := public.team_role(p_team);
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_share is null then
    raise exception 'Hace falta indicar si compartes los nombres de tus apps' using errcode = '22023';
  end if;
  update public.team_members set share_app_names = p_share where team_id = p_team and user_id = auth.uid();
  if not p_share then
    update public.activity_blocks set app_name = 'App oculta', domain = null
    where team_id = p_team and user_id = auth.uid() and (app_name <> 'App oculta' or domain is not null);
  end if;
  perform public.write_audit(p_team, 'share_apps_changed', auth.uid(), jsonb_build_object('share', p_share));
end $$;

-- ───────────────────── Presencia (DR-01, D-4) ─────────────────────

-- Estado según el último bloque subido de cada persona. Nunca devuelve app, dominio ni herramienta de IA.
create function public.team_presence(p_team uuid)
returns table (user_id uuid, name text, state text, since timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role text := public.team_role(p_team);
  v_visible boolean;
  v_all boolean;
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  select coalesce((t.settings #>> '{policies,presence_visible_to_members}')::boolean, false) into v_visible
  from public.teams t where t.id = p_team;
  -- Owner y admin ven a todos; el member, solo si el equipo lo permite; si no, el lead ve a las personas de sus proyectos.
  v_all := v_role in ('owner', 'admin') or (v_role = 'member' and v_visible);
  if not v_all and not exists (select 1 from public.lead_projects(p_team)) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  return query
    select m.user_id, pr.display_name,
           case when lb.ended_at is null or lb.ended_at < now() - interval '3 minutes' then 'offline'
                when lb.category = 'idle' then 'idle'
                when lb.category = 'paused' then 'paused'
                when lb.category = 'break' then 'break'
                else 'active' end,
           case when lb.ended_at is null or lb.ended_at < now() - interval '3 minutes' then null else lb.started_at end
    from public.team_members m
    left join public.profiles pr on pr.id = m.user_id
    left join lateral (
      select b.category, b.started_at, b.ended_at
      from public.activity_blocks b
      where b.team_id = p_team and b.user_id = m.user_id
      order by b.ended_at desc, b.started_at desc
      limit 1
    ) lb on true
    where m.team_id = p_team and m.role <> 'viewer'
      and (v_all or m.user_id in (
        select pm.user_id from public.project_members pm
        where pm.project_id in (select l.project_id from public.lead_projects(p_team) l)))
    order by pr.display_name, m.user_id;
end $$;

-- ───────────────────── Mi tiempo por proyecto y tarea (TA-10, DR-05) ─────────────────────

-- Solo entradas propias, no borradas, con fin = coalesce(ended_at, now()) y recortadas al periodo.
create function public.my_time_by_task(p_team uuid, p_from timestamptz, p_to timestamptz)
returns table (project_id uuid, project_name text, task_id uuid, task_title text, seconds bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_role text := public.team_role(p_team);
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_dashboard_period(p_from, p_to);
  return query
    select pj.id, pj.name, t.id, t.title,
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), p_to) - greatest(e.started_at, p_from))))::bigint
    from public.time_entries e
    left join public.tasks t on t.id = e.task_id
    left join public.projects pj on pj.id = t.project_id
    where e.team_id = p_team and e.user_id = auth.uid() and e.deleted_at is null
      and e.started_at < p_to and coalesce(e.ended_at, now()) > p_from
    group by pj.id, pj.name, t.id, t.title
    order by pj.name nulls last, t.title nulls last, t.id;
end $$;

-- ───────────────────── Tablero (DR-01 a DR-03, DR-07, IA-02, IA-05, D-2) ─────────────────────

create function public.team_dashboard(p_team uuid, p_from timestamptz, p_to timestamptz) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_role text := public.team_role(p_team);
  v_tz text;
  v_settings jsonb;
  v_ai_prod boolean;
  v_is_lead boolean;
  v_members integer;
  v_show boolean;
  v_wd jsonb;
  v_days integer[];
  v_start time;
  v_end time;
  v_today date;
  v_first date;
  v_last date;
  v_cap_days integer;
  v_cap_sec numeric;
begin
  if v_role is null then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  perform public.assert_dashboard_period(p_from, p_to);

  select coalesce(max(pr.timezone), 'America/Bogota') into v_tz from public.profiles pr where pr.id = v_uid;
  select t.settings into v_settings from public.teams t where t.id = p_team;
  v_ai_prod := coalesce((v_settings #>> '{policies,ai_counts_as_productive}')::boolean, false);
  -- Quien es lead y además owner o admin recibe la vista de owner/admin (D-5): is_lead solo vale para un member.
  v_is_lead := exists (select 1 from public.lead_projects(p_team));
  v_members := public.report_members(p_team, 'team', p_team);
  -- D-3: member y viewer necesitan al menos 2 miembros (sin viewer) para ver totales; owner y admin siempre.
  v_show := v_role in ('owner', 'admin') or v_members >= 2;

  -- D-6: capacidad = horas de la jornada × días laborales del periodo hasta hoy incluido (zona de quien llama).
  v_wd := coalesce(v_settings -> 'workday', '{"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}'::jsonb);
  v_days := array(select x::integer from jsonb_array_elements_text(v_wd -> 'days') x);
  v_start := coalesce((v_wd ->> 'start')::time, time '08:00');
  v_end := coalesce((v_wd ->> 'end')::time, time '18:00');
  v_today := (now() at time zone v_tz)::date;
  v_first := (p_from at time zone v_tz)::date;
  v_last := ((p_to - interval '1 microsecond') at time zone v_tz)::date;
  select count(*) into v_cap_days from generate_series(0, v_last - v_first) i
  where v_first + i <= v_today and extract(isodow from v_first + i)::integer = any (v_days);
  v_cap_sec := greatest(extract(epoch from (v_end - v_start)), 0) * v_cap_days;

  return (
  with
  -- Bloques activos de miembros (sin viewer) que tocan el periodo, con los segundos recortados a él.
  b as (
    select bl.user_id, bl.category, bl.app_name, bl.ai_tool, bl.ai_usage_type, bl.started_at, bl.ended_at,
           extract(epoch from (least(bl.ended_at, p_to) - greatest(bl.started_at, p_from))) as sec
    from public.activity_blocks bl
    join public.team_members m on m.team_id = bl.team_id and m.user_id = bl.user_id and m.role <> 'viewer'
    where bl.team_id = p_team and bl.category in ('productive', 'neutral', 'distraction', 'ai')
      and bl.started_at < p_to and bl.ended_at > p_from
  ),
  tot as (
    select coalesce(sum(sec), 0) as act,
           coalesce(sum(sec) filter (where category = 'productive'), 0) as pr,
           coalesce(sum(sec) filter (where category = 'neutral'), 0) as ne,
           coalesce(sum(sec) filter (where category = 'distraction'), 0) as di,
           coalesce(sum(sec) filter (where category = 'ai'), 0) as ai,
           count(*) filter (where category = 'ai' and started_at >= p_from) as ses
    from b
  ),
  tools as (
    select public.report_ai_tool(ai_tool) as tool, sum(sec) as sec from b where category = 'ai' group by 1
  ),
  usg as (
    select coalesce(ai_usage_type, 'untagged') as u, sum(sec) as sec from b where category = 'ai' group by 1
  ),
  tk as (
    select count(*) filter (where status = 'doing') as doing,
           count(*) filter (where status = 'done' and completed_at >= p_from and completed_at < p_to) as done
    from public.tasks where team_id = p_team
  ),
  -- Días calendario en la zona de quien llama, con sus horas por categoría.
  days as (
    select v_first + i as day from generate_series(0, v_last - v_first) i
  ),
  pd as (
    select d.day,
           coalesce(sum(x.s) filter (where x.category = 'productive'), 0) as pr,
           coalesce(sum(x.s) filter (where x.category = 'neutral'), 0) as ne,
           coalesce(sum(x.s) filter (where x.category = 'distraction'), 0) as di,
           coalesce(sum(x.s) filter (where x.category = 'ai'), 0) as ai
    from days d
    left join lateral (
      select bb.category,
             extract(epoch from (least(bb.ended_at, p_to, ((d.day + 1)::timestamp at time zone v_tz))
                                 - greatest(bb.started_at, p_from, (d.day::timestamp at time zone v_tz)))) as s
      from b bb
      where bb.started_at < ((d.day + 1)::timestamp at time zone v_tz) and bb.ended_at > (d.day::timestamp at time zone v_tz)
    ) x on true
    group by d.day
  ),
  -- Owner y admin: una fila por miembro (sin viewer).
  per as (
    select r.user_id, r.name, r.share_app_names,
           coalesce(sum(b.sec), 0) as act,
           coalesce(sum(b.sec) filter (where b.category = 'productive'), 0) as pr,
           coalesce(sum(b.sec) filter (where b.category = 'neutral'), 0) as ne,
           coalesce(sum(b.sec) filter (where b.category = 'distraction'), 0) as di,
           coalesce(sum(b.sec) filter (where b.category = 'ai'), 0) as ai,
           count(b.sec) filter (where b.category = 'ai' and b.started_at >= p_from) as ses
    from (
      select m.user_id, pr.display_name as name, m.share_app_names
      from public.team_members m
      left join public.profiles pr on pr.id = m.user_id
      where m.team_id = p_team and m.role <> 'viewer'
    ) r
    left join b on b.user_id = r.user_id
    group by r.user_id, r.name, r.share_app_names
  ),
  apps as (
    select b.app_name, sum(b.sec) as sec from b where b.app_name <> 'App oculta' group by b.app_name
    order by sum(b.sec) desc, b.app_name limit 10
  ),
  -- Lead (D-5): personas de sus proyectos y sus temporizadores en tareas de esos proyectos.
  lp as (
    select l.project_id from public.lead_projects(p_team) l
  ),
  people as (
    select distinct pm.user_id
    from public.project_members pm
    join public.team_members m on m.team_id = p_team and m.user_id = pm.user_id and m.role <> 'viewer'
    where pm.project_id in (select project_id from lp)
  ),
  tm as (
    select e.user_id, greatest(e.started_at, p_from) as iv_s, least(coalesce(e.ended_at, now()), p_to) as iv_e
    from public.time_entries e
    join public.tasks t on t.id = e.task_id
    where e.team_id = p_team and e.deleted_at is null
      and t.project_id in (select project_id from lp)
      and e.user_id in (select user_id from people)
      and e.started_at < p_to and coalesce(e.ended_at, now()) > p_from
  ),
  -- Se unen los temporizadores que se solapan entre sí: así una hora de IA nunca se cuenta dos veces.
  tm_o as (
    select tm.*, max(tm.iv_e) over (partition by tm.user_id order by tm.iv_s, tm.iv_e
                                    rows between unbounded preceding and 1 preceding) as prev_e
    from tm
  ),
  tm_g as (
    select tm_o.*, sum(case when prev_e is null or iv_s > prev_e then 1 else 0 end)
                     over (partition by user_id order by iv_s, iv_e rows between unbounded preceding and current row) as g
    from tm_o
  ),
  mi as (
    select user_id, min(iv_s) as iv_s, max(iv_e) as iv_e from tm_g group by user_id, g
  ),
  ph as (
    select user_id, sum(extract(epoch from (iv_e - iv_s))) as sec from tm group by user_id
  ),
  aih as (
    select mi.user_id, sum(extract(epoch from (least(b.ended_at, mi.iv_e) - greatest(b.started_at, mi.iv_s)))) as sec
    from mi
    join b on b.user_id = mi.user_id and b.category = 'ai' and b.started_at < mi.iv_e and b.ended_at > mi.iv_s
    group by mi.user_id
  )
  select jsonb_build_object(
    'role', v_role,
    'is_lead', v_is_lead,
    'totals', case when v_show then (
      select jsonb_build_object(
        'members', v_members,
        'hours_active', public.dashboard_hours(tot.act),
        'hours_productive', public.dashboard_hours(tot.pr + case when v_ai_prod then tot.ai else 0 end),
        'hours_category', public.dashboard_cats(tot.pr, tot.ne, tot.di, tot.ai),
        'ai_hours', public.dashboard_hours(tot.ai),
        'ai_sessions', tot.ses,
        'ai_tool', coalesce((select jsonb_object_agg(tools.tool, public.dashboard_hours(tools.sec)) from tools), '{}'::jsonb),
        'ai_usage', jsonb_build_object(
          'code', public.dashboard_hours((select sec from usg where u = 'code')),
          'writing', public.dashboard_hours((select sec from usg where u = 'writing')),
          'analysis', public.dashboard_hours((select sec from usg where u = 'analysis')),
          'other', public.dashboard_hours((select sec from usg where u = 'other')),
          'untagged', public.dashboard_hours((select sec from usg where u = 'untagged'))),
        'tasks_doing', tk.doing,
        'tasks_done', tk.done)
      from tot, tk) end,
    'per_day', case when v_show then coalesce((
      select jsonb_agg(jsonb_build_object('day', to_char(pd.day, 'YYYY-MM-DD'),
                                          'hours_category', public.dashboard_cats(pd.pr, pd.ne, pd.di, pd.ai)) order by pd.day)
      from pd), '[]'::jsonb) else '[]'::jsonb end,
    'members', case when v_role in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', per.user_id,
        'name', per.name,
        'share_app_names', per.share_app_names,
        'hours_active', public.dashboard_hours(per.act),
        'hours_productive', public.dashboard_hours(per.pr + case when v_ai_prod then per.ai else 0 end),
        'hours_category', public.dashboard_cats(per.pr, per.ne, per.di, per.ai),
        'ai_hours', public.dashboard_hours(per.ai),
        'ai_sessions', per.ses,
        'capacity_hours', round(v_cap_sec / 3600, 1),
        -- D-6: 100 × hours_active ÷ capacity_hours, con las horas mostradas (hours_active ya redondeado a 1 decimal).
        'capacity_share', case when v_cap_sec > 0 then round(100 * public.dashboard_hours(per.act) / (v_cap_sec / 3600.0)) end,
        'tasks_doing', coalesce((
          select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project_id', t.project_id, 'project_name', pj.name)
                           order by pj.name, t.title, t.id)
          from public.tasks t join public.projects pj on pj.id = t.project_id
          where t.team_id = p_team and t.assignee_id = per.user_id and t.status = 'doing'), '[]'::jsonb))
        order by per.name, per.user_id)
      from per), '[]'::jsonb) else '[]'::jsonb end,
    'lead_members', case when v_is_lead then coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'name', pr.display_name,
        'project_hours', public.dashboard_hours(ph.sec),
        'ai_hours_in_projects', public.dashboard_hours((select sum(a.sec) from aih a where a.user_id = p.user_id)),
        'tasks_doing', coalesce((
          select jsonb_agg(jsonb_build_object('id', t.id, 'title', t.title, 'project_id', t.project_id, 'project_name', pj.name)
                           order by pj.name, t.title, t.id)
          from public.tasks t join public.projects pj on pj.id = t.project_id
          where t.project_id in (select project_id from lp) and t.assignee_id = p.user_id and t.status = 'doing'), '[]'::jsonb))
        order by pr.display_name, p.user_id)
      from people p
      left join public.profiles pr on pr.id = p.user_id
      left join ph on ph.user_id = p.user_id), '[]'::jsonb) else '[]'::jsonb end,
    'top_apps', case when v_role in ('owner', 'admin') then coalesce((
      select jsonb_agg(jsonb_build_object('app_name', apps.app_name, 'hours', public.dashboard_hours(apps.sec))
                       order by apps.sec desc, apps.app_name)
      from apps), '[]'::jsonb) else '[]'::jsonb end
  )
  );
end $$;

-- ───────────────────── save_report con D-18 ─────────────────────

-- Copia del cuerpo vigente (20261011000001). Único cambio: data_until de un reporte personal es nulo si la persona
-- no tiene bloques en el periodo (antes LEAST ignoraba el nulo y quedaba el fin del periodo).
create or replace function public.save_report(
  p_team uuid, p_scope text, p_subject uuid, p_period text, p_facts_hash text, p_narrative jsonb,
  p_mode text, p_validation text, p_prompt_version text, p_language text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text := public.report_assert_can_generate(p_team, p_scope, p_subject);
  v_period record;
  v_facts jsonb;
  v_hash text;
  v_ids text[];
  v_id uuid;
  v_until timestamptz;
begin
  select * into v_period from public.report_period(p_period, v_tz);
  v_facts := public.report_facts(p_team, p_scope, p_subject, v_period.period_from, v_period.period_to, v_tz);
  v_hash := encode(sha256(convert_to(v_facts::text, 'UTF8')), 'hex');
  if v_hash <> coalesce(p_facts_hash, '') then
    raise exception 'Los datos cambiaron mientras se generaba el reporte: vuelve a generarlo' using errcode = '40001';
  end if;
  select array_agg(f ->> 'id') into v_ids from jsonb_array_elements(v_facts) f;

  -- D-6: solo la forma. El validador completo (números, nombres, correos) corre en TypeScript.
  if jsonb_typeof(p_narrative) <> 'object'
     or (select array_agg(k order by k) from jsonb_object_keys(p_narrative) k)
        <> array['insights', 'insufficient_data', 'recommendations', 'summary']
     or jsonb_typeof(p_narrative -> 'summary') <> 'string'
     or char_length(p_narrative ->> 'summary') not between 1 and 800
     or jsonb_typeof(p_narrative -> 'insufficient_data') <> 'boolean'
     or not public.report_items_valid(p_narrative -> 'insights', 4, coalesce(v_ids, '{}'))
     or not public.report_items_valid(p_narrative -> 'recommendations', 3, coalesce(v_ids, '{}'))
     or ((p_narrative ->> 'insufficient_data')::boolean
         and jsonb_array_length(p_narrative -> 'insights') + jsonb_array_length(p_narrative -> 'recommendations') > 0)
  then
    raise exception 'La narrativa no tiene el formato del reporte' using errcode = '22023';
  end if;

  -- D-18: personal → fin del último bloque sincronizado del periodo (sin pasar de su fin), o nulo si no hay bloques;
  -- grupo → hora de generación.
  -- El filtro «ended_at > inicio del periodo» es parte de D-18 («sin bloques en el periodo → nulo»): sin él, una persona
  -- con bloques de días anteriores pero ninguno en el periodo recibiría el fin de un bloque ajeno al periodo en vez de nulo.
  if p_scope = 'personal' then
    select case when max(b.ended_at) is null then null
                else least(max(b.ended_at), (v_period.period_to + 1)::timestamp at time zone v_tz) end into v_until
    from public.activity_blocks b
    where b.team_id = p_team and b.user_id = auth.uid()
      and b.started_at < (v_period.period_to + 1)::timestamp at time zone v_tz
      and b.ended_at > v_period.period_from::timestamp at time zone v_tz;
  else
    v_until := now();
  end if;

  insert into public.report_runs (
    team_id, scope, subject_id, period, period_from, period_to, facts, facts_hash, narrative,
    mode, validation, validated_by, prompt_version, language, data_until, created_by
  ) values (
    p_team, p_scope, p_subject, p_period, v_period.period_from, v_period.period_to, v_facts, v_hash, p_narrative,
    p_mode, p_validation, 'client', p_prompt_version, p_language, v_until, auth.uid()
  )
  on conflict (team_id, scope, subject_id, period_from, period_to, facts_hash, prompt_version, language) do nothing
  returning id into v_id;

  if v_id is null then
    -- Ya había uno con los mismos hechos (caché, D-9): se devuelve ese.
    select r.id into v_id from public.report_runs r
    where r.team_id = p_team and r.scope = p_scope and r.subject_id = p_subject
      and r.period_from = v_period.period_from and r.period_to = v_period.period_to
      and r.facts_hash = v_hash and r.prompt_version = p_prompt_version and r.language = p_language;
    return v_id;
  end if;

  if p_scope in ('project', 'team') then
    perform public.write_audit(p_team, 'report_generated', null,
      jsonb_build_object('report', v_id, 'scope', p_scope, 'subject', p_subject, 'period', p_period));
  end if;
  return v_id;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

-- Internas (activador y auxiliares): nadie las ejecuta desde la API.
revoke execute on function
  public.hide_app_names(),
  public.dashboard_hours(numeric),
  public.dashboard_cats(numeric, numeric, numeric, numeric),
  public.assert_dashboard_period(timestamptz, timestamptz),
  public.lead_projects(uuid)
from public, anon, authenticated;

-- Las que llama la app con el JWT de la persona (Contratos → Permisos).
revoke execute on function
  public.team_dashboard(uuid, timestamptz, timestamptz),
  public.team_presence(uuid),
  public.set_team_settings(uuid, integer, jsonb, boolean, boolean, integer),
  public.set_share_app_names(uuid, boolean),
  public.my_time_by_task(uuid, timestamptz, timestamptz),
  public.save_report(uuid, text, uuid, text, text, jsonb, text, text, text, text)
from public, anon;
grant execute on function
  public.team_dashboard(uuid, timestamptz, timestamptz),
  public.team_presence(uuid),
  public.set_team_settings(uuid, integer, jsonb, boolean, boolean, integer),
  public.set_share_app_names(uuid, boolean),
  public.my_time_by_task(uuid, timestamptz, timestamptz),
  public.save_report(uuid, text, uuid, text, text, jsonb, text, text, text, text)
to authenticated;
