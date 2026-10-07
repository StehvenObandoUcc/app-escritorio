-- Código de invitación (ADR-0008): el registro ya no exige verificar el correo, así que la prueba de
-- que la invitación es para ti es el código que te comparte quien invita.
-- Pruebas: supabase/tests/invitaciones_y_auditoria.test.ts

-- ───────────────────────── Columnas ─────────────────────────

alter table public.invitations
  add column code text,
  add column failed_attempts integer not null default 0 check (failed_attempts between 0 and 5);

-- Las invitaciones creadas antes de este cambio no tienen código: se anulan y se piden de nuevo.
update public.invitations set status = 'revoked', responded_at = now() where status = 'pending';

alter table public.invitations
  add constraint invitations_code_format check (code is null or code ~ '^[A-Z2-9]{4}-[A-Z2-9]{4}$');

-- ───────────────────────── Funciones de apoyo ─────────────────────────

-- Código aleatorio XXXX-XXXX con 32 símbolos sin I, O, 0 ni 1 (no se confunden al dictarlo).
-- gen_random_uuid() es criptográficamente aleatorio; 256 es múltiplo de 32: cada símbolo es equiprobable.
create function public.new_invitation_code() returns text
language plpgsql volatile set search_path = ''
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_hex text := replace(gen_random_uuid()::text, '-', '');
  v_code text := '';
begin
  for i in 0..7 loop
    v_code := v_code || substr(v_alphabet, (('x' || substr(v_hex, i * 2 + 1, 2))::bit(8)::int % 32) + 1, 1);
  end loop;
  return substr(v_code, 1, 4) || '-' || substr(v_code, 5, 4);
end $$;

-- Correo de quien llama (verificado o no).
create function public.caller_email() returns text
language sql stable security definer set search_path = ''
as $$
  select lower(u.email) from auth.users u where u.id = auth.uid()
$$;

-- ───────────────────────── Invitar ─────────────────────────

drop function public.invite_member(uuid, text, text);

create function public.invite_member(p_team uuid, p_email text, p_role text)
returns table (id uuid, code text)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  -- coalesce: para alguien de fuera team_role es null y una comparación con null no deniega.
  v_caller text := coalesce(public.team_role(p_team), '');
  v_email text := lower(trim(p_email));
  v_id uuid;
  v_code text := public.new_invitation_code();
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

  update public.invitations i set status = 'expired'
  where i.team_id = p_team and i.email = v_email and i.status = 'pending' and i.expires_at <= now();
  if exists (
    select 1 from public.invitations i
    where i.team_id = p_team and i.email = v_email and i.status = 'pending'
  ) then
    raise exception 'Ya hay una invitación pendiente para ese correo' using errcode = 'P0001';
  end if;

  insert into public.invitations (team_id, email, role, invited_by, code)
  values (p_team, v_email, p_role, auth.uid(), v_code)
  returning invitations.id into v_id;
  perform public.write_audit(p_team, 'invitation_sent', null, jsonb_build_object('email', v_email, 'role', p_role));
  return query select v_id, v_code;
end $$;

-- ───────────────────────── Ver mis invitaciones ─────────────────────────

-- Ya no exige correo verificado: aceptar exige el código (ADR-0008).
create or replace function public.my_invitations()
returns table (id uuid, team_id uuid, team_name text, role text, invited_by_name text, expires_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select i.id, i.team_id, t.name, i.role, p.display_name, i.expires_at
  from public.invitations i
  join public.teams t on t.id = i.team_id
  left join public.profiles p on p.id = i.invited_by
  where i.email = public.caller_email() and i.status = 'pending' and i.expires_at > now()
  order by i.created_at
$$;

-- ───────────────────────── Aceptar ─────────────────────────

drop function public.accept_invitation(uuid, text);

-- Devuelve el equipo al aceptar, o null si el código no coincide. No lanza error con un código
-- incorrecto para que el contador de intentos quede guardado (un error desharía el cambio).
create function public.accept_invitation(p_id uuid, p_code text, p_consent_version text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
  v_email text := public.caller_email();
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión' using errcode = '42501';
  end if;
  if p_consent_version is null or char_length(trim(p_consent_version)) not between 1 and 20 then
    raise exception 'Debes aceptar el consentimiento' using errcode = '22023';
  end if;
  select * into v_inv from public.invitations where id = p_id for update;
  if v_inv.id is null or v_inv.email is distinct from v_email then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación ya no está pendiente' using errcode = 'P0001';
  end if;
  if v_inv.expires_at <= now() then
    update public.invitations set status = 'expired' where id = p_id;
    return null;
  end if;
  if v_inv.code is distinct from upper(trim(coalesce(p_code, ''))) then
    update public.invitations
    set failed_attempts = failed_attempts + 1,
        status = case when failed_attempts + 1 >= 5 then 'revoked' else status end,
        responded_at = case when failed_attempts + 1 >= 5 then now() else responded_at end
    where id = p_id;
    return null;
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

-- ───────────────────────── Rechazar ─────────────────────────

create or replace function public.decline_invitation(p_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_inv public.invitations%rowtype;
begin
  select * into v_inv from public.invitations where id = p_id for update;
  if v_inv.id is null or v_inv.email is distinct from public.caller_email() then
    raise exception 'No permitido' using errcode = '42501';
  end if;
  if v_inv.status <> 'pending' then
    raise exception 'La invitación ya no está pendiente' using errcode = 'P0001';
  end if;
  update public.invitations set status = 'declined', responded_at = now() where id = p_id;
  perform public.write_audit(v_inv.team_id, 'invitation_declined', auth.uid(), jsonb_build_object('role', v_inv.role));
end $$;

drop function public.verified_email();

-- ───────────────────────── Permisos de funciones ─────────────────────────

revoke execute on function
  public.new_invitation_code(),
  public.caller_email(),
  public.invite_member(uuid, text, text),
  public.accept_invitation(uuid, text, text)
from public, anon;

grant execute on function
  public.invite_member(uuid, text, text),
  public.accept_invitation(uuid, text, text)
to authenticated;
