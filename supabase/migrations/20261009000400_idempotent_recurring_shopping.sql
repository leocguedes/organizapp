
alter table public.shopping_items
  add column if not exists recurring_rule_id uuid references public.recurring_shopping_items(id) on delete set null;
alter table public.shopping_items
  add column if not exists recurring_occurrence date;

create unique index if not exists shopping_items_recurring_occurrence_unique
  on public.shopping_items(recurring_rule_id, recurring_occurrence)
  where recurring_rule_id is not null and recurring_occurrence is not null;

create or replace function public.materialize_due_recurring_shopping_items(target_household_id uuid)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_rule record;
  v_next_due date;
  v_inserted integer := 0;
  v_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if not private.is_household_member(target_household_id) then
    raise exception 'Household membership required';
  end if;

  for v_rule in
    select r.id, r.name, r.quantity, r.unit, r.frequency_days, r.next_due_on
    from public.recurring_shopping_items r
    where r.household_id = target_household_id
      and r.is_active = true
      and r.next_due_on <= current_date
    order by r.next_due_on
    for update
  loop
    insert into public.shopping_items(
      household_id, name, quantity, unit, is_purchased, source,
      recurring_rule_id, recurring_occurrence, created_by
    )
    values(
      target_household_id, v_rule.name, v_rule.quantity, v_rule.unit, false, 'recurring',
      v_rule.id, v_rule.next_due_on, v_user_id
    )
    on conflict (recurring_rule_id, recurring_occurrence)
      where recurring_rule_id is not null and recurring_occurrence is not null
      do nothing;

    get diagnostics v_count = row_count;
    v_inserted := v_inserted + v_count;

    v_next_due := v_rule.next_due_on;
    while v_next_due <= current_date loop
      v_next_due := v_next_due + make_interval(days => v_rule.frequency_days);
    end loop;

    update public.recurring_shopping_items
    set next_due_on = v_next_due,
        updated_at = now()
    where id = v_rule.id;
  end loop;

  return v_inserted;
end;
$$;

revoke all on function public.materialize_due_recurring_shopping_items(uuid) from public, anon;
grant execute on function public.materialize_due_recurring_shopping_items(uuid) to authenticated;
