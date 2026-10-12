begin;
create function public.admin_team_members(org uuid)
returns table(user_id uuid,email text,display_name text,role text,active boolean)
language sql stable security definer set search_path='' as $$
  select m.user_id,u.email,p.display_name,m.role,m.active from public.memberships m
  join auth.users u on u.id=m.user_id join public.user_profiles p on p.user_id=m.user_id
  where m.organization_id=org and public.is_org_admin(org)
$$;
revoke all on function public.admin_team_members(uuid) from public,anon,authenticated;
grant execute on function public.admin_team_members(uuid) to authenticated;
commit;
