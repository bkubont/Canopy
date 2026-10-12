-- Forward upgrade of the existing foundation; never reset a populated database.
begin;
alter table public.memberships drop constraint memberships_role_check;
update public.memberships set role='worker' where role='employee';
alter table public.memberships add constraint memberships_role_check
  check(role in ('owner','admin','crew_lead','worker'));
alter table public.organizations add column timezone text not null default 'UTC';
create function public.validate_timezone() returns trigger language plpgsql set search_path='' as $$
begin
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=new.timezone) then
    raise exception 'Unknown organization timezone' using errcode='22023';
  end if;
  return new;
end $$;
create trigger validate_timezone before insert or update on public.organizations
  for each row execute function public.validate_timezone();
grant update(name,timezone) on public.organizations to authenticated;
create policy org_manage on public.organizations for update to authenticated
  using(public.is_org_admin(id)) with check(public.is_org_admin(id));

create table public.user_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check(length(display_name)<=160),
  created_at timestamptz not null default now()
);
insert into public.user_profiles(user_id) select id from auth.users;
create function public.create_user_profile() returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_profiles(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger canopy_user_profile after insert on auth.users
  for each row execute function public.create_user_profile();
create function public.can_read_profile(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid()=target or exists(
    select 1 from public.memberships me join public.memberships them
      on me.organization_id=them.organization_id
    where me.user_id=auth.uid() and them.user_id=target and me.active and them.active)
$$;
alter table public.user_profiles enable row level security;
create policy profile_read on public.user_profiles for select to authenticated using(public.can_read_profile(user_id));
create policy profile_update on public.user_profiles for update to authenticated
  using(user_id=auth.uid()) with check(user_id=auth.uid());
revoke all on public.user_profiles from anon,authenticated;
grant select,update(display_name) on public.user_profiles to authenticated;
grant select,insert,update,delete on public.user_profiles to service_role;

create table public.crews(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check(length(trim(name)) between 1 and 160),
  unique(organization_id,id),unique(organization_id,name)
);
create table public.crew_memberships(
  organization_id uuid not null,
  crew_id uuid not null,
  worker_id uuid not null,
  primary key(organization_id,crew_id,worker_id),
  foreign key(organization_id,crew_id) references public.crews(organization_id,id),
  foreign key(organization_id,worker_id) references public.workers(organization_id,id)
);
create table public.project_crew_assignments(
  organization_id uuid not null,
  project_id uuid not null,
  crew_id uuid not null,
  primary key(organization_id,project_id,crew_id),
  foreign key(organization_id,project_id) references public.projects(organization_id,id),
  foreign key(organization_id,crew_id) references public.crews(organization_id,id)
);
create table public.visit_crew_assignments(
  organization_id uuid not null,
  visit_id uuid not null,
  crew_id uuid not null,
  primary key(organization_id,visit_id,crew_id),
  foreign key(organization_id,visit_id) references public.visits(organization_id,id),
  foreign key(organization_id,crew_id) references public.crews(organization_id,id)
);
create table public.task_crew_assignments(
  organization_id uuid not null,
  task_id uuid not null,
  crew_id uuid not null,
  primary key(organization_id,task_id,crew_id),
  foreign key(organization_id,task_id) references public.tasks(organization_id,id),
  foreign key(organization_id,crew_id) references public.crews(organization_id,id)
);
create index crew_membership_worker_idx on public.crew_memberships(organization_id,worker_id);
create index project_crew_idx on public.project_crew_assignments(organization_id,crew_id);
create index visit_crew_idx on public.visit_crew_assignments(organization_id,crew_id);
create index task_crew_idx on public.task_crew_assignments(organization_id,crew_id);
create function public.belongs_to_crew(org uuid,crew uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.organization_role(org) in ('worker','crew_lead') and exists(
    select 1 from public.crew_memberships cm join public.workers w
    on w.organization_id=cm.organization_id and w.id=cm.worker_id
    where cm.organization_id=org and cm.crew_id=crew and w.user_id=auth.uid())
$$;
create or replace function public.can_read_project(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_org_admin(org) or (
    public.organization_role(org) in ('crew_lead','worker') and (
      exists(select 1 from public.workers w where w.organization_id=org and w.user_id=auth.uid() and (
        exists(select 1 from public.project_assignments a where a.organization_id=org and a.project_id=project and a.worker_id=w.id)
        or exists(select 1 from public.phase_assignments a join public.job_phases p on p.organization_id=a.organization_id and p.id=a.phase_id
          where a.organization_id=org and p.project_id=project and a.worker_id=w.id)
        or exists(select 1 from public.visit_assignments a join public.visits v on v.organization_id=a.organization_id and v.id=a.visit_id
          where a.organization_id=org and v.project_id=project and a.worker_id=w.id)))
      or exists(select 1 from public.project_crew_assignments a where a.organization_id=org and a.project_id=project and public.belongs_to_crew(org,a.crew_id))
      or exists(select 1 from public.visit_crew_assignments a join public.visits v on v.organization_id=a.organization_id and v.id=a.visit_id
        where a.organization_id=org and v.project_id=project and public.belongs_to_crew(org,a.crew_id))
    ))
$$;
create function public.can_lead_project(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select public.is_org_admin(org) or (public.organization_role(org)='crew_lead' and public.can_read_project(org,project))
$$;
drop policy client_read on public.clients;
create policy client_read on public.clients for select to authenticated using(public.is_org_admin(organization_id));
drop policy worker_read on public.workers;
create policy worker_read on public.workers for select to authenticated using(
  public.is_org_admin(organization_id) or (user_id=auth.uid() and public.organization_role(organization_id) in ('worker','crew_lead')));
-- Purpose-built projection; no raw client contact details/private notes for field users.
create function public.field_jobs(org uuid)
returns table(id uuid,organization_id uuid,title text,address text,client_name text)
language sql stable security definer set search_path='' as $$
  select p.id,p.organization_id,p.title,p.address,c.name from public.projects p
    join public.clients c on c.organization_id=p.organization_id and c.id=p.client_id
    where p.organization_id=org and public.can_read_project(org,p.id)
$$;
do $$ declare tbl text; begin
  foreach tbl in array array['crews','crew_memberships','project_crew_assignments','visit_crew_assignments','task_crew_assignments'] loop
    execute format('alter table public.%I enable row level security',tbl);
    execute format('create policy admin_manage on public.%I for all to authenticated using(public.is_org_admin(organization_id)) with check(public.is_org_admin(organization_id))',tbl);
    execute format('revoke all on public.%I from anon,authenticated',tbl);
    execute format('grant select,insert,update,delete on public.%I to authenticated,service_role',tbl);
  end loop;
end $$;
create policy field_read on public.crews for select to authenticated using(public.belongs_to_crew(organization_id,id));
create policy field_read on public.crew_memberships for select to authenticated using(public.belongs_to_crew(organization_id,crew_id));
create policy field_read on public.project_crew_assignments for select to authenticated using(public.can_read_project(organization_id,project_id));
create policy field_read on public.visit_crew_assignments for select to authenticated using(
  exists(select 1 from public.visits v where v.organization_id=visit_crew_assignments.organization_id and v.id=visit_id and public.can_read_project(v.organization_id,v.project_id)));
create policy field_read on public.task_crew_assignments for select to authenticated using(
  exists(select 1 from public.tasks t where t.organization_id=task_crew_assignments.organization_id and t.id=task_id and public.can_read_project(t.organization_id,t.project_id)));
create trigger lock_scope before update on public.crews for each row execute function public.lock_record_scope();
revoke all on function public.validate_timezone(),public.create_user_profile(),public.can_read_profile(uuid),
  public.belongs_to_crew(uuid,uuid),public.can_lead_project(uuid,uuid),public.field_jobs(uuid) from public,anon,authenticated;
grant execute on function public.can_read_profile(uuid),public.belongs_to_crew(uuid,uuid),
  public.can_lead_project(uuid,uuid),public.field_jobs(uuid) to authenticated;
commit;
