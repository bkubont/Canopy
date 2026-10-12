begin;
create function public.resolve_invitation_user(actor uuid,invite uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.organization_invitations; r text; result uuid; begin
  select * into i from public.organization_invitations where id=invite;
  select role into r from public.memberships where organization_id=i.organization_id and user_id=actor and active;
  if r is null or r not in ('owner','admin') or i.invited_by<>actor or (r='admin' and i.role='admin') then
    raise exception 'Invitation access denied' using errcode='42501'; end if;
  select id into result from auth.users where lower(email)=i.email;
  return result;
end $$;
revoke all on function public.resolve_invitation_user(uuid,uuid) from public,anon,authenticated;
grant execute on function public.resolve_invitation_user(uuid,uuid) to service_role;
commit;
