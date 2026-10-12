-- Supabase Storage must be initialized before this migration (enabled in local config).
begin;
alter table public.photos add column validation_status text not null default 'pending'
  check(validation_status in ('pending','verified','rejected'));
alter table public.photos add column author_id uuid;
alter table public.photos add column sha256 text check(sha256 ~ '^[0-9a-f]{64}$');
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('canopy-photos','canopy-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
  on conflict(id) do nothing;
do $$ begin
  if not exists(select 1 from storage.buckets where id='canopy-photos' and not public
    and file_size_limit=10485760 and allowed_mime_types=array['image/jpeg','image/png','image/webp']) then
    raise exception 'Existing Canopy bucket conflicts with required private configuration; review before upgrading' using errcode='23514';
  end if;
end $$;
-- Restrictive policies protect this bucket even if another permissive policy exists.
-- Bytes are server-only until the verified upload/download pipeline in the later photo stage.
-- This also prevents browser-created long-lived signed URLs and revocation bypass.
create policy canopy_no_direct_read on storage.objects as restrictive for select to anon,authenticated
  using(bucket_id<>'canopy-photos');
create policy canopy_no_direct_insert on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id<>'canopy-photos');
create policy canopy_no_direct_update on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id<>'canopy-photos') with check(bucket_id<>'canopy-photos');
create policy canopy_no_direct_delete on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id<>'canopy-photos');
commit;
