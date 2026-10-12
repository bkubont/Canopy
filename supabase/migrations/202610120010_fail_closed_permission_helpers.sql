begin;
-- SQL NULL must never bypass a PL/pgSQL `if not permitted` guard after revocation.
create or replace function public.belongs_to_crew(org uuid,crew uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.organization_role(org) in ('worker','crew_lead') and exists(
    select 1 from public.crew_memberships cm join public.workers w
    on w.organization_id=cm.organization_id and w.id=cm.worker_id
    where cm.organization_id=org and cm.crew_id=crew and w.user_id=auth.uid()),false)
$$;
create or replace function public.can_read_project(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.is_org_admin(org) or (
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
    )),false)
$$;
create or replace function public.can_lead_project(org uuid,project uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select coalesce(public.is_org_admin(org) or (public.organization_role(org)='crew_lead' and public.can_read_project(org,project)),false)
$$;
commit;
