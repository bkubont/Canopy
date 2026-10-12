-- Additive foundation. Apply only to a new Supabase project after review.
begin;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  created_at timestamptz not null default now()
);
create table public.memberships (
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'admin', 'employee')),
  active boolean not null default true,
  primary key (organization_id, user_id)
);
-- Memberships are provisioned through a trusted operator, never browser inserts.
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  name text not null check (length(trim(name)) between 1 and 160),
  phone text not null default '' check (length(phone) <= 80),
  email text not null default '' check (length(email) <= 254),
  address text not null default '' check (length(address) <= 1000),
  details text not null default '' check (length(details) <= 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);
create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid,
  name text not null check (length(trim(name)) between 1 and 160),
  phone text not null default '' check (length(phone) <= 80),
  skills text not null default '' check (length(skills) <= 1000),
  unique (organization_id, id),
  unique (organization_id, user_id),
  foreign key (organization_id, user_id) references public.memberships(organization_id, user_id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  address text not null default '' check (length(address) <= 1000),
  description text not null default '' check (length(description) <= 10000),
  stage text not null default 'ready' check (stage in ('ready','scheduled','estimate','prep','tree','cleanup','complete')),
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, client_id) references public.clients(organization_id, id)
);
create table public.project_assignments (
  organization_id uuid not null,
  project_id uuid not null,
  worker_id uuid not null,
  primary key (organization_id, project_id, worker_id),
  foreign key (organization_id, project_id) references public.projects(organization_id, id),
  foreign key (organization_id, worker_id) references public.workers(organization_id, id)
);
create table public.job_phases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  phase text not null check (phase in ('estimate','prep','tree','cleanup')),
  complete boolean not null default false,
  unique (organization_id, id),
  unique (organization_id, project_id, phase),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);
create table public.phase_assignments (
  organization_id uuid not null,
  phase_id uuid not null,
  worker_id uuid not null,
  primary key (organization_id, phase_id, worker_id),
  foreign key (organization_id, phase_id) references public.job_phases(organization_id, id),
  foreign key (organization_id, worker_id) references public.workers(organization_id, id)
);
create table public.visits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  start_date date not null,
  end_date date not null,
  start_time time,
  end_time time,
  description text not null default '' check (length(description) <= 10000),
  check (end_date >= start_date and end_date - start_date < 365),
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);
create table public.visit_assignments (
  organization_id uuid not null,
  visit_id uuid not null,
  worker_id uuid not null,
  primary key (organization_id, visit_id, worker_id),
  foreign key (organization_id, visit_id) references public.visits(organization_id, id),
  foreign key (organization_id, worker_id) references public.workers(organization_id, id)
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  kind text not null check (kind in ('general','dump')),
  title text not null check (length(trim(title)) between 1 and 200),
  phase text check (phase in ('estimate','prep','tree','cleanup')),
  work_date date,
  destination text not null default '' check (length(destination) <= 1000),
  details text not null default '' check (length(details) <= 10000),
  done boolean not null default false,
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);
create table public.task_assignments (
  organization_id uuid not null,
  task_id uuid not null,
  worker_id uuid not null,
  primary key (organization_id, task_id, worker_id),
  foreign key (organization_id, task_id) references public.tasks(organization_id, id),
  foreign key (organization_id, worker_id) references public.workers(organization_id, id)
);
create table public.notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  phase text check (phase in ('estimate','prep','tree','cleanup')),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);
-- Metadata only. No storage bucket, file access, or browser writes in this stage.
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  object_path text not null unique,
  caption text not null default '' check (length(caption) <= 1000),
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  project_id uuid not null,
  actor_id uuid, -- Retained even if the Auth account is later removed.
  phase text check (phase in ('estimate','prep','tree','cleanup')),
  kind text not null check (kind in ('created','stage','phase','work')),
  work_date date not null,
  message text not null check (length(message) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, project_id) references public.projects(organization_id, id)
);

create index projects_client_idx on public.projects(organization_id, client_id);
create index memberships_user_idx on public.memberships(user_id, organization_id) where active;
create index workers_user_idx on public.workers(user_id, organization_id);
create index project_assignments_worker_idx on public.project_assignments(organization_id, worker_id);
create index phase_assignments_worker_idx on public.phase_assignments(organization_id, worker_id);
create index visit_assignments_worker_idx on public.visit_assignments(organization_id, worker_id);
create index task_assignments_worker_idx on public.task_assignments(organization_id, worker_id);
create index visits_project_idx on public.visits(organization_id, project_id, start_date, end_date);
create index events_project_date_idx on public.events(organization_id, project_id, work_date);
create index tasks_project_idx on public.tasks(organization_id, project_id);
create index notes_project_idx on public.notes(organization_id, project_id);
create index photos_project_idx on public.photos(organization_id, project_id);

-- These helpers bypass policy recursion, but only answer questions for auth.uid().
-- Fixed search_path prevents caller-controlled name resolution.
create function public.organization_role(org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.memberships
  where organization_id = org and user_id = auth.uid() and active
$$;
create function public.is_org_admin(org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(public.organization_role(org) in ('owner','admin'), false)
$$;
create function public.can_read_project(org uuid, project uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_org_admin(org) or (
    public.organization_role(org) = 'employee' and exists (
      select 1 from public.workers w
      where w.organization_id = org and w.user_id = auth.uid() and (
        exists (select 1 from public.project_assignments a
                where a.organization_id = org and a.project_id = project and a.worker_id = w.id)
        or exists (select 1 from public.phase_assignments a join public.job_phases p
                   on p.organization_id = a.organization_id and p.id = a.phase_id
                   where a.organization_id = org and p.project_id = project and a.worker_id = w.id)
        or exists (select 1 from public.visit_assignments a join public.visits v
                   on v.organization_id = a.organization_id and v.id = a.visit_id
                   where a.organization_id = org and v.project_id = project and a.worker_id = w.id)
      )
    )
  )
$$;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.workers enable row level security;
create policy org_read on public.organizations for select to authenticated
  using (public.organization_role(id) is not null);
create policy membership_read on public.memberships for select to authenticated
  using (public.is_org_admin(organization_id) or (user_id = auth.uid() and active));
create policy client_read on public.clients for select to authenticated using (
  public.is_org_admin(organization_id) or exists (
    select 1 from public.projects p where p.organization_id = clients.organization_id
    and p.client_id = clients.id and public.can_read_project(p.organization_id, p.id)
  )
);
create policy client_manage on public.clients for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));
create policy worker_read on public.workers for select to authenticated
  using (public.is_org_admin(organization_id) or
    (user_id = auth.uid() and public.organization_role(organization_id) = 'employee'));
create policy worker_manage on public.workers for all to authenticated
  using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id));

-- Every project child is authorized through its parent. No default public policies.
do $$
declare tbl text;
begin
  foreach tbl in array array['projects','project_assignments','job_phases','visits','tasks','notes','photos','events'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy scoped_read on public.%I for select to authenticated using (public.can_read_project(organization_id, %I))', tbl,
                   case when tbl = 'projects' then 'id' else 'project_id' end);
    if tbl not in ('photos','events') then
      execute format('create policy admin_manage on public.%I for all to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id))', tbl);
    end if;
  end loop;
  foreach tbl in array array['phase_assignments','visit_assignments','task_assignments'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy admin_manage on public.%I for all to authenticated using (public.is_org_admin(organization_id)) with check (public.is_org_admin(organization_id))', tbl);
  end loop;
end $$;
create policy employee_read on public.phase_assignments for select to authenticated using (
  exists (select 1 from public.job_phases p where p.organization_id = phase_assignments.organization_id
          and p.id = phase_assignments.phase_id and public.can_read_project(p.organization_id, p.project_id))
);
create policy employee_read on public.visit_assignments for select to authenticated using (
  exists (select 1 from public.visits v where v.organization_id = visit_assignments.organization_id
          and v.id = visit_assignments.visit_id and public.can_read_project(v.organization_id, v.project_id))
);
create policy employee_read on public.task_assignments for select to authenticated using (
  exists (select 1 from public.tasks t where t.organization_id = task_assignments.organization_id
          and t.id = task_assignments.task_id and public.can_read_project(t.organization_id, t.project_id))
);

-- Cross-organization reparenting is forbidden even for a multi-organization admin.
create function public.lock_record_scope() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id or new.id is distinct from old.id or
     (to_jsonb(new)->'project_id') is distinct from (to_jsonb(old)->'project_id') then
    raise exception 'Record identity, organization, and parent project are immutable' using errcode = '23514';
  end if;
  return new;
end $$;
do $$
declare tbl text;
begin
  foreach tbl in array array['clients','workers','projects','job_phases','visits','tasks','notes','photos'] loop
    execute format('create trigger lock_scope before update on public.%I for each row execute function public.lock_record_scope()', tbl);
  end loop;
end $$;

create function public.reject_event_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Events are append-only' using errcode = '23514';
end $$;
create trigger immutable_event before update or delete on public.events
for each row execute function public.reject_event_mutation();
create trigger immutable_event_truncate before truncate on public.events
for each statement execute function public.reject_event_mutation();

create function public.version_project() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.version := old.version + 1;
  return new;
end $$;
create trigger version_project before update on public.projects
for each row execute function public.version_project();

create function public.audit_project() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.events(organization_id,project_id,actor_id,kind,work_date,message)
    values (new.organization_id,new.id,auth.uid(),'created',current_date,'Project created');
  elsif old.stage is distinct from new.stage then
    insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message)
    values (new.organization_id,new.id,auth.uid(),
      case when new.stage in ('estimate','prep','tree','cleanup') then new.stage else null end,
      'stage',coalesce(nullif(current_setting('canopy.event_date',true),'')::date,current_date),
      'Moved from ' || old.stage || ' to ' || new.stage);
  end if;
  return new;
end $$;
create trigger audit_project after insert or update on public.projects
for each row execute function public.audit_project();

create function public.audit_phase() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (tg_op = 'INSERT' and new.complete) or
     (tg_op = 'UPDATE' and old.complete is distinct from new.complete) then
    insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message)
    values (new.organization_id,new.project_id,auth.uid(),new.phase,'phase',current_date,
      new.phase || case when new.complete then ' completed' else ' reopened' end);
  end if;
  return new;
end $$;
create trigger audit_phase after insert or update on public.job_phases
for each row execute function public.audit_phase();

create function public.change_project_stage(target_project uuid, new_stage text, event_date date, expected_version bigint)
returns public.projects language plpgsql security definer set search_path = '' as $$
declare result public.projects;
begin
  select * into result from public.projects where id = target_project for update;
  if not found or not public.is_org_admin(result.organization_id) then
    raise exception 'Project access denied' using errcode = '42501';
  end if;
  if expected_version is null or result.version <> expected_version then
    raise exception 'Project changed; refresh before retrying' using errcode = '40001';
  end if;
  if event_date is null or event_date < date '2000-01-01' or event_date > current_date + 1 then
    raise exception 'Invalid work date' using errcode = '22023';
  end if;
  if new_stage is null or new_stage not in ('ready','scheduled','estimate','prep','tree','cleanup','complete') then
    raise exception 'Invalid stage' using errcode = '22023';
  end if;
  if new_stage = result.stage then return result; end if;
  perform set_config('canopy.event_date',event_date::text,true);
  update public.projects set stage = new_stage where id = target_project returning * into result;
  perform set_config('canopy.event_date','',true);
  return result;
end $$;

create function public.record_phase_work(target_project uuid, work_phase text, event_date date, description text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare org uuid; event_id uuid;
begin
  select organization_id into org from public.projects where id = target_project;
  if org is null or not public.is_org_admin(org) then
    raise exception 'Project access denied' using errcode = '42501';
  end if;
  if work_phase is null or work_phase not in ('estimate','prep','tree','cleanup') or
     event_date is null or event_date < date '2000-01-01' or event_date > current_date + 1 or
     description is null or length(trim(description)) not between 1 and 10000 then
    raise exception 'Invalid phase activity' using errcode = '22023';
  end if;
  insert into public.events(organization_id,project_id,actor_id,phase,kind,work_date,message)
  values (org,target_project,auth.uid(),work_phase,'work',event_date,description) returning id into event_id;
  return event_id;
end $$;

-- Apply explicit grants, not Supabase default privileges. Events are trigger/RPC only.
revoke all on public.organizations, public.memberships, public.clients, public.workers,
  public.projects, public.project_assignments, public.job_phases, public.phase_assignments,
  public.visits, public.visit_assignments, public.tasks, public.task_assignments,
  public.notes, public.photos, public.events from anon, authenticated;
grant select on public.organizations, public.memberships, public.clients, public.workers,
  public.projects, public.project_assignments, public.job_phases, public.phase_assignments,
  public.visits, public.visit_assignments, public.tasks, public.task_assignments,
  public.notes, public.photos, public.events to authenticated;
-- Trusted server/operator only. Never ship this role's key to a browser.
grant select, insert, update, delete on public.organizations, public.memberships,
  public.clients, public.workers, public.projects, public.project_assignments,
  public.job_phases, public.phase_assignments, public.visits, public.visit_assignments,
  public.tasks, public.task_assignments, public.notes, public.photos, public.events to service_role;
grant insert, update, delete on public.clients, public.workers, public.project_assignments,
  public.job_phases, public.phase_assignments, public.visits, public.visit_assignments,
  public.tasks, public.task_assignments, public.notes to authenticated;
-- Restrict project writes by column: stage transitions must use the versioned RPC.
grant insert (organization_id,client_id,title,address,description) on public.projects to authenticated;
grant update (client_id,title,address,description) on public.projects to authenticated;
revoke all on function public.organization_role(uuid), public.is_org_admin(uuid),
  public.can_read_project(uuid,uuid), public.change_project_stage(uuid,text,date,bigint),
  public.record_phase_work(uuid,text,date,text), public.lock_record_scope(),
  public.reject_event_mutation(), public.version_project(), public.audit_project(),
  public.audit_phase() from public, anon, authenticated;
grant execute on function public.organization_role(uuid), public.is_org_admin(uuid),
  public.can_read_project(uuid,uuid), public.change_project_stage(uuid,text,date,bigint),
  public.record_phase_work(uuid,text,date,text) to authenticated;

commit;
