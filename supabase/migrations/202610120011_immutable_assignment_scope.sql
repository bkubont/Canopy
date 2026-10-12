begin;
create function public.lock_assignment_scope() returns trigger
language plpgsql set search_path='' as $$
declare before_row jsonb:=to_jsonb(old);after_row jsonb:=to_jsonb(new);field text;begin
  foreach field in array array['organization_id','project_id','phase_id','visit_id','task_id'] loop
    if before_row->field is distinct from after_row->field then
      raise exception 'Assignment organization and parent are immutable; remove and add an assignment explicitly' using errcode='23514';
    end if;
  end loop;
  if tg_table_name='crew_memberships' and old.crew_id is distinct from new.crew_id then
    raise exception 'Crew membership parent is immutable' using errcode='23514';
  end if;
  return new;
end $$;
do $$ declare tbl text;begin
  foreach tbl in array array['project_assignments','phase_assignments','visit_assignments','task_assignments',
    'crew_memberships','project_crew_assignments','visit_crew_assignments','task_crew_assignments'] loop
    execute format('create trigger immutable_assignment_scope before update on public.%I for each row execute function public.lock_assignment_scope()',tbl);
  end loop;
end $$;
revoke all on function public.lock_assignment_scope() from public,anon,authenticated;
commit;
