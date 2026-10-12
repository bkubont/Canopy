begin;
create function public.available_invitations()
returns table(id uuid,organization_name text,role text,expires_at timestamptz)
language sql stable security definer set search_path='' as $$
  select i.id,o.name,i.role,i.expires_at from public.organization_invitations i
  join public.organizations o on o.id=i.organization_id
  where i.invited_user_id=auth.uid() and i.status='sent' and i.expires_at>now()
$$;
create function public.correct_project_note(target_note uuid,new_body text,delete_note boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare n public.notes; begin
  select * into n from public.notes where id=target_note for update;
  if not found or not public.is_org_admin(n.organization_id) then raise exception 'Note access denied' using errcode='42501'; end if;
  if delete_note then delete from public.notes where id=n.id;
  else update public.notes set body=new_body where id=n.id; end if;
  insert into public.events(organization_id,project_id,actor_id,kind,work_date,message,action,payload)
  values(n.organization_id,n.project_id,auth.uid(),'activity',public.business_day(n.organization_id),
    'Note corrected',case when delete_note then 'note_deleted' else 'note_updated' end,jsonb_build_object('note_id',n.id));
end $$;
revoke all on function public.available_invitations(),public.correct_project_note(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.available_invitations(),public.correct_project_note(uuid,text,boolean) to authenticated;
commit;
