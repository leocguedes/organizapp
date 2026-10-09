
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
      and hm.role in ('owner','admin')
  );
$$;

create or replace function private.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.locations l
    where l.id = target_location_id
      and (
        l.user_id = (select auth.uid())
        or (l.household_id is not null and private.is_household_member(l.household_id))
      )
  );
$$;

create or replace function private.can_access_subdivision(target_subdivision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1 from public.subdivisions s
    where s.id = target_subdivision_id
      and private.can_access_location(s.location_id)
  );
$$;

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$ select private.is_household_member(target_household_id); $$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$ select private.is_household_admin(target_household_id); $$;

create or replace function public.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$ select private.can_access_location(target_location_id); $$;

create or replace function public.can_access_subdivision(target_subdivision_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$ select private.can_access_subdivision(target_subdivision_id); $$;

alter function public.preserve_row_creator() security invoker;

revoke all on function private.is_household_member(uuid) from public, anon;
revoke all on function private.is_household_admin(uuid) from public, anon;
revoke all on function private.can_access_location(uuid) from public, anon;
revoke all on function private.can_access_subdivision(uuid) from public, anon;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function private.is_household_admin(uuid) to authenticated;
grant execute on function private.can_access_location(uuid) to authenticated;
grant execute on function private.can_access_subdivision(uuid) to authenticated;

revoke all on function public.preserve_row_creator() from public, anon, authenticated;
