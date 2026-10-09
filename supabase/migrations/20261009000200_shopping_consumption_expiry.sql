
alter table public.foods
  add column if not exists expires_on date;

create index if not exists foods_expires_on_idx
  on public.foods(expires_on) where expires_on is not null;

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity numeric not null default 1 check (quantity >= 0),
  unit text not null default 'unidades',
  category text,
  is_purchased boolean not null default false,
  source text not null default 'manual' check (source in ('manual','low_stock','recurring','recipe','meal_plan')),
  linked_food_id uuid references public.foods(id) on delete set null,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  purchased_by uuid references auth.users(id) on delete set null,
  purchased_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_household_open_idx
  on public.shopping_items(household_id, is_purchased, created_at desc);

create table if not exists public.recurring_shopping_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 120),
  quantity numeric not null default 1 check (quantity > 0),
  unit text not null default 'unidades',
  frequency_days integer not null default 7 check (frequency_days between 1 and 365),
  next_due_on date not null default current_date,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recurring_shopping_due_idx
  on public.recurring_shopping_items(household_id, next_due_on) where is_active;

create table if not exists public.food_consumption_rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  food_id uuid not null unique references public.foods(id) on delete cascade,
  amount numeric not null check (amount > 0),
  period_days integer not null check (period_days between 1 and 365),
  next_suggestion_on date not null default current_date,
  low_stock_threshold numeric check (low_stock_threshold is null or low_stock_threshold >= 0),
  restock_quantity numeric check (restock_quantity is null or restock_quantity > 0),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade,
  last_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists food_consumption_rules_household_due_idx
  on public.food_consumption_rules(household_id, next_suggestion_on) where is_active;

create table if not exists public.food_consumption_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  food_id uuid references public.foods(id) on delete set null,
  food_name text not null,
  event_type text not null check (event_type in ('confirmed','adjusted','skipped')),
  scheduled_for date not null,
  amount numeric not null default 0 check (amount >= 0),
  previous_quantity numeric check (previous_quantity is null or previous_quantity >= 0),
  new_quantity numeric check (new_quantity is null or new_quantity >= 0),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists food_consumption_events_household_date_idx
  on public.food_consumption_events(household_id, scheduled_for desc);

alter table public.shopping_items enable row level security;
alter table public.recurring_shopping_items enable row level security;
alter table public.food_consumption_rules enable row level security;
alter table public.food_consumption_events enable row level security;

drop policy if exists "Household members can read shopping items" on public.shopping_items;
drop policy if exists "Household members can insert shopping items" on public.shopping_items;
drop policy if exists "Household members can update shopping items" on public.shopping_items;
drop policy if exists "Household members can delete shopping items" on public.shopping_items;

create policy "Household members can read shopping items"
on public.shopping_items for select to authenticated
using (
  public.is_household_member(household_id)
  and (linked_food_id is null or public.can_access_subdivision(
    (select f.subdivision_id from public.foods f where f.id = linked_food_id)
  ))
);

create policy "Household members can insert shopping items"
on public.shopping_items for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = (select auth.uid())
  and (linked_food_id is null or public.can_access_subdivision(
    (select f.subdivision_id from public.foods f where f.id = linked_food_id)
  ))
);

create policy "Household members can update shopping items"
on public.shopping_items for update to authenticated
using (
  public.is_household_member(household_id)
  and (linked_food_id is null or public.can_access_subdivision(
    (select f.subdivision_id from public.foods f where f.id = linked_food_id)
  ))
)
with check (
  public.is_household_member(household_id)
  and (linked_food_id is null or public.can_access_subdivision(
    (select f.subdivision_id from public.foods f where f.id = linked_food_id)
  ))
);

create policy "Household members can delete shopping items"
on public.shopping_items for delete to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Household members can read recurring shopping items" on public.recurring_shopping_items;
drop policy if exists "Household members can insert recurring shopping items" on public.recurring_shopping_items;
drop policy if exists "Household members can update recurring shopping items" on public.recurring_shopping_items;
drop policy if exists "Household members can delete recurring shopping items" on public.recurring_shopping_items;

create policy "Household members can read recurring shopping items"
on public.recurring_shopping_items for select to authenticated
using (public.is_household_member(household_id));

create policy "Household members can insert recurring shopping items"
on public.recurring_shopping_items for insert to authenticated
with check (public.is_household_member(household_id) and created_by = (select auth.uid()));

create policy "Household members can update recurring shopping items"
on public.recurring_shopping_items for update to authenticated
using (public.is_household_member(household_id))
with check (public.is_household_member(household_id));

create policy "Household members can delete recurring shopping items"
on public.recurring_shopping_items for delete to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Household members can read consumption rules" on public.food_consumption_rules;
drop policy if exists "Household members can insert consumption rules" on public.food_consumption_rules;
drop policy if exists "Household members can update consumption rules" on public.food_consumption_rules;
drop policy if exists "Household members can delete consumption rules" on public.food_consumption_rules;

create policy "Household members can read consumption rules"
on public.food_consumption_rules for select to authenticated
using (public.is_household_member(household_id) and public.can_access_subdivision(
  (select f.subdivision_id from public.foods f where f.id = food_id)
));

create policy "Household members can insert consumption rules"
on public.food_consumption_rules for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = (select auth.uid())
  and public.can_access_subdivision((select f.subdivision_id from public.foods f where f.id = food_id))
);

create policy "Household members can update consumption rules"
on public.food_consumption_rules for update to authenticated
using (public.is_household_member(household_id) and public.can_access_subdivision(
  (select f.subdivision_id from public.foods f where f.id = food_id)
))
with check (
  public.is_household_member(household_id)
  and public.can_access_subdivision((select f.subdivision_id from public.foods f where f.id = food_id))
);

create policy "Household members can delete consumption rules"
on public.food_consumption_rules for delete to authenticated
using (public.is_household_member(household_id));

drop policy if exists "Household members can read consumption events" on public.food_consumption_events;
drop policy if exists "Household members can insert consumption events" on public.food_consumption_events;

create policy "Household members can read consumption events"
on public.food_consumption_events for select to authenticated
using (public.is_household_member(household_id));

create policy "Household members can insert consumption events"
on public.food_consumption_events for insert to authenticated
with check (
  public.is_household_member(household_id)
  and created_by = (select auth.uid())
  and (food_id is null or public.can_access_subdivision(
    (select f.subdivision_id from public.foods f where f.id = food_id)
  ))
);

revoke all on public.shopping_items from anon;
revoke all on public.recurring_shopping_items from anon;
revoke all on public.food_consumption_rules from anon;
revoke all on public.food_consumption_events from anon;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.recurring_shopping_items to authenticated;
grant select, insert, update, delete on public.food_consumption_rules to authenticated;
grant select, insert on public.food_consumption_events to authenticated;
