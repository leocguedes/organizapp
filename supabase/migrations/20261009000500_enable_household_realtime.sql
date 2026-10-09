
do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime publication is not present; skipping realtime table registration';
    return;
  end if;

  foreach v_table in array array[
    'locations',
    'subdivisions',
    'foods',
    'shopping_items',
    'recurring_shopping_items',
    'food_consumption_rules',
    'food_consumption_events'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
