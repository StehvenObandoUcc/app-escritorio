-- IA y reportes (F4)
-- Tablas: report_runs, ai_usage. Restricción nueva en activity_blocks (ai_usage_type solo en bloques de IA).
-- Reglas: docs/ROLES.md filas 20 a 22 y 35 a 37. Spec: docs/specs/F4-ia-y-reportes.md (D-1 a D-19, Diccionario de métricas)
-- Pruebas: supabase/tests/ia_y_reportes.test.ts
--
-- Decisiones de esta migración:
--   · Las cifras salen de report_facts (D-09 de la arquitectura); la IA solo redacta. Ningún hecho identifica a nadie (D-4).
--   · save_report recalcula los hechos y solo comprueba la forma de la narrativa (D-6); el validador completo es TypeScript.
--     Siempre guarda validated_by = 'client'; solo mark_trial_report (service_role) lo pasa a 'server'.
--   · Si los datos cambiaron entre pedir los hechos y guardar, save_report lo rechaza (p_facts_hash): así el texto
--     de la IA siempre corresponde a las cifras guardadas.
--   · El cupo gratis se cuenta por día de America/Bogota (D-10) y se serializa con pg_advisory_xact_lock.

-- ───────────────────────── Tablas ─────────────────────────

create table public.report_runs (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  scope text not null check (scope in ('personal', 'project', 'team')),
  -- personal: la persona; project: el proyecto; team: el equipo
  subject_id uuid not null,
  period text not null check (period in ('today', 'yesterday', 'this_week', 'last_week')),
  period_from date not null,
  period_to date not null,
  facts jsonb not null,
  facts_hash text not null,
  narrative jsonb not null,
  mode text not null check (mode in ('free', 'own_key', 'manual')),
  validation text not null check (validation in ('ok', 'retried', 'fallback')),
  validated_by text not null default 'client' check (validated_by in ('server', 'client')),
  prompt_version text not null check (prompt_version in ('report.v2')),
  language text not null check (language in ('es', 'en')),
  data_until timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint report_runs_period_order check (period_from <= period_to)
);
-- Caché (D-9): un reporte por alcance, fechas, hechos, prompt e idioma.
create unique index report_runs_cache_key on public.report_runs
  (team_id, scope, subject_id, period_from, period_to, facts_hash, prompt_version, language);
create index report_runs_team_created_idx on public.report_runs (team_id, created_at desc);

create table public.ai_usage (
  day date not null,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  count integer not null default 0 check (count >= 0),
  last_at timestamptz,
  primary key (day, team_id, user_id)
);

-- IA-04: la etiqueta de uso solo existe en bloques de IA.
alter table public.activity_blocks add constraint activity_blocks_ai_usage_only_for_ai
  check (ai_usage_type is null or category = 'ai');

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
  'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined',
  'policy_changed', 'project_deleted', 'task_deleted', 'report_generated'
));

-- ───────────────────────── RLS ─────────────────────────

alter table public.report_runs enable row level security;
alter table public.ai_usage enable row level security;

-- D-14 (ROLES 35 a 37): equipo → todos los roles del equipo; proyecto → owner, admin y miembros del proyecto;
-- personal → solo su autor.
create policy report_runs_select on public.report_runs for select to authenticated
  using (
    case scope
      when 'team' then public.team_role(team_id) is not null
      when 'project' then public.can_see_project(subject_id)
      else created_by = auth.uid() and subject_id = auth.uid()
    end
  );

revoke all on public.report_runs, public.ai_usage from anon, authenticated;
grant select on public.report_runs to authenticated;

-- ───────────────────── Periodos y hechos ─────────────────────

-- D-2: hoy, ayer, esta semana y la semana pasada (lunes a domingo) en la zona horaria dada.
create function public.report_period(p_period text, p_tz text, out period_from date, out period_to date)
language plpgsql stable set search_path = ''
as $$
declare
  v_today date := (now() at time zone p_tz)::date;
  v_monday date := date_trunc('week', v_today)::date;
begin
  case p_period
    when 'today' then period_from := v_today; period_to := v_today;
    when 'yesterday' then period_from := v_today - 1; period_to := v_today - 1;
    when 'this_week' then period_from := v_monday; period_to := v_monday + 6;
    when 'last_week' then period_from := v_monday - 7; period_to := v_monday - 1;
    else raise exception 'Periodo desconocido' using errcode = '22023';
  end case;
end $$;

-- Herramienta de IA normalizada (D-3): solo estos siete valores; cualquier otro texto cuenta como «other».
create function public.report_ai_tool(p_tool text) returns text
language sql immutable set search_path = ''
as $$
  select case
    when regexp_replace(lower(coalesce(p_tool, '')), '[^a-z0-9]', '', 'g')
         in ('chatgpt', 'claude', 'gemini', 'deepseek', 'copilot', 'ollama', 'lmstudio')
    then regexp_replace(lower(p_tool), '[^a-z0-9]', '', 'g')
    else 'other'
  end
$$;

-- Miembros de un grupo, sin viewer (métrica «members»).
create function public.report_members(p_team uuid, p_scope text, p_subject uuid) returns integer
language sql stable security definer set search_path = ''
as $$
  select case p_scope
    when 'team' then (select count(*)::integer from public.team_members m where m.team_id = p_team and m.role <> 'viewer')
    when 'project' then (
      select count(*)::integer from public.project_members pm
      join public.team_members m on m.team_id = p_team and m.user_id = pm.user_id and m.role <> 'viewer'
      where pm.project_id = p_subject)
    else 1
  end
$$;

-- Hechos del Diccionario de métricas, en orden fijo, con sus identificadores F1, F2…
-- Sin comprobar permisos: solo la llaman get_report_facts y save_report, que ya los comprobaron.
create function public.report_facts(
  p_team uuid, p_scope text, p_subject uuid, p_from date, p_to date, p_tz text
) returns jsonb
language sql stable security definer set search_path = ''
as $$
with
p as (
  select p_from::timestamp at time zone p_tz as s,
         (p_to + 1)::timestamp at time zone p_tz as e,
         (now() at time zone p_tz)::date as today,
         case when p_scope = 'personal' then p_subject end as usr,
         case when p_scope = 'project' then p_subject end as prj,
         p_scope in ('personal', 'team') as with_activity
),
-- Actividad (personal y equipo; los bloques no llevan proyecto). Solo categorías: nunca apps ni dominios.
b as (
  select bl.category, public.report_ai_tool(bl.ai_tool) as tool, coalesce(bl.ai_usage_type, 'untagged') as usage,
         extract(epoch from (least(bl.ended_at, p.e) - greatest(bl.started_at, p.s))) as sec,
         bl.started_at >= p.s as inside
  from p
  join public.activity_blocks bl on bl.team_id = p_team and bl.started_at < p.e and bl.ended_at > p.s
  join public.team_members m on m.team_id = bl.team_id and m.user_id = bl.user_id
  where p.with_activity and (p.usr is null or bl.user_id = p.usr)
),
active as (
  select coalesce(sum(sec) filter (where category in ('productive', 'neutral', 'distraction', 'ai')), 0) as sec from b
),
cats as (
  select c.cat, c.n, coalesce((select sum(b.sec) from b where b.category = c.cat), 0) as sec
  from unnest(array['productive', 'neutral', 'distraction', 'ai']) with ordinality as c(cat, n)
),
t as (
  select tk.* from p join public.tasks tk on tk.team_id = p_team and (p.prj is null or tk.project_id = p.prj)
),
done as (
  select t.* from t, p
  where t.status = 'done' and t.completed_at >= p.s and t.completed_at < p.e and (p.usr is null or t.assignee_id = p.usr)
),
logged as (
  select e.task_id, sum(extract(epoch from (e.ended_at - e.started_at))) as sec
  from public.time_entries e
  where e.task_id in (select id from done) and e.deleted_at is null and e.ended_at is not null
  group by e.task_id
),
fr (ord, metric, dimension, value, unit) as (
  select 1, 'hours_active', null::text, round(a.sec / 3600, 1), 'h' from active a, p where p.with_activity
  union all
  select 2, 'hours_category', c.cat, round(c.sec / 3600, 1), 'h' from cats c, p where p.with_activity
  union all
  select 3, 'share_category', c.cat, case when a.sec > 0 then round(100 * c.sec / a.sec) else 0 end, '%'
  from cats c, active a, p where p.with_activity
  union all
  select 4, 'ai_sessions', null, (select count(*) from b where b.category = 'ai' and b.inside), 'n' from p where p.with_activity
  union all
  select 5, 'hours_ai_tool', b.tool, round(sum(b.sec) / 3600, 1), 'h' from b where b.category = 'ai' group by b.tool having sum(b.sec) > 0
  union all
  select 6, 'hours_ai_usage', b.usage, round(sum(b.sec) / 3600, 1), 'h' from b where b.category = 'ai' group by b.usage having sum(b.sec) > 0
  union all
  -- Temporizador: entradas cerradas, recortadas al periodo.
  select 7, 'hours_timer', null, (
    select round(coalesce(sum(extract(epoch from (least(e.ended_at, p.e) - greatest(e.started_at, p.s)))), 0) / 3600, 1)
    from public.time_entries e
    where e.team_id = p_team and e.deleted_at is null and e.ended_at is not null
      and e.started_at < p.e and e.ended_at > p.s
      and (p.usr is null or e.user_id = p.usr)
      and (p.prj is null or e.task_id in (select t.id from t))), 'h'
  from p
  union all
  select 8, 'tasks_done', null, (select count(*) from done), 'n'
  union all
  select 9, 'tasks_created', null, (
    select count(*) from t where t.created_at >= p.s and t.created_at < p.e and (p.usr is null or t.created_by = p.usr)), 'n'
  from p
  union all
  select 10, 'tasks_returned', null, (
    select count(*) from public.task_reviews rv join t on t.id = rv.task_id
    where rv.status = 'changes_requested' and rv.decided_at >= p.s and rv.decided_at < p.e
      and (p.usr is null or rv.submitted_by = p.usr)), 'n'
  from p
  union all
  select 11, 'tasks_in_review', null, (
    select count(*) from t where t.status = 'review' and (p.usr is null or t.assignee_id = p.usr)), 'n'
  from p
  union all
  select 12, 'tasks_overdue', null, (
    select count(*) from t
    where t.status <> 'done' and t.due_date < p.today and t.due_date <= p_to and (p.usr is null or t.assignee_id = p.usr)), 'n'
  from p
  union all
  select 13, 'cycle_days_avg', null, round(avg(extract(epoch from (d.completed_at - d.started_at))) / 86400, 1), 'd'
  from done d where d.started_at is not null having count(*) > 0
  union all
  select 14, 'hours_estimated', null, (
    select round(coalesce(sum(d.estimate_minutes), 0)::numeric / 60, 1) from done d where d.estimate_minutes is not null), 'h'
  union all
  select 15, 'hours_logged', null, (select round(coalesce(sum(l.sec), 0) / 3600, 1) from logged l), 'h'
  union all
  select 16, 'share_on_estimate', null, round(100 * (
    select coalesce(sum(l.sec), 0) / 60 from logged l join done d on d.id = l.task_id where d.estimate_minutes is not null
  ) / sum(d.estimate_minutes)), '%'
  from done d where d.estimate_minutes is not null having sum(d.estimate_minutes) > 0
  union all
  select 17, 'members', null, public.report_members(p_team, p_scope, p_subject)::numeric, 'n'
  where p_scope in ('project', 'team')
)
select coalesce(jsonb_agg(jsonb_build_object(
         'id', 'F' || x.n, 'metric', x.metric, 'dimension', x.dimension, 'value', x.value, 'unit', x.unit) order by x.n), '[]'::jsonb)
from (select fr.*, row_number() over (order by fr.ord, fr.dimension nulls first) as n from fr) x
$$;

-- Comprueba D-1 (y members >= 2 en proyecto y equipo) y devuelve la zona horaria de quien genera.
create function public.report_assert_can_generate(p_team uuid, p_scope text, p_subject uuid) returns text
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
      raise exception 'No permitido: el reporte de proyecto lo generan owner, admin o el lead del proyecto' using errcode = '42501';
    end if;
  elsif p_scope = 'team' then
    if p_subject <> p_team or v_role not in ('owner', 'admin') then
      raise exception 'No permitido: el reporte de equipo lo generan owner o admin' using errcode = '42501';
    end if;
  else
    raise exception 'Alcance desconocido' using errcode = '22023';
  end if;
  if p_scope in ('project', 'team') and public.report_members(p_team, p_scope, p_subject) < 2 then
    raise exception 'Hacen falta al menos 2 miembros para un reporte de grupo' using errcode = '22023';
  end if;
  return coalesce((select pr.timezone from public.profiles pr where pr.id = auth.uid()), 'America/Bogota');
end $$;

-- Hechos del reporte (D-3, D-9): { facts, facts_hash, period_from, period_to }.
create function public.get_report_facts(p_team uuid, p_scope text, p_subject uuid, p_period text) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text := public.report_assert_can_generate(p_team, p_scope, p_subject);
  v_period record;
  v_facts jsonb;
begin
  select * into v_period from public.report_period(p_period, v_tz);
  v_facts := public.report_facts(p_team, p_scope, p_subject, v_period.period_from, v_period.period_to, v_tz);
  return jsonb_build_object(
    'facts', v_facts,
    'facts_hash', encode(sha256(convert_to(v_facts::text, 'UTF8')), 'hex'),
    'period_from', v_period.period_from,
    'period_to', v_period.period_to
  );
end $$;

-- ───────────────────── Guardar el reporte ─────────────────────

-- Forma de una lista de la narrativa: objetos { text, fact_ids } con textos de 1 a 400 caracteres
-- y de 1 a 10 identificadores que existan en los hechos.
create function public.report_items_valid(p_items jsonb, p_max integer, p_ids text[]) returns boolean
language sql immutable set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
     and jsonb_array_length(p_items) <= p_max
     and coalesce((
       select bool_and(
         jsonb_typeof(i) = 'object'
         and (select array_agg(k order by k) from jsonb_object_keys(i) k) = array['fact_ids', 'text']
         and jsonb_typeof(i -> 'text') = 'string'
         and char_length(i ->> 'text') between 1 and 400
         and jsonb_typeof(i -> 'fact_ids') = 'array'
         and jsonb_array_length(i -> 'fact_ids') between 1 and 10
         and (select bool_and(jsonb_typeof(f) = 'string' and (f #>> '{}') = any (p_ids))
              from jsonb_array_elements(i -> 'fact_ids') f))
       from jsonb_array_elements(p_items) i), true)
$$;

create function public.save_report(
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

  -- D-18: personal → fin del último bloque sincronizado (sin pasar del periodo); grupo → hora de generación.
  if p_scope = 'personal' then
    select least(max(b.ended_at), (v_period.period_to + 1)::timestamp at time zone v_tz) into v_until
    from public.activity_blocks b
    where b.team_id = p_team and b.user_id = auth.uid()
      and b.started_at < (v_period.period_to + 1)::timestamp at time zone v_tz;
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

-- D-6: la Edge Function marca como validado en el servidor un reporte gratis recién guardado.
create function public.mark_trial_report(p_id uuid) returns boolean
language sql security definer set search_path = ''
as $$
  with marked as (
    update public.report_runs set validated_by = 'server'
    where id = p_id and mode = 'free' and validated_by = 'client' and created_at > now() - interval '5 minutes'
    returning 1
  )
  select exists (select 1 from marked)
$$;

-- ───────────────────── Cupo del modo Gratis ─────────────────────

-- Límites iniciales (docs/IA.md §4). Un solo sitio para cambiarlos.
create function public.ai_trial_limits() returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object('per_user', 5, 'per_team', 20, 'global', 200, 'cooldown_seconds', 30)
$$;

create function public.ai_trial_day() returns date
language sql stable set search_path = ''
as $$
  select (now() at time zone 'America/Bogota')::date
$$;

create function public.consume_ai_trial(p_team uuid) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_limits jsonb := public.ai_trial_limits();
  v_day date := public.ai_trial_day();
  v_role text := public.team_role(p_team);
begin
  if v_role is null or v_role = 'viewer' then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  -- ponytail: un candado global para todo el cupo; basta con 200 reportes al día.
  perform pg_advisory_xact_lock(hashtext('ai_trial'));

  if exists (select 1 from public.ai_usage u where u.user_id = auth.uid()
             and u.last_at > now() - make_interval(secs => (v_limits ->> 'cooldown_seconds')::integer)) then
    return jsonb_build_object('ok', false, 'reason', 'cooldown');
  end if;
  if (select coalesce(sum(u.count), 0) from public.ai_usage u where u.day = v_day and u.user_id = auth.uid())
     >= (v_limits ->> 'per_user')::integer then
    return jsonb_build_object('ok', false, 'reason', 'user_limit');
  end if;
  if (select coalesce(sum(u.count), 0) from public.ai_usage u where u.day = v_day and u.team_id = p_team)
     >= (v_limits ->> 'per_team')::integer then
    return jsonb_build_object('ok', false, 'reason', 'team_limit');
  end if;
  if (select coalesce(sum(u.count), 0) from public.ai_usage u where u.day = v_day)
     >= (v_limits ->> 'global')::integer then
    return jsonb_build_object('ok', false, 'reason', 'global_limit');
  end if;

  insert into public.ai_usage (day, team_id, user_id, count, last_at)
  values (v_day, p_team, auth.uid(), 1, now())
  on conflict (day, team_id, user_id) do update set count = public.ai_usage.count + 1, last_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- Solo la Edge Function (service_role), cuando falla la red o el proveedor (D-10).
create function public.refund_ai_trial(p_team uuid, p_user uuid) returns void
language sql security definer set search_path = ''
as $$
  update public.ai_usage set count = count - 1
  where day = public.ai_trial_day() and team_id = p_team and user_id = p_user and count > 0
$$;

-- ───────────────────── Etiquetar la IA (IA-04) ─────────────────────

-- Solo para bloques ya sincronizados; los que aún no se suben llevan la etiqueta consigo (D-13).
create function public.set_block_ai_usage(p_id uuid, p_usage text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_usage is not null and p_usage not in ('code', 'writing', 'analysis', 'other') then
    raise exception 'Tipo de uso de IA desconocido' using errcode = '22023';
  end if;
  update public.activity_blocks set ai_usage_type = p_usage
  where id = p_id and user_id = auth.uid() and category = 'ai';
  if not found then
    raise exception 'No permitido: solo puedes etiquetar tus propios bloques de IA' using errcode = '42501';
  end if;
end $$;

-- ───────────── Salida del equipo: también los reportes personales (D-17) ─────────────

create or replace function public.purge_own_data_on_leave() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.teams t where t.id = old.team_id) then
    delete from public.activity_blocks where team_id = old.team_id and user_id = old.user_id;
    delete from public.app_closures where team_id = old.team_id and user_id = old.user_id;
    delete from public.report_runs where team_id = old.team_id and scope = 'personal' and subject_id = old.user_id;
    -- time_entries se conservan: los totales las muestran como «Exmiembro».
  end if;
  return old;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

-- Corrección de F2 y F3: Supabase concede EXECUTE a authenticated en toda función nueva de public, y las
-- migraciones anteriores solo lo revocaban a public y anon. Estas funciones internas no comprueban permisos
-- (o escriben, como write_audit y log_task_event): solo las llaman otras funciones SECURITY DEFINER.
-- Las que usan las políticas RLS (has_team_role, can_see_project, task_project…) siguen concedidas.
revoke execute on function
  public.write_audit(uuid, text, uuid, jsonb),
  public.log_task_event(uuid, text, jsonb),
  public.ensure_project_member(uuid, uuid),
  public.assert_assignee(uuid, uuid),
  public.assert_delivery(uuid, jsonb, text[], uuid[]),
  public.assert_project_open(uuid),
  public.caller_email(),
  public.can_manage_project(uuid),
  public.can_manage_task_people(uuid),
  public.evidence_task(text),
  public.is_task_worker(uuid),
  public.new_invitation_code(),
  public.project_role(uuid),
  public.review_template(uuid),
  public.task_delivery_fields(uuid),
  public.task_seconds(uuid),
  public.task_tree_seconds(uuid)
from public, anon, authenticated;

revoke execute on function
  public.report_period(text, text),
  public.report_ai_tool(text),
  public.report_members(uuid, text, uuid),
  public.report_facts(uuid, text, uuid, date, date, text),
  public.report_assert_can_generate(uuid, text, uuid),
  public.get_report_facts(uuid, text, uuid, text),
  public.report_items_valid(jsonb, integer, text[]),
  public.save_report(uuid, text, uuid, text, text, jsonb, text, text, text, text),
  public.mark_trial_report(uuid),
  public.ai_trial_limits(),
  public.ai_trial_day(),
  public.consume_ai_trial(uuid),
  public.refund_ai_trial(uuid, uuid),
  public.set_block_ai_usage(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.get_report_facts(uuid, text, uuid, text),
  public.save_report(uuid, text, uuid, text, text, jsonb, text, text, text, text),
  public.consume_ai_trial(uuid),
  public.set_block_ai_usage(uuid, text)
to authenticated;
grant execute on function
  public.mark_trial_report(uuid),
  public.refund_ai_trial(uuid, uuid)
to service_role;
