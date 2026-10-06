-- Invitaciones, auditoría, consentimiento, cierres de Pulso y regla de salida (F2)
-- Spec: docs/specs/F2-cuentas-equipos-sync.md · Reglas: docs/ROLES.md filas 8, 9, 13 y 26
-- Pruebas: supabase/tests/invitaciones_y_auditoria.test.ts
--
-- Decisiones de esta migración:
--   · Invitaciones sin correos (ADR-0004): solo se aceptan con el correo verificado de quien inicia sesión.
--   · Nadie escribe audit_log ni invitations directamente: solo las funciones de abajo.
--   · Sin consentimiento no se sube actividad, tiempo ni cierres (PS-02).
--   · A-3: al salir de un equipo (por cuenta propia o expulsado) se borran sus activity_blocks y
--     app_closures de ese equipo; sus time_entries se conservan y se muestran como «Exmiembro».
--   · A-1: la jornada vive en teams.settings.workday; los cierres de Pulso dentro de ella, en app_closures.

-- ───────────────────────── Jornada por defecto ─────────────────────────

alter table public.teams alter column settings
  set default '{"workday": {"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}}'::jsonb;

update public.teams
set settings = settings || '{"workday": {"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}}'::jsonb
where not settings ? 'workday';

-- ───────────────────────── Tablas ─────────────────────────

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null check (
    char_length(email) between 3 and 254 and email = lower(email) and position('@' in email) > 1
  ),
  role text not null check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'revoked', 'expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  responded_at timestamptz,
  created_at timestamptz not null default now()
);
-- Una sola invitación pendiente por correo y equipo.
create unique index invitations_one_pending_idx on public.invitations (team_id, email) where status = 'pending';
create index invitations_email_idx on public.invitations (email) where status = 'pending';

create table public.audit_log (
  id bigint generated always as identity primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in (
    'team_created', 'role_changed', 'member_removed', 'member_left', 'consent_given',
    'invitation_sent', 'invitation_revoked', 'invitation_accepted', 'invitation_declined'
  )),
  target_user uuid references auth.users (id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_team_created_idx on public.audit_log (team_id, created_at desc);

-- Huecos en el registro porque Pulso estuvo cerrado dentro de la jornada (A-1).
-- Los detecta Rust al volver a abrir y los sube la sincronización (id generado en el cliente).
create table public.app_closures (
  id uuid primary key,
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  closed_at timestamptz not null,
  reopened_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint app_closures_order check (reopened_at > closed_at)
);
create index app_closures_team_closed_idx on public.app_closures (team_id, closed_at);

-- ─────────────────────── Funciones de apoyo ───────────────────────

-- ¿Quien llama dio su consentimiento en este equipo?
create function public.has_consent(p_team uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.team_members m
    where m.team_id = p_team and m.user_id = auth.uid() and m.consent_at is not null
  )
$$;

-- Correo de quien llama, solo si está verificado (null en otro caso).
create function public.verified_email() returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null
$$;

create function public.write_audit(p_team uuid, p_action text, p_target uuid, p_details jsonb)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.audit_log (team_id, actor_id, action, target_user, details)
  values (p_team, auth.uid(), p_action, p_target, coalesce(p_details, '{}'::jsonb))
$$;

-- Un cierre no está en el futuro (5 min de margen por relojes desajustados).
create function public.validate_closure() returns trigger
language plpgsql set search_path = ''
as $$
begin
  if new.reopened_at > now() + interval '5 minutes' then
    raise exception 'No se puede registrar un cierre en el futuro' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger app_closures_validate before insert or update on public.app_closures
  for each row execute function public.validate_closure();
create trigger app_closures_identity before update on public.app_closures
  for each row execute function public.forbid_identity_change();

-- ───────────────────────── RLS ─────────────────────────

alter table public.invitations enable row level security;
alter table public.audit_log enable row level security;
alter table public.app_closures enable row level security;

-- Invitaciones: owner y admin ven las de su equipo. La persona invitada las ve con my_invitations().
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_team_role(team_id, array['owner', 'admin']));

-- Auditoría: solo owner y admin (fila 9).
create policy audit_log_select on public.audit_log for select to authenticated
  using (public.has_team_role(team_id, array['owner', 'admin']));

-- Cierres: cada quien sube los suyos con consentimiento; owner y admin ven los del equipo (fila 26).
create policy app_closures_select on public.app_closures for select to authenticated
  using (
    (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
    or public.has_team_role(team_id, array['owner', 'admin'])
  );
create policy app_closures_own_insert on public.app_closures for insert to authenticated
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );
create policy app_closures_own_update on public.app_closures for update to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );

-- Consentimiento obligatorio para subir actividad y tiempo (PS-02).
drop policy activity_blocks_own_insert on public.activity_blocks;
drop policy activity_blocks_own_update on public.activity_blocks;
drop policy time_entries_own_insert on public.time_entries;
drop policy time_entries_own_update on public.time_entries;

create policy activity_blocks_own_insert on public.activity_blocks for insert to authenticated
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );
create policy activity_blocks_own_update on public.activity_blocks for update to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );
create policy time_entries_own_insert on public.time_entries for insert to authenticated
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );
create policy time_entries_own_update on public.time_entries for update to authenticated
  using (user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member']))
  with check (
    user_id = auth.uid() and public.has_team_role(team_id, array['owner', 'admin', 'member'])
    and public.has_consent(team_id)
  );

revoke all on public.invitations, public.audit_log, public.app_closures from anon, authenticated;
grant select on public.invitations to authenticated;
grant select on public.audit_log to authenticated;
grant select, insert, update on public.app_closures to authenticated;

-- ───────────────────── Consentimiento ─────────────────────

create function public.give_consent(p_team uuid, p_version text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if p_version is null or char_length(trim(p_version)) not between 1 and 20 then
    raise exception 'Versión de consentimiento inválida' using errcode = '22023';
  end if;
  update public.team_members
  set consent_version = trim(p_version), consent_at = now()
  where team_id = p_team and user_id = auth.uid();
  if not found then
    raise exception 'No perteneces a este equipo' using errcode = '42501';
  end if;
  perform public.write_audit(p_team, 'consent_given', auth.uid(), jsonb_build_object('version', trim(p_version)));
end $$;

-- ───────────────────── Invitaciones (fila 8) ─────────────────────

create function public.invite_member(p_team uuid, p_email text, p_role text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  -- coalesce: para alguien de fuera team_role es null y una comparación con null no deniega.
  v_caller text := coalesce(public.team_role(p_team), '');
  v_email text := lower(trim(p_email));
  v_id uuid;
begin
  if p_role not in ('owner', 'admin', 'member', 'viewer') then
    raise exception 'Rol desconocido: %', p_role using errcode = '22023';
  end if;
  if not (v_caller = 'owner' or (v_caller = 'admin' and p_role in ('member', 'viewer'))) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.team_members m join auth.users u on u.id = m.user_id
    where m.team_id = p_team and lower(u.email) = v_email
  ) then
    raise exception 'Esa persona ya pertenece al equipo' using errcode = 'P0001';
  end if;

  -- Una invitación vencida deja de bloquear una nueva.
  update public.invitations set status = 'expired'
  where team_id = p_team and email = v_email and status = 'pending' and expires_at <= now();
  if exists (
    select 1 from public.invitations
    where team_id = p_team and email = v_email and status = 'pending'
  ) then
    raise exception 'Ya hay una invitación pendiente para ese correo' using errcode = 'P0001';
  end if;

  insert into public.invitations (team_id, email, role, invited_by)
  values (p_team, v_email, p_role, auth.uid())
  returning id into v_id;
  perform public.write_audit(p_team, 'invitation_sent', null, jsonb_build_object('email', v_email, 'role', p_role));
  return v_id;
end $$;

create function public.revoke_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_caller text;
begin
  select * into v_inv from public.invitations where id = p_id for update;
  v_caller := coalesce(public.team_role(v_inv.team_id), '');
  if v_inv.id is null
     or not (v_caller = 'owner' or (v_caller = 'admin' and v_inv.role in ('member', 'viewer'))) then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación ya no está pendiente' using errcode = 'P0001';
  end if;
  update public.invitations set status = 'revoked', responded_at = now() where id = p_id;
  perform public.write_audit(v_inv.team_id, 'invitation_revoked', null,
    jsonb_build_object('email', v_inv.email, 'role', v_inv.role));
end $$;

-- Invitaciones pendientes y vigentes para el correo verificado de quien llama.
create function public.my_invitations()
returns table (id uuid, team_id uuid, team_name text, role text, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.team_id, t.name, i.role, p.display_name, i.expires_at
  from public.invitations i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.verified_email() and i.status = 'pending' and i.expires_at > now()
  order by i.created_at
$$;

create function public.accept_invitation(p_id uuid, p_consent_version text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_email text := public.verified_email();
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if v_email is null then
    raise exception 'Verifica tu correo antes de aceptar una invitación' using errcode = '42501';
  end if;
  if p_consent_version is null or char_length(trim(p_consent_version)) not between 1 and 20 then
    raise exception 'Debes aceptar el consentimiento' using errcode = '22023';
  end if;
  select * into v_inv from public.invitations where id = p_id for update;
  if v_inv.id is null or v_inv.email <> v_email then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = p_id;
    raise exception 'La invitación venció: pide una nueva' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.team_members where team_id = v_inv.team_id and user_id = auth.uid()) then
    raise exception 'Ya perteneces a este equipo' using errcode = 'P0001';
  end if;

  insert into public.team_members (team_id, user_id, role, consent_version, consent_at)
  values (v_inv.team_id, auth.uid(), v_inv.role, trim(p_consent_version), now());
  update public.invitations set status = 'accepted', responded_at = now() where id = p_id;
  perform public.write_audit(v_inv.team_id, 'invitation_accepted', auth.uid(),
    jsonb_build_object('role', v_inv.role, 'consent_version', trim(p_consent_version)));
  return v_inv.team_id;
end $$;

create function public.decline_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations where id = p_id for update;
  if v_inv.id is null or v_inv.email is distinct from public.verified_email() then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación ya no está pendiente' using errcode = 'P0001';
  end if;
  update public.invitations set status = 'declined', responded_at = now() where id = p_id;
  perform public.write_audit(v_inv.team_id, 'invitation_declined', auth.uid(), jsonb_build_object('role', v_inv.role));
end $$;

-- ─────────── Operaciones de F0, ahora con auditoría ───────────

create or replace function public.create_team(p_name text) returns uuid
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
  perform public.write_audit(v_team, 'team_created', v_user, jsonb_build_object('name', trim(p_name)));
  return v_team;
end $$;

create or replace function public.set_member_role(p_team uuid, p_user uuid, p_role text) returns void
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
  if v_target <> p_role then
    perform public.write_audit(p_team, 'role_changed', p_user, jsonb_build_object('from', v_target, 'to', p_role));
  end if;
end $$;

create or replace function public.remove_member(p_team uuid, p_user uuid) returns void
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
  perform public.write_audit(p_team, 'member_removed', p_user, jsonb_build_object('role', v_target));
end $$;

create or replace function public.leave_team(p_team uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_role text;
begin
  delete from public.team_members where team_id = p_team and user_id = auth.uid()
  returning role into v_role;
  if not found then
    raise exception 'No perteneces a este equipo' using errcode = '42501';
  end if;
  perform public.write_audit(p_team, 'member_left', auth.uid(), jsonb_build_object('role', v_role));
end $$;

-- ─────────── Regla de salida (A-3): misma para salir y para ser expulsado ───────────

-- Reemplaza la versión de 20261005000001, que solo actuaba al salir por cuenta propia
-- y borraba también el tiempo. Si se borra el equipo entero, las llaves en cascada se encargan.
create or replace function public.purge_own_data_on_leave() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.teams t where t.id = old.team_id) then
    delete from public.activity_blocks where team_id = old.team_id and user_id = old.user_id;
    delete from public.app_closures where team_id = old.team_id and user_id = old.user_id;
    -- time_entries se conservan: los totales las muestran como «Exmiembro».
  end if;
  return old;
end $$;

-- ─────────── Tiempo por miembro, con exmiembros agrupados (fila 13) ───────────

-- Owner y admin ven el tiempo registrado (temporizador y manual) por miembro.
-- Quien ya no pertenece al equipo aparece con user_id null: la interfaz lo muestra como «Exmiembro».
create function public.team_time_summary(p_team uuid, p_from timestamptz, p_to timestamptz)
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
           sum(extract(epoch from (least(coalesce(e.ended_at, now()), p_to) - greatest(e.started_at, p_from))))::bigint,
           count(*)::bigint
    from public.time_entries e
    left join public.team_members m on m.team_id = e.team_id and m.user_id = e.user_id
    where e.team_id = p_team and e.deleted_at is null
      and e.started_at < p_to and coalesce(e.ended_at, now()) > p_from
    group by m.user_id;
end $$;

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.has_consent(uuid),
  public.verified_email(),
  public.write_audit(uuid, text, uuid, jsonb),
  public.validate_closure(),
  public.give_consent(uuid, text),
  public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid, text),
  public.decline_invitation(uuid),
  public.team_time_summary(uuid, timestamptz, timestamptz)
from public, anon;

grant execute on function
  public.has_consent(uuid),
  public.give_consent(uuid, text),
  public.invite_member(uuid, text, text),
  public.revoke_invitation(uuid),
  public.my_invitations(),
  public.accept_invitation(uuid, text),
  public.decline_invitation(uuid),
  public.team_time_summary(uuid, timestamptz, timestamptz)
to authenticated;
