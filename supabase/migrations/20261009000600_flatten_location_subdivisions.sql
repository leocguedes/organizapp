-- Collapse each location to a single implicit "Geral" bucket without losing inventory.
-- Foods are reassigned before old subdivisions are deleted so their IDs, quantities,
-- units, expiry dates, and consumption rules remain intact.
do $$
declare
  location_row record;
  canonical_subdivision_id uuid;
begin
  for location_row in
    select id, user_id from public.locations
  loop
    select s.id into canonical_subdivision_id
    from public.subdivisions s
    where s.location_id = location_row.id
    order by s.id
    limit 1;

    if canonical_subdivision_id is null then
      insert into public.subdivisions (id, user_id, location_id, name)
      values (gen_random_uuid(), location_row.user_id, location_row.id, 'Geral')
      returning id into canonical_subdivision_id;
    end if;

    update public.foods
    set subdivision_id = canonical_subdivision_id
    where subdivision_id in (
      select s.id
      from public.subdivisions s
      where s.location_id = location_row.id
        and s.id <> canonical_subdivision_id
    );

    delete from public.subdivisions
    where location_id = location_row.id
      and id <> canonical_subdivision_id;

    update public.subdivisions
    set name = 'Geral'
    where id = canonical_subdivision_id;
  end loop;
end;
$$;
