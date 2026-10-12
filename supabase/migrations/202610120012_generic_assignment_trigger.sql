begin;
-- Every assignment table shares organization scope, but not every table has crew_id.
create or replace function public.lock_assignment_scope() returns trigger
language plpgsql set search_path='' as $$
declare before_row jsonb:=to_jsonb(old);after_row jsonb:=to_jsonb(new);field text;begin
  foreach field in array array['organization_id','project_id','phase_id','visit_id','task_id'] loop
    if before_row->field is distinct from after_row->field then
      raise exception 'Assignment organization and parent are immutable; remove and add an assignment explicitly' using errcode='23514';
    end if;
  end loop;
  if tg_table_name='crew_memberships' and (before_row->'crew_id') is distinct from (after_row->'crew_id') then
    raise exception 'Crew membership parent is immutable' using errcode='23514';
  end if;
  return new;
end $$;
commit;
