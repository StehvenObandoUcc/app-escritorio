-- save_report lanzaba 40001 (serialization_failure) cuando los datos cambiaban: PostgREST reintenta solo ese código,
-- y como los datos siguen cambiados, el reintento falla igual (bucle hasta el «upstream request timeout»).
-- 'PT409' es un SQLSTATE que PostgREST no reintenta y responde como HTTP 409. Único cambio respecto a 20261013000001.
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
    raise exception 'Los datos cambiaron mientras se generaba el reporte: vuelve a generarlo' using errcode = 'PT409';
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
