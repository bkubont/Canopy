begin;
create table public.organization_invitations(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  email text not null check(length(email)<=254 and email=lower(trim(email)) and position('@' in email)>1),
  role text not null check(role in ('admin','crew_lead','worker')),
  invited_by uuid not null,
  invited_user_id uuid references auth.users(id),
  status text not null default 'pending' check(status in ('pending','sent','accepted','revoked','failed')),
  expires_at timestamptz not null default now()+interval '7 days',
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  request_id uuid not null,
  unique(organization_id,request_id)
);
create unique index outstanding_invite_email on public.organization_invitations(organization_id,email)
  where status in ('pending','sent');
create table public.account_audit(
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  actor_id uuid not null,
  target_user_id uuid,
  action text not null,
  recorded_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);
alter table public.organization_invitations enable row level security;
alter table public.account_audit enable row level security;
create policy admin_read on public.organization_invitations for select to authenticated using(public.is_org_admin(organization_id));
create policy recipient_read on public.organization_invitations for select to authenticated
  using(invited_user_id=auth.uid() and status='sent' and expires_at>now());
create policy admin_read on public.account_audit for select to authenticated using(public.is_org_admin(organization_id));
revoke all on public.organization_invitations,public.account_audit from anon,authenticated;
grant select on public.organization_invitations,public.account_audit to authenticated;
grant select,insert,update,delete on public.organization_invitations,public.account_audit to service_role;
create trigger audit_immutable before update or delete on public.account_audit for each row execute function public.reject_event_mutation();
create trigger audit_no_truncate before truncate on public.account_audit for each statement execute function public.reject_event_mutation();

-- Service-only functions: the Edge handler verifies the actor with Auth.getUser.
-- Recheck privileges while locking the organization, so concurrent revocation wins safely.
create function public.prepare_organization_invitation(actor uuid,org uuid,invite_email text,invite_role text,request_id uuid)
returns public.organization_invitations language plpgsql security definer set search_path='' as $$
declare actor_role text; i public.organization_invitations; recent integer; begin
  perform 1 from public.organizations where id=org for update;
  select role into actor_role from public.memberships where organization_id=org and user_id=actor and active;
  if actor_role is null or actor_role not in ('owner','admin') or
    invite_role is null or invite_role not in ('admin','crew_lead','worker') or
    (actor_role='admin' and invite_role='admin') then raise exception 'Invitation access denied' using errcode='42501'; end if;
  select * into i from public.organization_invitations existing
    where existing.organization_id=org and existing.request_id=prepare_organization_invitation.request_id;
  if found then
    if i.invited_by<>actor or i.email<>lower(trim(invite_email)) or i.role<>invite_role then
      raise exception 'Request identifier already used' using errcode='22023'; end if;
    return i;
  end if;
  select count(*) into recent from public.organization_invitations where invited_by=actor and created_at>now()-interval '1 hour';
  if recent>=20 then raise exception 'Invitation rate limit reached' using errcode='54000'; end if;
  if exists(select 1 from public.memberships m join auth.users u on u.id=m.user_id
    where m.organization_id=org and m.active and lower(u.email)=lower(trim(invite_email))) then
    raise exception 'Account already belongs to this organization' using errcode='22023'; end if;
  update public.organization_invitations set status='revoked'
    where organization_id=org and email=lower(trim(invite_email)) and status in ('pending','sent') and expires_at<=now();
  insert into public.organization_invitations(organization_id,email,role,invited_by,request_id)
    values(org,lower(trim(invite_email)),invite_role,actor,request_id) returning * into i;
  insert into public.account_audit(organization_id,actor_id,action,payload)
    values(org,actor,'invitation_prepared',jsonb_build_object('invitation_id',i.id,'role',i.role));
  return i;
end $$;
create function public.finish_organization_invitation(actor uuid,invite uuid,invited_user uuid,delivered boolean)
returns void language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations; r text; begin
  select * into i from public.organization_invitations where id=invite;
  perform 1 from public.organizations where id=i.organization_id for update;
  select * into i from public.organization_invitations where id=invite for update;
  select role into r from public.memberships where organization_id=i.organization_id and user_id=actor and active;
  if not found or r not in ('owner','admin') or i.invited_by<>actor or (r='admin' and i.role='admin') then
    raise exception 'Invitation access denied' using errcode='42501'; end if;
  if i.status<>'pending' then return; end if;
  if delivered and not exists(select 1 from auth.users where id=invited_user and lower(email)=i.email) then
    raise exception 'Recipient mismatch' using errcode='22023'; end if;
  update public.organization_invitations set invited_user_id=case when delivered then invited_user end,
    status=case when delivered then 'sent' else 'failed' end where id=i.id;
end $$;
create function public.accept_organization_invitation(invite uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations; r text; begin
  select * into i from public.organization_invitations where id=invite;
  perform 1 from public.organizations where id=i.organization_id for update;
  select * into i from public.organization_invitations where id=invite for update;
  if not found or i.invited_user_id is distinct from auth.uid() then raise exception 'Invitation access denied' using errcode='42501'; end if;
  if i.status='accepted' then return i.organization_id; end if;
  if i.status<>'sent' or i.expires_at<=now() or not exists(select 1 from auth.users
    where id=auth.uid() and lower(email)=i.email and email_confirmed_at is not null) then
    raise exception 'Invitation expired or unverified' using errcode='42501'; end if;
  select role into r from public.memberships where organization_id=i.organization_id and user_id=i.invited_by and active;
  if r is null or r not in ('owner','admin') or (r='admin' and i.role='admin') then
    raise exception 'Inviter no longer authorized' using errcode='42501'; end if;
  -- Invitations never overwrite an existing membership or elevate its role.
  if exists(select 1 from public.memberships where organization_id=i.organization_id and user_id=auth.uid()) then
    raise exception 'Membership already exists; administrator action required' using errcode='22023'; end if;
  insert into public.memberships(organization_id,user_id,role) values(i.organization_id,auth.uid(),i.role);
  update public.organization_invitations set status='accepted',accepted_at=now() where id=i.id;
  insert into public.account_audit(organization_id,actor_id,target_user_id,action,payload)
    values(i.organization_id,auth.uid(),auth.uid(),'invitation_accepted',jsonb_build_object('invitation_id',i.id));
  return i.organization_id;
end $$;
create function public.admin_change_membership(actor uuid,org uuid,target_user uuid,new_role text,is_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare ar text; old public.memberships; begin
  perform 1 from public.organizations where id=org for update;
  select role into ar from public.memberships where organization_id=org and user_id=actor and active;
  select * into old from public.memberships where organization_id=org and user_id=target_user for update;
  if not found or ar is null or ar not in ('owner','admin') or new_role is null or is_active is null or
    new_role not in ('owner','admin','crew_lead','worker') or
    (ar='admin' and (old.role in ('owner','admin') or new_role in ('owner','admin'))) then
    raise exception 'Membership access denied' using errcode='42501'; end if;
  if old.role='owner' and old.active and (new_role<>'owner' or not is_active) and
    (select count(*) from public.memberships where organization_id=org and role='owner' and active)<=1 then
    raise exception 'Keep at least one active owner' using errcode='23514'; end if;
  update public.memberships set role=new_role,active=is_active where organization_id=org and user_id=target_user;
  -- Revoke outstanding invitations from a user who no longer administers the org.
  if not is_active or new_role not in ('owner','admin') then
    update public.organization_invitations set status='revoked' where organization_id=org and invited_by=target_user and status in ('pending','sent');
  end if;
  insert into public.account_audit(organization_id,actor_id,target_user_id,action,payload)
    values(org,actor,target_user,'membership_changed',jsonb_build_object('old_role',old.role,'role',new_role,'active',is_active));
end $$;
create function public.revoke_organization_invitation(actor uuid,invite uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations; r text; begin
  select * into i from public.organization_invitations where id=invite;
  perform 1 from public.organizations where id=i.organization_id for update;
  select role into r from public.memberships where organization_id=i.organization_id and user_id=actor and active;
  if r is null or r not in ('owner','admin') or (r='admin' and i.role='admin') then raise exception 'Invitation access denied' using errcode='42501'; end if;
  update public.organization_invitations set status='revoked' where id=i.id and status in ('pending','sent');
  insert into public.account_audit(organization_id,actor_id,action,payload)
    values(i.organization_id,actor,'invitation_revoked',jsonb_build_object('invitation_id',i.id));
end $$;
revoke all on function public.prepare_organization_invitation(uuid,uuid,text,text,uuid),
  public.finish_organization_invitation(uuid,uuid,uuid,boolean),public.accept_organization_invitation(uuid),
  public.admin_change_membership(uuid,uuid,uuid,text,boolean),public.revoke_organization_invitation(uuid,uuid)
  from public,anon,authenticated;
grant execute on function public.prepare_organization_invitation(uuid,uuid,text,text,uuid),
  public.finish_organization_invitation(uuid,uuid,uuid,boolean),public.admin_change_membership(uuid,uuid,uuid,text,boolean),
  public.revoke_organization_invitation(uuid,uuid) to service_role;
grant execute on function public.accept_organization_invitation(uuid) to authenticated;
commit;
