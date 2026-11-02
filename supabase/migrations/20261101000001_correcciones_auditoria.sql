-- Correcciones de la auditoría de base de datos.
-- Cada función se copia de su última definición y solo cambia lo indicado (misma firma, volatilidad,
-- security definer y search_path: los permisos de ejecución se conservan).
--   1. review_task: sin revisor pedido (reviewer_id nulo) cualquier colaborador podía decidir.
--      Las comparaciones con auth.uid() van con coalesce(..., false).
--   2. (validate_entry_task queda fuera: la prueba AC-13 exige rechazar un task_id inexistente.)
--   3. set_task_evidence: con created_by nulo (quien creó la tarea borró su cuenta) dejaba pasar a cualquiera.
--      coalesce(..., false).
--   4. invitations_select: un admin leía el código de invitaciones de owner o admin y podía hacerse owner.
--      El owner ve todas; el admin, solo las de member y viewer (lo mismo que ya exigen invite_member y
--      revoke_invitation).
--   5. task_seconds, team_time_summary, project_time_summary, my_time_by_task y los temporizadores de
--      team_dashboard: el fin de una entrada abierta se limita a 24 h desde el inicio (como al detenerla en
--      Rust) y una entrada con reloj adelantado no resta (nunca segundos negativos).
--   6. report_assert_can_generate: con p_subject nulo el reporte personal devolvía cifras de todo el equipo.
--      Se compara con «is distinct from» (también en el de equipo).

-- ─────────── 1. review_task (de 20261008000002_trabajo_v2.sql) ───────────

-- Deciden el revisor pedido, el líder o owner/admin. Quien envió no se aprueba a sí mismo
-- salvo que gestione el proyecto (ADR-0014).
create or replace function public.review_task(p_review uuid, p_approve boolean, p_comment text default null) returns void
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
     or not (v_manager or coalesce(v_review.reviewer_id = auth.uid(), false))
     or (coalesce(v_review.submitted_by = auth.uid(), false) and not v_manager) then
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

-- ─────────── 3. set_task_evidence (de 20261008000005_evidencia_por_tarea.sql) ───────────

-- La elige quien gestiona el proyecto o quien creó la tarea.
create or replace function public.set_task_evidence(p_task uuid, p_evidence text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_task public.tasks;
begin
  select * into v_task from public.tasks t where t.id = p_task;
  if v_task.id is null or not (public.can_manage_project(v_task.project_id)
     or (coalesce(v_task.created_by = auth.uid(), false) and public.can_see_project(v_task.project_id))) then
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

-- ─────────── 4. invitations_select (de 20261006000001_invitaciones_auditoria_consentimiento.sql) ───────────

drop policy invitations_select on public.invitations;
-- Invitaciones: el owner ve todas las de su equipo; el admin, solo las de member y viewer (las que puede
-- enviar y anular). La persona invitada las ve con my_invitations().
create policy invitations_select on public.invitations for select to authenticated
  using (
    public.has_team_role(team_id, array['owner'])
    or (public.has_team_role(team_id, array['admin']) and role in ('member', 'viewer'))
  );

-- ─────────── 5. Tiempo registrado con tope de 24 h y sin negativos ───────────

-- Segundos registrados por tarea (todas las personas, también exmiembros; el temporizador en marcha cuenta hasta ahora).
create or replace function public.task_seconds(p_task uuid) returns bigint
language sql stable security definer set search_path = ''
as $$
  select coalesce(sum(greatest(extract(epoch from (least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours') - e.started_at)), 0)), 0)::bigint
  from public.time_entries e
  where e.task_id = p_task and e.deleted_at is null
$$;

-- Owner y admin ven el tiempo registrado (temporizador y manual) por miembro.
-- Quien ya no pertenece al equipo aparece con user_id null: la interfaz lo muestra como «Exmiembro».
create or replace function public.team_time_summary(p_team uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, seconds bigint, entries bigint)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.has_team_role(p_team, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_to <= p_from or p_to - p_from > interval '366 days' then
    raise exception 'Rango inválido: el fin debe ser posterior al inicio y no superar 366 días'
      using errcode = '22023';
  end if;
  return query
    select m.user_id,
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours', p_to) - greatest(e.started_at, p_from))))::bigint,
           count(*)::bigint
    from public.time_entries e
    left join public.team_members m on m.team_id = e.team_id and m.user_id = e.user_id
    where e.team_id = p_team and e.deleted_at is null
      and e.started_at < p_to and least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours') > greatest(e.started_at, p_from)
    group by m.user_id;
end $$;

-- Fila 13 «P»: tiempo por persona en las tareas del proyecto. Exmiembros del equipo con user_id null.
create or replace function public.project_time_summary(p_project uuid, p_from timestamptz, p_to timestamptz)
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
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours', p_to) - greatest(e.started_at, p_from))))::bigint
    from public.time_entries e
    join public.tasks t on t.id = e.task_id
    left join public.team_members m on m.team_id = e.team_id and m.user_id = e.user_id
    where t.project_id = p_project and e.deleted_at is null
      and e.started_at < p_to and least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours') > greatest(e.started_at, p_from)
    group by m.user_id;
end $$;

-- Solo entradas propias, no borradas, con fin = coalesce(ended_at, now()) (como mucho 24 h tras el inicio) y recortadas al periodo.
create or replace function public.my_time_by_task(p_team uuid, p_from timestamptz, p_to timestamptz)
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
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours', p_to) - greatest(e.started_at, p_from))))::bigint
    from public.time_entries e
    left join public.tasks t on t.id = e.task_id
    left join public.projects pj on pj.id = t.project_id
    where e.team_id = p_team and e.user_id = auth.uid() and e.deleted_at is null
      and e.started_at < p_to and least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours') > greatest(e.started_at, p_from)
    group by pj.id, pj.name, t.id, t.title
    order by pj.name nulls last, t.title nulls last, t.id;
end $$;

-- Tablero (de 20261013000001_tableros_y_privacidad.sql): solo cambian los temporizadores del lead (tm).

create or replace function public.team_dashboard(p_team uuid, p_from timestamptz, p_to timestamptz) returns jsonb
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
    select e.user_id, greatest(e.started_at, p_from) as iv_s, least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours', p_to) as iv_e
    from public.time_entries e
    join public.tasks t on t.id = e.task_id
    where e.team_id = p_team and e.deleted_at is null
      and t.project_id in (select project_id from lp)
      and e.user_id in (select user_id from people)
      and e.started_at < p_to and least(coalesce(e.ended_at, now()), e.started_at + interval '24 hours') > greatest(e.started_at, p_from)
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

-- ─────────── 6. report_assert_can_generate (de 20261030000002_roles_en_espanol_en_mensajes.sql) ───────────

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
    if p_subject is distinct from auth.uid() then
      raise exception 'No permitido: el reporte personal es solo sobre ti' using errcode = '42501';
    end if;
  elsif p_scope = 'project' then
    if not exists (select 1 from public.projects p where p.id = p_subject and p.team_id = p_team)
       or not public.can_manage_project(p_subject) then
      raise exception 'No permitido: el reporte de proyecto lo generan propietarios, administradores o el líder del proyecto' using errcode = '42501';
    end if;
  elsif p_scope = 'team' then
    if p_subject is distinct from p_team or v_role not in ('owner', 'admin') then
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

