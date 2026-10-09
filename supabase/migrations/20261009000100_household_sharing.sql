
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Minha casa' check (char_length(trim(name)) between 1 and 80),
  created_by uuid not null references auth.users(id) on delete cascade,
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists households_one_personal_per_owner
  on public.households(created_by) where is_personal;

create table if not exists public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_id_idx
  on public.household_members(user_id);

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  max_uses integer not null default 5 check (max_uses between 1 and 50),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  created_at timestamptz not null default now()
);

create index if not exists household_invites_household_id_idx
  on public.household_invites(household_id);

alter table public.locations
  add column if not exists household_id uuid references public.households(id) on delete set null;

create index if not exists locations_household_id_idx
  on public.locations(household_id);

create or replace function public.is_household_member(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_household_admin(target_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = (select auth.uid())
      and hm.role in ('owner','admin')
  );
$$;

create or replace function public.can_access_location(target_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.locations l
    where l.id = target_location_id
      and (
        l.user_id = (select auth.uid())
        or (l.household_id is not null and public.is_household_member(l.household_id))
      )
  );
$$;

create or replace function public.can_access_subdivision(target_subdivision_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.subdivisions s
    where s.id = target_subdivision_id
      and public.can_access_location(s.location_id)
  );
$$;

create or replace function public.preserve_row_creator()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is distinct from (select auth.uid()) then
      raise exception 'user_id must match the authenticated user';
    end if;
  else
    new.user_id := old.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists locations_preserve_row_creator on public.locations;
create trigger locations_preserve_row_creator
before insert or update on public.locations
for each row execute function public.preserve_row_creator();

drop trigger if exists subdivisions_preserve_row_creator on public.subdivisions;
create trigger subdivisions_preserve_row_creator
before insert or update on public.subdivisions
for each row execute function public.preserve_row_creator();

drop trigger if exists foods_preserve_row_creator on public.foods;
create trigger foods_preserve_row_creator
before insert or update on public.foods
for each row execute function public.preserve_row_creator();

create or replace function public.ensure_personal_household()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_household_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  insert into public.households (name, created_by, is_personal)
  values ('Minha casa', v_user_id, true)
  on conflict (created_by) where is_personal
  do update set created_by = excluded.created_by
  returning id into v_household_id;

  insert into public.household_members (household_id, user_id, role)
  values (v_household_id, v_user_id, 'owner')
  on conflict (household_id, user_id) do nothing;

  update public.locations
  set household_id = v_household_id
  where user_id = v_user_id and household_id is null;

  return v_household_id;
end;
$$;

create or replace function public.create_household_invite(
  target_household_id uuid,
  valid_for_days integer default 7,
  allowed_uses integer default 5
)
returns table(invite_code text, invite_expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_code text;
  v_expires_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_household_admin(target_household_id) then
    raise exception 'Only household administrators can create invites';
  end if;
  if valid_for_days < 1 or valid_for_days > 30 then
    raise exception 'Invite validity must be between 1 and 30 days';
  end if;
  if allowed_uses < 1 or allowed_uses > 50 then
    raise exception 'Invite capacity must be between 1 and 50';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_expires_at := now() + make_interval(days => valid_for_days);

  insert into public.household_invites(household_id, code, created_by, expires_at, max_uses)
  values(target_household_id, v_code, (select auth.uid()), v_expires_at, allowed_uses);

  return query select v_code, v_expires_at;
end;
$$;

create or replace function public.join_household_by_code(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_invite public.household_invites%rowtype;
  v_existing boolean;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  select * into v_invite
  from public.household_invites i
  where i.code = upper(trim(invite_code))
  for update;

  if not found or v_invite.expires_at <= now() or v_invite.uses >= v_invite.max_uses then
    raise exception 'Invite code is invalid, expired, or has reached its limit';
  end if;

  select exists(
    select 1 from public.household_members hm
    where hm.household_id = v_invite.household_id and hm.user_id = v_user_id
  ) into v_existing;

  if not v_existing then
    insert into public.household_members(household_id, user_id, role)
    values(v_invite.household_id, v_user_id, 'member');
    update public.household_invites set uses = uses + 1 where id = v_invite.id;
  end if;

  return v_invite.household_id;
end;
$$;

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.locations enable row level security;
alter table public.subdivisions enable row level security;
alter table public.foods enable row level security;

drop policy if exists "Users can manage their locations" on public.locations;
drop policy if exists "Household members can read locations" on public.locations;
drop policy if exists "Household members can insert locations" on public.locations;
drop policy if exists "Household members can update locations" on public.locations;
drop policy if exists "Household members can delete locations" on public.locations;

create policy "Users and household members can read locations"
on public.locations for select to authenticated
using (user_id = (select auth.uid()) or (household_id is not null and public.is_household_member(household_id)));

create policy "Users and household members can insert locations"
on public.locations for insert to authenticated
with check (
  user_id = (select auth.uid())
  and (household_id is null or public.is_household_member(household_id))
);

create policy "Users and household members can update locations"
on public.locations for update to authenticated
using (user_id = (select auth.uid()) or (household_id is not null and public.is_household_member(household_id)))
with check (user_id = (select auth.uid()) or (household_id is not null and public.is_household_member(household_id)));

create policy "Users and household members can delete locations"
on public.locations for delete to authenticated
using (user_id = (select auth.uid()) or (household_id is not null and public.is_household_member(household_id)));

drop policy if exists "Users can manage their subdivisions" on public.subdivisions;
drop policy if exists "Household members can read subdivisions" on public.subdivisions;
drop policy if exists "Household members can insert subdivisions" on public.subdivisions;
drop policy if exists "Household members can update subdivisions" on public.subdivisions;
drop policy if exists "Household members can delete subdivisions" on public.subdivisions;

create policy "Authorized household members can read subdivisions"
on public.subdivisions for select to authenticated
using (public.can_access_location(location_id));

create policy "Authorized household members can insert subdivisions"
on public.subdivisions for insert to authenticated
with check (user_id = (select auth.uid()) and public.can_access_location(location_id));

create policy "Authorized household members can update subdivisions"
on public.subdivisions for update to authenticated
using (public.can_access_location(location_id))
with check (public.can_access_location(location_id));

create policy "Authorized household members can delete subdivisions"
on public.subdivisions for delete to authenticated
using (public.can_access_location(location_id));

drop policy if exists "Users can manage their foods" on public.foods;
drop policy if exists "Household members can read foods" on public.foods;
drop policy if exists "Household members can insert foods" on public.foods;
drop policy if exists "Household members can update foods" on public.foods;
drop policy if exists "Household members can delete foods" on public.foods;

create policy "Authorized household members can read foods"
on public.foods for select to authenticated
using (public.can_access_subdivision(subdivision_id));

create policy "Authorized household members can insert foods"
on public.foods for insert to authenticated
with check (user_id = (select auth.uid()) and public.can_access_subdivision(subdivision_id));

create policy "Authorized household members can update foods"
on public.foods for update to authenticated
using (public.can_access_subdivision(subdivision_id))
with check (public.can_access_subdivision(subdivision_id));

create policy "Authorized household members can delete foods"
on public.foods for delete to authenticated
using (public.can_access_subdivision(subdivision_id));

drop policy if exists "Household members can read households" on public.households;
create policy "Household members can read households"
on public.households for select to authenticated
using (public.is_household_member(id));

drop policy if exists "Household admins can update households" on public.households;
create policy "Household admins can update households"
on public.households for update to authenticated
using (public.is_household_admin(id))
with check (public.is_household_admin(id));

drop policy if exists "Household members can read memberships" on public.household_members;
create policy "Household members can read memberships"
on public.household_members for select to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Household admins can read invites" on public.household_invites;
create policy "Household admins can read invites"
on public.household_invites for select to authenticated
using (public.is_household_admin(household_id));

revoke all on function public.is_household_member(uuid) from public, anon;
revoke all on function public.is_household_admin(uuid) from public, anon;
revoke all on function public.can_access_location(uuid) from public, anon;
revoke all on function public.can_access_subdivision(uuid) from public, anon;
revoke all on function public.preserve_row_creator() from public, anon;
revoke all on function public.ensure_personal_household() from public, anon;
revoke all on function public.create_household_invite(uuid, integer, integer) from public, anon;
revoke all on function public.join_household_by_code(text) from public, anon;

grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.is_household_admin(uuid) to authenticated;
grant execute on function public.can_access_location(uuid) to authenticated;
grant execute on function public.can_access_subdivision(uuid) to authenticated;
grant execute on function public.ensure_personal_household() to authenticated;
grant execute on function public.create_household_invite(uuid, integer, integer) to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
