-- Actividad, tiempo y reglas de clasificación (adelanto de F2, necesario para la sincronización)
-- Tablas: activity_blocks, time_entries, classification_rules
-- Reglas: docs/ROLES.md filas 10–14 y 23. Cada regla tiene prueba en supabase/tests/actividad_y_tiempo.test.ts
--
-- Decisiones de esta migración:
--   · activity_blocks NO tiene columna de título: los títulos de ventana nunca salen del equipo (D-05, R8).
--   · La sincronización (ADR-0001) sube con upsert por `id`; el id lo genera el cliente.
--     Por eso hay políticas de INSERT/UPDATE (solo filas propias) además de las validaciones del servidor.
--   · Nadie edita el tiempo de otra persona, ni siquiera el owner (fila 11).
--   · Owner y admin NO leen los bloques en bruto de otros: ven totales mediante team_activity_summary (fila 13).
--   · Pendiente en F2: exigir consentimiento (team_members.consent_at) antes de subir actividad (PS-02).
--   · Pendiente en F3: llave foránea de time_entries.task_id hacia tasks; "P" (lead de proyecto) en filas 13 y 14.

-- ───────────────────────── Tablas ─────────────────────────

create table public.activity_blocks (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  app_name text not null check (char_length(app_name) between 1 and 200),
  category text not null check (category in ('productive', 'neutral', 'distraction', 'ai', 'break', 'idle', 'paused')),
  ai_tool text check (ai_tool is null or char_length(ai_tool) between 1 and 80),
  ai_usage_type text check (ai_usage_type is null or ai_usage_type in ('code', 'writing', 'analysis', 'other')),
  created_at timestamptz not null default now(),
  constraint activity_blocks_ai_tool_only_for_ai check (ai_tool is null or category = 'ai')
);
create index activity_blocks_team_user_started_idx on public.activity_blocks (team_id, user_id, started_at);

create table public.time_entries (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null,
  -- null mientras el temporizador sigue en marcha
  ended_at timestamptz,
  -- Referencia a tasks (F3); la llave foránea se agrega en esa migración.
  task_id uuid,
  source text not null check (source in ('timer', 'manual')),
  updated_at timestamptz not null default now(),
  -- borrado lógico: permite propagar la eliminación hecha sin conexión
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index time_entries_team_user_started_idx on public.time_entries (team_id, user_id, started_at);

create table public.classification_rules (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  -- gana la primera coincidencia por prioridad ascendente
  priority integer not null check (priority between 0 and 10000),
  match_type text not null check (match_type in ('process', 'title')),
  -- texto en minúsculas; coincide si el nombre de proceso o el título lo contiene
  pattern text not null check (char_length(pattern) between 1 and 120 and pattern = lower(pattern)),
  category text not null check (category in ('productive', 'neutral', 'distraction', 'ai')),
  ai_tool text check (ai_tool is null or char_length(ai_tool) between 1 and 80),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  constraint classification_rules_ai_tool_only_for_ai check (ai_tool is null or category = 'ai')
);
create index classification_rules_team_priority_idx on public.classification_rules (team_id, priority);

-- ─────────────────── Validación en el servidor ───────────────────

-- Fin posterior al inicio, duración máxima de 24 h y nada en el futuro (5 min de margen por relojes
-- desajustados). Se aplica a actividad y a tiempo.
create function public.validate_time_range() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.started_at > now() + interval '5 minutes' then
    raise exception 'No se puede registrar tiempo en el futuro' using errcode = '23514';
  end if;
  if new.ended_at is not null then
    if new.ended_at <= new.started_at then
      raise exception 'El fin debe ser posterior al inicio' using errcode = '23514';
    end if;
    if new.ended_at - new.started_at > interval '24 hours' then
      raise exception 'Una entrada no puede durar más de 24 horas' using errcode = '23514';
    end if;
    if new.ended_at > now() + interval '5 minutes' then
      raise exception 'No se puede registrar tiempo en el futuro' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger activity_blocks_validate before insert or update on public.activity_blocks
  for each row execute function public.validate_time_range();
create trigger time_entries_validate before insert or update on public.time_entries
  for each row execute function public.validate_time_range();

-- Una fila no cambia de dueño, de equipo ni de id (el upsert reenvía esas columnas).
create function public.forbid_identity_change() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.id <> old.id or new.user_id <> old.user_id or new.team_id <> old.team_id then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger activity_blocks_identity before update on public.activity_blocks
  for each row execute function public.forbid_identity_change();
create trigger time_entries_identity before update on public.time_entries
  for each row execute function public.forbid_identity_change();

-- ───────────────────────── RLS ─────────────────────────

alter table public.activity_blocks enable row level security;
alter table public.time_entries enable row level security;
alter table public.classification_rules enable row level security;

-- Actividad y tiempo: solo el dueño de la fila, y solo si hoy es owner, admin o member (el viewer no registra).
create policy activity_blocks_own_select on public.activity_blocks for select to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy activity_blocks_own_insert on public.activity_blocks for insert to authenticated
  with check (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy activity_blocks_own_update on public.activity_blocks for update to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
  with check (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy activity_blocks_own_delete on public.activity_blocks for delete to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));

create policy time_entries_own_select on public.time_entries for select to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy time_entries_own_insert on public.time_entries for insert to authenticated
  with check (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy time_entries_own_update on public.time_entries for update to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
  with check (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']));
-- Sin política de DELETE en time_entries: se borra con deleted_at.

-- Reglas: las leen quienes registran actividad; solo owner y admin las editan (fila 23).
create policy classification_rules_select on public.classification_rules for select to authenticated
  using (public.has_team_role(team_id, array['owner', 'admin', 'member']));
create policy classification_rules_insert on public.classification_rules for insert to authenticated
  with check (created_by = auth.uid() and public.has_team_role(team_id, array['owner', 'admin']));
create policy classification_rules_update on public.classification_rules for update to authenticated
  using (public.has_team_role(team_id, array['owner', 'admin']))
  with check (public.has_team_role(team_id, array['owner', 'admin']));
create policy classification_rules_delete on public.classification_rules for delete to authenticated
  using (public.has_team_role(team_id, array['owner', 'admin']));

revoke all on public.activity_blocks, public.time_entries, public.classification_rules from anon, authenticated;
grant select, insert, update, delete on public.activity_blocks to authenticated;
grant select, insert, update on public.time_entries to authenticated;
grant select, insert, update, delete on public.classification_rules to authenticated;

-- ─────────────── Totales por miembro (filas 13 y 14) ───────────────

-- Owner y admin ven cuánto tiempo pasó cada miembro actual en cada categoría y app,
-- sin acceso a los bloques en bruto. Los segundos se recortan al rango pedido.
create function public.team_activity_summary(p_team uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, category text, app_name text, ai_tool text, seconds bigint, blocks bigint)
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
    select b.user_id, b.category, b.app_name, b.ai_tool,
           sum(extract(epoch from (least(b.ended_at, p_to) - greatest(b.started_at, p_from))))::bigint,
           count(*)::bigint
    from public.activity_blocks b
    join public.team_members m on m.team_id = b.team_id and m.user_id = b.user_id
    where b.team_id = p_team and b.started_at < p_to and b.ended_at > p_from
    group by b.user_id, b.category, b.app_name, b.ai_tool;
end $$;

-- ───────────── Al salir de un equipo se borra la actividad propia ─────────────

-- ARQUITECTURA §9: "al salir de un equipo, se borra su actividad en ese equipo".
-- Solo cuando la persona sale por su cuenta (leave_team): auth.uid() es quien sale.
-- Cuando se borra el equipo entero, las llaves foráneas en cascada ya se encargan.
create function public.purge_own_data_on_leave() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.user_id = auth.uid() then
    delete from public.activity_blocks where team_id = old.team_id and user_id = old.user_id;
    delete from public.time_entries where team_id = old.team_id and user_id = old.user_id;
  end if;
  return old;
end $$;

create trigger team_members_purge_on_leave after delete on public.team_members
  for each row execute function public.purge_own_data_on_leave();

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.validate_time_range(),
  public.forbid_identity_change(),
  public.team_activity_summary(uuid, timestamptz, timestamptz),
  public.purge_own_data_on_leave()
from public, anon;

grant execute on function public.team_activity_summary(uuid, timestamptz, timestamptz) to authenticated;
