-- Perfil al registrarse (F6-2)
-- Hasta ahora solo la app creaba la fila de public.profiles al entrar (ensureProfile). Si alguien se
-- registraba y nunca entraba, o la app fallaba en ese paso, quedaba sin perfil: sin nombre en el equipo.
-- Ahora la crea la base al insertarse el usuario en auth.users, con los datos del registro
-- (options.data: display_name y timezone). La app conserva ensureProfile como respaldo.

create function public.create_profile_for_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_tz text := new.raw_user_meta_data ->> 'timezone';
begin
  insert into public.profiles (id, display_name, timezone)
  values (
    new.id,
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Persona'
    ), 80),
    case when exists (select 1 from pg_catalog.pg_timezone_names z where z.name = v_tz) then v_tz else 'America/Bogota' end
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- El registro nunca falla por el perfil: la app lo crea al entrar (ensureProfile).
  return new;
end $$;

create trigger users_create_profile
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

-- Solo la llama el trigger: nadie la ejecuta por la API.
revoke execute on function public.create_profile_for_new_user() from public, anon, authenticated;

-- Usuarios que ya existían sin perfil: se les crea con la misma regla de nombre.
insert into public.profiles (id, display_name)
select u.id,
       left(coalesce(
         nullif(trim(u.raw_user_meta_data ->> 'display_name'), ''),
         nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
         'Persona'
       ), 80)
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;
