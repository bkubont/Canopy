begin;
alter table public.projects add column schedule_status text not null default 'ready'
  check(schedule_status in ('ready','scheduled','postponed','cancelled'));
alter table public.projects add column work_progress text
  check(work_progress in ('estimate','prep','tree','cleanup','complete'));
-- Convert without creating fictional edits, bumping versions, or rewriting legacy history.
alter table public.projects disable trigger version_project;
update public.projects p set schedule_status=case when stage='scheduled' or
  exists(select 1 from public.visits v where v.organization_id=p.organization_id and v.project_id=p.id)
  then 'scheduled' else 'ready' end,
  work_progress=case when stage in ('ready','scheduled') then null else stage end;
alter table public.projects enable trigger version_project;
alter table public.events drop constraint events_kind_check;
alter table public.events add constraint events_kind_check check(kind in ('created','stage','phase','work','activity'));
alter table public.events add column action text not null default 'legacy'
  check(action in ('legacy','project_created','progress_changed','schedule_status_changed','work_recorded',
    'phase_completed','phase_reopened','assignment_changed','visit_scheduled','visit_rescheduled',
    'visit_deleted','task_completed','task_reopened','note_added','note_updated','note_deleted'));
alter table public.events add column payload jsonb not null default '{}'::jsonb;
alter table public.events add column is_actual_work boolean generated always as
  (action in ('work_recorded','phase_completed') or (action='legacy' and kind='work')) stored;
alter table public.notes add column author_id uuid;
alter table public.tasks add column version bigint not null default 1;
alter table public.job_phases add column version bigint not null default 1;
create trigger phase_version before update on public.job_phases for each row execute function public.version_project();
create trigger task_version before update on public.tasks for each row execute function public.version_project();
create function public.business_day(org uuid) returns date language sql stable security definer set search_path='' as $$
  select (now() at time zone timezone)::date from public.organizations where id=org
$$;
create function public.validate_work_date(org uuid,work_date date) returns void
language plpgsql stable security definer set search_path='' as $$
begin
  if work_date is null or work_date<date '2000-01-01' or work_date>public.business_day(org)+1 then
    raise exception 'Invalid business date' using errcode='22023';
  end if;
end $$;
create or replace function public.audit_project() returns trigger
language plpgsql security definer set search_path='' as $$
declare d date; begin
  d:=coalesce(nullif(current_setting('canopy.event_date',true),'')::date,public.business_day(new.organization_id));
  if tg_op='INSERT' then
    insert into public.events(organization_id,project_id,actor_id,kind,work_date,message,action)
    values(new.organization_id,new.id,auth.uid(),'created',d,'Project created','project_created');
  else
    if new.stage is distinct from old.stage then
      raise exception 'Legacy stage is retained for migration evidence; use progress/scheduling operations' using errcode='23514';
    end if;
    if new.work_progress is distinct from old.work_progress then
      insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message,action,payload)
      values(new.organization_id,new.id,auth.uid(),case when new.work_progress<>'complete' then new.work_progress end,
        'stage',d,'Work progress changed','progress_changed',jsonb_build_object('from',old.work_progress,'to',new.work_progress));
    end if;
    if new.schedule_status is distinct from old.schedule_status then
      insert into public.events(organization_id,project_id,actor_id,kind,work_date,message,action,payload)
      values(new.organization_id,new.id,auth.uid(),'activity',d,'Scheduling status changed','schedule_status_changed',
        jsonb_build_object('from',old.schedule_status,'to',new.schedule_status));
    end if;
  end if;
  return new;
end $$;
create or replace function public.audit_phase() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if (tg_op='INSERT' and new.complete) or (tg_op='UPDATE' and old.complete is distinct from new.complete) then
    insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message,action)
    values(new.organization_id,new.project_id,auth.uid(),new.phase,'phase',
      coalesce(nullif(current_setting('canopy.event_date',true),'')::date,public.business_day(new.organization_id)),
      new.phase||case when new.complete then ' completed' else ' reopened' end,
      case when new.complete then 'phase_completed' else 'phase_reopened' end);
  end if;
  return new;
end $$;
create function public.change_project_progress(target_project uuid,new_progress text,event_date date,expected_version bigint)
returns public.projects language plpgsql security definer set search_path='' as $$
declare p public.projects; begin
  select * into p from public.projects where id=target_project for update;
  if not found or not public.can_lead_project(p.organization_id,p.id) then
    raise exception 'Project access denied' using errcode='42501';
  end if;
  if expected_version is null or p.version<>expected_version then raise exception 'Refresh changed project' using errcode='40001'; end if;
  perform public.validate_work_date(p.organization_id,event_date);
  if new_progress is not null and new_progress not in ('estimate','prep','tree','cleanup','complete') then
    raise exception 'Invalid progress' using errcode='22023'; end if;
  if new_progress is not distinct from p.work_progress then return p; end if;
  perform set_config('canopy.event_date',event_date::text,true);
  update public.projects set work_progress=new_progress where id=p.id returning * into p;
  perform set_config('canopy.event_date','',true);
  return p;
end $$;
create function public.change_project_schedule(target_project uuid,new_status text,event_date date,expected_version bigint)
returns public.projects language plpgsql security definer set search_path='' as $$
declare p public.projects; begin
  select * into p from public.projects where id=target_project for update;
  if not found or not public.is_org_admin(p.organization_id) then raise exception 'Project access denied' using errcode='42501'; end if;
  if expected_version is null or p.version<>expected_version then raise exception 'Refresh changed project' using errcode='40001'; end if;
  perform public.validate_work_date(p.organization_id,event_date);
  if new_status is null or new_status not in ('ready','scheduled','postponed','cancelled') then raise exception 'Invalid schedule status' using errcode='22023'; end if;
  if new_status=p.schedule_status then return p; end if;
  perform set_config('canopy.event_date',event_date::text,true);
  update public.projects set schedule_status=new_status where id=p.id returning * into p;
  perform set_config('canopy.event_date','',true);
  return p;
end $$;
-- Backward-compatible endpoint, with explicit separation and unchanged legacy evidence.
create or replace function public.change_project_stage(target_project uuid,new_stage text,event_date date,expected_version bigint)
returns public.projects language plpgsql security definer set search_path='' as $$
begin
  if new_stage in ('ready','scheduled') then
    return public.change_project_schedule(target_project,new_stage,event_date,expected_version);
  elsif new_stage in ('estimate','prep','tree','cleanup','complete') then
    return public.change_project_progress(target_project,new_stage,event_date,expected_version);
  end if;
  raise exception 'Invalid stage' using errcode='22023';
end $$;
create or replace function public.record_phase_work(target_project uuid,work_phase text,event_date date,description text)
returns uuid language plpgsql security definer set search_path='' as $$
declare org uuid; eid uuid; begin
  select organization_id into org from public.projects where id=target_project;
  if org is null or not public.can_read_project(org,target_project) then raise exception 'Project access denied' using errcode='42501'; end if;
  perform public.validate_work_date(org,event_date);
  if work_phase is null or work_phase not in ('estimate','prep','tree','cleanup') or
    description is null or length(trim(description)) not between 1 and 10000 then
    raise exception 'Invalid work activity' using errcode='22023'; end if;
  insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message,action)
  values(org,target_project,auth.uid(),work_phase,'work',event_date,description,'work_recorded') returning id into eid;
  return eid;
end $$;
create function public.set_phase_completion(target_phase uuid,completed boolean,event_date date,expected_version bigint)
returns public.job_phases language plpgsql security definer set search_path='' as $$
declare p public.job_phases; begin
  select * into p from public.job_phases where id=target_phase for update;
  if not found or not public.can_lead_project(p.organization_id,p.project_id) then raise exception 'Phase access denied' using errcode='42501'; end if;
  if expected_version is null or p.version<>expected_version then raise exception 'Refresh changed phase' using errcode='40001'; end if;
  perform public.validate_work_date(p.organization_id,event_date);
  if completed is null then raise exception 'Completion required' using errcode='22023'; end if;
  if completed=p.complete then return p; end if;
  perform set_config('canopy.event_date',event_date::text,true);
  update public.job_phases set complete=completed where id=p.id returning * into p;
  perform set_config('canopy.event_date','',true);
  return p;
end $$;
create function public.complete_task(target_task uuid,completed boolean,event_date date,expected_version bigint)
returns public.tasks language plpgsql security definer set search_path='' as $$
declare t public.tasks; permitted boolean; begin
  select * into t from public.tasks where id=target_task for update;
  if not found or not public.can_read_project(t.organization_id,t.project_id) then raise exception 'Task access denied' using errcode='42501'; end if;
  permitted:=public.can_lead_project(t.organization_id,t.project_id) or exists(
    select 1 from public.task_assignments a join public.workers w on w.organization_id=a.organization_id and w.id=a.worker_id
    where a.organization_id=t.organization_id and a.task_id=t.id and w.user_id=auth.uid()) or exists(
    select 1 from public.task_crew_assignments a where a.organization_id=t.organization_id and a.task_id=t.id and public.belongs_to_crew(t.organization_id,a.crew_id));
  if not coalesce(permitted,false) then raise exception 'Task assignment required' using errcode='42501'; end if;
  if expected_version is null or t.version<>expected_version then raise exception 'Refresh changed task' using errcode='40001'; end if;
  perform public.validate_work_date(t.organization_id,event_date);
  if completed is null then raise exception 'Completion required' using errcode='22023'; end if;
  if completed=t.done then return t; end if;
  update public.tasks set done=completed where id=t.id returning * into t;
  insert into public.events(organization_id,project_id,actor_id,kind,work_date,message,action,payload)
  values(t.organization_id,t.project_id,auth.uid(),'activity',event_date,'Task completion changed',
    case when completed then 'task_completed' else 'task_reopened' end,jsonb_build_object('task_id',t.id));
  return t;
end $$;
create function public.add_project_note(target_project uuid,note_body text,note_phase text default null)
returns public.notes language plpgsql security definer set search_path='' as $$
declare org uuid; n public.notes; begin
  select organization_id into org from public.projects where id=target_project;
  if org is null or not public.can_read_project(org,target_project) then raise exception 'Project access denied' using errcode='42501'; end if;
  insert into public.notes(organization_id,project_id,body,phase,author_id)
  values(org,target_project,note_body,note_phase,auth.uid()) returning * into n;
  insert into public.events(organization_id,project_id,actor_id,kind,work_date,message,action,payload)
  values(org,target_project,auth.uid(),'activity',public.business_day(org),'Note added','note_added',jsonb_build_object('note_id',n.id));
  return n;
end $$;
-- No unrestricted field-user writes; author, scope, version and audit come from RPCs.
revoke insert,update,delete on public.notes from authenticated;
revoke update on public.job_phases,public.tasks from authenticated;
grant update(organization_id,project_id,phase) on public.job_phases to authenticated;
grant update(organization_id,project_id,kind,title,phase,work_date,destination,details) on public.tasks to authenticated;
-- Direct admin note corrections will be added with audited operations, not author spoofing.
revoke all on function public.business_day(uuid),public.validate_work_date(uuid,date),
  public.change_project_progress(uuid,text,date,bigint),public.change_project_schedule(uuid,text,date,bigint),
  public.set_phase_completion(uuid,boolean,date,bigint),public.complete_task(uuid,boolean,date,bigint),
  public.add_project_note(uuid,text,text) from public,anon,authenticated;
grant execute on function public.change_project_progress(uuid,text,date,bigint),public.change_project_schedule(uuid,text,date,bigint),
  public.set_phase_completion(uuid,boolean,date,bigint),public.complete_task(uuid,boolean,date,bigint),
  public.add_project_note(uuid,text,text) to authenticated;
commit;
