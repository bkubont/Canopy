begin;
alter table public.organization_invitations add column delivery_claimed_at timestamptz;
create function public.claim_invitation_delivery(actor uuid,invite uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations; r text; begin
  select * into i from public.organization_invitations where id=invite;
  perform 1 from public.organizations where id=i.organization_id for update;
  select * into i from public.organization_invitations where id=invite for update;
  select role into r from public.memberships where organization_id=i.organization_id and user_id=actor and active;
  if r is null or r not in ('owner','admin') or i.invited_by<>actor or (r='admin' and i.role='admin') then
    raise exception 'Invitation access denied' using errcode='42501'; end if;
  if i.status<>'pending' or i.expires_at<=now() or
     i.delivery_claimed_at>now()-interval '5 minutes' then return false; end if;
  update public.organization_invitations set delivery_claimed_at=now() where id=i.id;
  return true;
end $$;
revoke all on function public.claim_invitation_delivery(uuid,uuid) from public,anon,authenticated;
grant execute on function public.claim_invitation_delivery(uuid,uuid) to service_role;
commit;
