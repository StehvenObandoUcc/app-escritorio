-- Dominio del sitio web, sitios no permitidos y política de apps ocultas (ADR-0009)
-- Reglas: docs/ROLES.md filas 13 y 23 · Pruebas: supabase/tests/dominios_y_politicas.test.ts
--
-- Decisiones de esta migración:
--   · Solo el dominio sale del equipo (p. ej. "perplexity.ai"): nunca la ruta ni la búsqueda.
--     La restricción de formato hace imposible guardar "/", "?", "#", espacios o mayúsculas.
--   · «No permitido» marca, no bloquea: la regla clasifica el dominio como distracción.
--   · La política de apps ocultas vive en teams.settings.policies y solo la cambian owner y admin.

-- ───────────────────────── Dominio en la actividad ─────────────────────────

alter table public.activity_blocks
  add column domain text,
  add constraint activity_blocks_domain_format check (domain is null or domain ~ '^[a-z0-9.-]{1,253}$');

-- ───────────────────────── Reglas por dominio ─────────────────────────

alter table public.classification_rules drop constraint classification_rules_match_type_check;
alter table public.classification_rules
  add constraint classification_rules_match_type_check check (match_type in ('process', 'title', 'domain')),
  add column not_allowed boolean not null default false,
  add constraint classification_rules_not_allowed_is_distraction check (not not_allowed or category = 'distraction'),
  add constraint classification_rules_domain_format check (match_type <> 'domain' or pattern ~ '^[a-z0-9.-]{1,253}$');

-- ───────────────────────── Política de apps ocultas ─────────────────────────

alter table public.audit_log drop constraint audit_log_action_check;
alter table public.audit_log add constraint audit_log_action_check check (action in (
  'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
  'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined',
  'policy_changed'
));

-- Owner y admin deciden si en su equipo cada persona puede ocultar apps (fila 23).
create function public.set_team_policy(p_team uuid, p_allow_hidden_apps boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.has_team_role(p_team, array['owner', 'admin']) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if p_allow_hidden_apps is null then
    raise exception 'La política necesita un valor' using errcode = '22023';
  end if;
  update public.teams
  set settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{policies}',
                           coalesce(settings -> 'policies', '{}'::jsonb) || jsonb_build_object('allow_hidden_apps', p_allow_hidden_apps))
  where id = p_team;
  perform public.write_audit(p_team, 'policy_changed', null, jsonb_build_object('allow_hidden_apps', p_allow_hidden_apps));
end $$;

-- ───────────────────────── Tiempo por sitio y persona (fila 13) ─────────────────────────

create function public.team_domain_summary(p_team uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, domain text, category text, seconds bigint)
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
    select b.user_id, b.domain, b.category,
           sum(extract(epoch from (least(b.ended_at, p_to) - greatest(b.started_at, p_from))))::bigint
    from public.activity_blocks b
    join public.team_members m on m.team_id = b.team_id and m.user_id = b.user_id
    where b.team_id = p_team and b.domain is not null and b.started_at < p_to and b.ended_at > p_from
    group by b.user_id, b.domain, b.category;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.set_team_policy(uuid, boolean),
  public.team_domain_summary(uuid, timestamptz, timestamptz)
from public, anon;

grant execute on function
  public.set_team_policy(uuid, boolean),
  public.team_domain_summary(uuid, timestamptz, timestamptz)
to authenticated;
