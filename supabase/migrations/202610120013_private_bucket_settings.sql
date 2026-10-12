begin;
-- A permissive policy elsewhere must not let a browser make this bucket public.
create policy canopy_no_bucket_insert on storage.buckets as restrictive for insert to anon,authenticated
  with check(id<>'canopy-photos');
create policy canopy_no_bucket_update on storage.buckets as restrictive for update to anon,authenticated
  using(id<>'canopy-photos') with check(id<>'canopy-photos');
create policy canopy_no_bucket_delete on storage.buckets as restrictive for delete to anon,authenticated
  using(id<>'canopy-photos');
commit;
